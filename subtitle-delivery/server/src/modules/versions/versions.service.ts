import { Db } from '../../db/db';
import { nowIso, uuid } from '../../common/timecode';

export interface ImportShotDto {
  shotNo: number;
  inMs: number;
  outMs: number;
}

export interface ImportSegmentDto {
  segNo: number;
  startMs: number;
  endMs: number;
  sourceText: string;
}

export interface ImportVersionDto {
  label: string;
  shots: ImportShotDto[];
  segments: ImportSegmentDto[];
}

export interface ImportReport {
  versionId: string;
  versionNo: number;
  label: string;
  insertedShots: ImportShotDto[];
  removedShots: { shotNo: number; inMs: number; outMs: number }[];
  shifted: { segNo: number; deltaMs: number }[];
  textOnlyChanged: number[];
  added: number[];
  removed: number[];
  crossShot: number[];
  needsRetime: number[];
}

/**
 * 画面版本服务：导入新剪辑版本并与上一版本做差异分析。
 *
 * 规则：
 *  - 时间码发生变化的片段（如插入镜头导致整体偏移）→ timing_status=needs_retime，
 *    timeline_check 置为 invalidated，不能直接沿用旧时间码；
 *  - 仅源文字变化、时间码未动的片段 → 保留上一版本已通过的时间轴检查；
 *  - 片段时间范围跨越镜头边界的 → 标记 cross_shot，导入报告中给出警告。
 */
export class VersionsService {
  constructor(private db: Db) {}

  async listVersions(projectId: string) {
    return this.db.query(
      `SELECT * FROM picture_versions WHERE project_id=$1 ORDER BY version_no`,
      [projectId],
    );
  }

  async latestVersion(projectId: string) {
    const rows = await this.db.query(
      `SELECT * FROM picture_versions WHERE project_id=$1 ORDER BY version_no DESC LIMIT 1`,
      [projectId],
    );
    return rows[0] ?? null;
  }

  async importVersion(
    projectId: string,
    dto: ImportVersionDto,
    user: string,
  ): Promise<ImportReport> {
    if (!dto.shots?.length) throw new Error('导入内容缺少镜头列表 shots');
    if (!dto.segments?.length) throw new Error('导入内容缺少片段列表 segments');

    return this.db.tx(async (db) => {
      const prevRows = await db.query(
        `SELECT * FROM picture_versions WHERE project_id=$1 ORDER BY version_no DESC LIMIT 1`,
        [projectId],
      );
      const prev = prevRows[0] ?? null;
      const versionNo = prev ? prev.version_no + 1 : 1;
      const versionId = uuid();

      await db.query(
        `INSERT INTO picture_versions (id, project_id, version_no, label, created_at, imported_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [versionId, projectId, versionNo, dto.label, nowIso(), user],
      );

      const prevShots: any[] = prev
        ? await db.query(`SELECT * FROM shots WHERE picture_version_id=$1`, [prev.id])
        : [];

      const report: ImportReport = {
        versionId,
        versionNo,
        label: dto.label,
        insertedShots: [],
        removedShots: [],
        shifted: [],
        textOnlyChanged: [],
        added: [],
        removed: [],
        crossShot: [],
        needsRetime: [],
      };

      // ---- 镜头 diff ----
      // 剪辑后旧镜头会整体平移，入出点都变了，不能靠精确匹配判断。
      // 按时长顺序配对：能对上的视为平移的旧镜头，对不上的才是新插入镜头。
      const unmatchedPrev = [...prevShots];
      for (const shot of dto.shots) {
        const duration = shot.outMs - shot.inMs;
        const matchIdx = unmatchedPrev.findIndex(
          (s) => s.out_ms - s.in_ms === duration,
        );
        const isInsert = prev !== null && matchIdx === -1;
        if (matchIdx >= 0) unmatchedPrev.splice(matchIdx, 1);
        const changeType = isInsert ? 'inserted' : 'same';
        await db.query(
          `INSERT INTO shots (id, picture_version_id, shot_no, in_ms, out_ms, change_type)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [uuid(), versionId, shot.shotNo, shot.inMs, shot.outMs, changeType],
        );
        if (isInsert) report.insertedShots.push(shot);
      }
      report.removedShots = unmatchedPrev.map((s) => ({
        shotNo: s.shot_no,
        inMs: s.in_ms,
        outMs: s.out_ms,
      }));

      // ---- 片段 diff ----
      const seenSegNos = new Set<number>();
      for (const seg of dto.segments) {
        seenSegNos.add(seg.segNo);
        // 跨镜头：存在某个镜头的入点严格落在片段时间范围内部
        const crossShot = dto.shots.some(
          (sh) => sh.inMs > seg.startMs && sh.inMs < seg.endMs,
        );
        if (crossShot) report.crossShot.push(seg.segNo);

        const existingRows = await db.query(
          `SELECT * FROM segments WHERE project_id=$1 AND seg_no=$2`,
          [projectId, seg.segNo],
        );
        const existing = existingRows[0] ?? null;

        if (!existing) {
          await db.query(
            `INSERT INTO segments (id, project_id, seg_no, source_text, source_revision, cross_shot, created_in_version)
             VALUES ($1,$2,$3,$4,1,$5,$6)`,
            [uuid(), projectId, seg.segNo, seg.sourceText, crossShot, versionNo],
          );
          const segId = (
            await db.query(
              `SELECT id FROM segments WHERE project_id=$1 AND seg_no=$2`,
              [projectId, seg.segNo],
            )
          )[0].id;
          await db.query(
            `INSERT INTO segment_timings (segment_id, picture_version_id, start_ms, end_ms, timing_status, timeline_check)
             VALUES ($1,$2,$3,$4,'valid','pending')`,
            [segId, versionId, seg.startMs, seg.endMs],
          );
          report.added.push(seg.segNo);
          continue;
        }

        await db.query(`UPDATE segments SET cross_shot=$1 WHERE id=$2`, [
          crossShot,
          existing.id,
        ]);

        const prevTiming = prev
          ? (
              await db.query(
                `SELECT * FROM segment_timings WHERE segment_id=$1 AND picture_version_id=$2`,
                [existing.id, prev.id],
              )
            )[0] ?? null
          : null;

        const timingChanged =
          !prevTiming ||
          prevTiming.start_ms !== seg.startMs ||
          prevTiming.end_ms !== seg.endMs;
        const textChanged = existing.source_text !== seg.sourceText;

        if (textChanged) {
          await db.query(
            `UPDATE segments SET source_text=$1, source_revision=source_revision+1 WHERE id=$2`,
            [seg.sourceText, existing.id],
          );
        }

        let timingStatus: string;
        let timelineCheck: string;
        if (!prevTiming) {
          // 上一版本没有该片段的轴（曾被移除后又加回）：按新片段处理
          timingStatus = 'valid';
          timelineCheck = 'pending';
        } else if (timingChanged) {
          // 时间码变了（典型原因：前面插入了镜头）→ 旧时间码不可沿用，已通过的检查作废
          timingStatus = 'needs_retime';
          timelineCheck = 'invalidated';
          report.shifted.push({
            segNo: seg.segNo,
            deltaMs: seg.startMs - prevTiming.start_ms,
          });
          report.needsRetime.push(seg.segNo);
        } else {
          // 时间码未动（纯文字变更或无变化）→ 保留已通过的时间轴检查
          timingStatus = prevTiming.timing_status;
          timelineCheck = prevTiming.timeline_check;
          if (textChanged) report.textOnlyChanged.push(seg.segNo);
        }

        await db.query(
          `INSERT INTO segment_timings (segment_id, picture_version_id, start_ms, end_ms, timing_status, timeline_check)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [existing.id, versionId, seg.startMs, seg.endMs, timingStatus, timelineCheck],
        );
      }

      // 上一版本存在、本版本消失的片段
      if (prev) {
        const prevSegs = await db.query(
          `SELECT s.seg_no FROM segments s
           JOIN segment_timings t ON t.segment_id=s.id AND t.picture_version_id=$1
           WHERE s.project_id=$2`,
          [prev.id, projectId],
        );
        report.removed = prevSegs
          .map((r: any) => r.seg_no as number)
          .filter((n: number) => !seenSegNos.has(n));
      }

      return report;
    });
  }

  /** 双版本对照：片段在两个版本中的时间码、偏移与状态 */
  async compare(projectId: string, aNo: number, bNo: number) {
    const versions = await this.listVersions(projectId);
    const a = versions.find((v: any) => v.version_no === aNo);
    const b = versions.find((v: any) => v.version_no === bNo);
    if (!a || !b) throw new Error(`版本不存在: V${aNo} 或 V${bNo}`);

    const segs = await this.db.query(
      `SELECT * FROM segments WHERE project_id=$1 ORDER BY seg_no`,
      [projectId],
    );
    const timingsOf = async (versionId: string) => {
      const rows = await this.db.query(
        `SELECT * FROM segment_timings WHERE picture_version_id=$1`,
        [versionId],
      );
      const map = new Map<string, any>();
      for (const r of rows) map.set(r.segment_id, r);
      return map;
    };
    const ta = await timingsOf(a.id);
    const tb = await timingsOf(b.id);

    return {
      a: { versionNo: a.version_no, label: a.label },
      b: { versionNo: b.version_no, label: b.label },
      rows: segs
        .map((s: any) => {
          const ra = ta.get(s.id);
          const rb = tb.get(s.id);
          if (!ra && !rb) return null;
          return {
            segNo: s.seg_no,
            sourceText: s.source_text,
            sourceRevision: s.source_revision,
            crossShot: !!s.cross_shot,
            a: ra ? { startMs: ra.start_ms, endMs: ra.end_ms } : null,
            b: rb
              ? {
                  startMs: rb.start_ms,
                  endMs: rb.end_ms,
                  timingStatus: rb.timing_status,
                  timelineCheck: rb.timeline_check,
                }
              : null,
            deltaMs: ra && rb ? rb.start_ms - ra.start_ms : null,
            status: !ra ? 'added' : !rb ? 'removed' : 'kept',
          };
        })
        .filter(Boolean),
    };
  }
}
