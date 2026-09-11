import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { Db } from '../../db/db';
import { GlossaryService } from '../glossary/glossary.service';
import { msToSrt, nowIso, uuid } from '../../common/timecode';

export interface DeliveryGateFailure {
  code: 'GATE_FAILED';
  missingTranslations: number[];
  needsRetime: number[];
  openIssues: { segNo: number; type: string; note: string }[];
}

/**
 * 交付服务：生成交付包并跟踪交付后的影响面。
 *
 * 交付门禁：目标语言译文齐全、无待重打轴片段、无未解决校对问题。
 * 交付包绑定：当前画面版本 + 术语表快照 + 每条片段的译文/源文 revision，
 * 打包为 zip（SRT + glossary.csv + manifest.json）。
 * 影响分析：对比交付时冻结的 revision 与当前状态，告诉制片哪些改动
 * 影响了已交付语言（译文更新 / 源文变更 / 时间码变动 / 片段增删）。
 */
export class DeliveriesService {
  constructor(
    private db: Db,
    private glossary: GlossaryService,
  ) {}

  private deliveriesDir() {
    const dir = path.join(process.cwd(), 'data', 'deliveries');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async create(projectId: string, language: string, user: string) {
    const version = (
      await this.db.query(
        `SELECT * FROM picture_versions WHERE project_id=$1 ORDER BY version_no DESC LIMIT 1`,
        [projectId],
      )
    )[0];
    if (!version) throw new Error('项目还没有画面版本');

    const rows = await this.db.query(
      `SELECT s.id, s.seg_no, s.source_revision, t.start_ms, t.end_ms, t.timing_status,
              x.text AS tr_text, x.revision AS tr_revision
       FROM segments s
       JOIN segment_timings t ON t.segment_id=s.id AND t.picture_version_id=$1
       LEFT JOIN segment_texts x ON x.segment_id=s.id AND x.language=$2
       WHERE s.project_id=$3
       ORDER BY s.seg_no`,
      [version.id, language, projectId],
    );
    if (!rows.length) throw new Error('当前版本没有任何片段');

    // ---- 交付门禁 ----
    const missing = rows.filter((r: any) => !r.tr_text).map((r: any) => r.seg_no);
    const needsRetime = rows
      .filter((r: any) => r.timing_status !== 'valid')
      .map((r: any) => r.seg_no);
    const openIssues = await this.db.query(
      `SELECT i.type, i.note, s.seg_no FROM review_issues i
       JOIN segments s ON s.id=i.segment_id
       WHERE s.project_id=$1 AND i.language=$2 AND i.status='open'`,
      [projectId, language],
    );
    if (missing.length || needsRetime.length || openIssues.length) {
      const failure: DeliveryGateFailure = {
        code: 'GATE_FAILED',
        missingTranslations: missing,
        needsRetime,
        openIssues: openIssues.map((i: any) => ({
          segNo: i.seg_no,
          type: i.type,
          note: i.note,
        })),
      };
      const err: any = new Error('交付门禁未通过');
      err.gate = failure;
      throw err;
    }

    // ---- 绑定画面版本 + 术语表快照 ----
    const snapshotId = await this.glossary.snapshot(projectId);
    const deliveryId = uuid();
    const filePath = path.join(this.deliveriesDir(), `${deliveryId}.zip`);

    await this.db.tx(async (db) => {
      await db.query(
        `INSERT INTO deliveries (id, project_id, language, picture_version_id, glossary_snapshot_id, file_path, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [deliveryId, projectId, language, version.id, snapshotId, filePath, user, nowIso()],
      );
      for (const r of rows) {
        await db.query(
          `INSERT INTO delivery_items (delivery_id, segment_id, text_revision, source_revision, start_ms, end_ms)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [deliveryId, r.id, r.tr_revision, r.source_revision, r.start_ms, r.end_ms],
        );
      }
    });

    // ---- 生成 zip 交付包 ----
    const srt = rows
      .map(
        (r: any, i: number) =>
          `${i + 1}\n${msToSrt(r.start_ms)} --> ${msToSrt(r.end_ms)}\n${r.tr_text}\n`,
      )
      .join('\n');
    const snapshot = await this.glossary.getSnapshot(snapshotId);
    const glossaryCsv =
      'language,source,target\n' +
      snapshot.terms
        .map((t: any) => `${t.language},${t.source},${t.target}`)
        .join('\n') +
      '\n';
    const project = (
      await this.db.query(`SELECT * FROM projects WHERE id=$1`, [projectId])
    )[0];
    const manifest = {
      project: project.name,
      language,
      pictureVersion: { versionNo: version.version_no, label: version.label },
      glossarySnapshotId: snapshotId,
      segmentCount: rows.length,
      generatedBy: user,
      generatedAt: nowIso(),
    };

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', () => resolve());
      archive.on('error', reject);
      archive.pipe(output);
      archive.append(srt, { name: `subtitles_${language}.srt` });
      archive.append(glossaryCsv, { name: 'glossary.csv' });
      archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
      archive.finalize();
    });

    return this.get(deliveryId);
  }

  async list(projectId: string) {
    return this.db.query(
      `SELECT d.*, v.version_no, v.label AS version_label
       FROM deliveries d JOIN picture_versions v ON v.id=d.picture_version_id
       WHERE d.project_id=$1 ORDER BY d.created_at DESC`,
      [projectId],
    );
  }

  async get(deliveryId: string) {
    const rows = await this.db.query(
      `SELECT d.*, v.version_no, v.label AS version_label
       FROM deliveries d JOIN picture_versions v ON v.id=d.picture_version_id
       WHERE d.id=$1`,
      [deliveryId],
    );
    if (!rows[0]) throw new Error(`交付包不存在: ${deliveryId}`);
    return rows[0];
  }

  /**
   * 影响分析：交付之后发生的哪些改动影响了这个已交付语言。
   * 对比 delivery_items 冻结的 revision 与当前状态。
   */
  async impact(deliveryId: string) {
    const delivery = await this.get(deliveryId);
    const latest = (
      await this.db.query(
        `SELECT * FROM picture_versions WHERE project_id=$1 ORDER BY version_no DESC LIMIT 1`,
        [delivery.project_id],
      )
    )[0];
    const items = await this.db.query(
      `SELECT * FROM delivery_items WHERE delivery_id=$1`,
      [deliveryId],
    );
    const itemMap = new Map(items.map((i: any) => [i.segment_id, i]));

    const current = await this.db.query(
      `SELECT s.id, s.seg_no, s.source_revision, t.start_ms, t.end_ms, t.timing_status,
              x.revision AS tr_revision
       FROM segments s
       JOIN segment_timings t ON t.segment_id=s.id AND t.picture_version_id=$1
       LEFT JOIN segment_texts x ON x.segment_id=s.id AND x.language=$2
       WHERE s.project_id=$3
       ORDER BY s.seg_no`,
      [latest.id, delivery.language, delivery.project_id],
    );

    const affected: any[] = [];
    for (const seg of current) {
      const item: any = itemMap.get(seg.id);
      const changes: string[] = [];
      if (!item) {
        changes.push('新增片段（交付时不存在）');
      } else {
        if ((seg.tr_revision ?? 0) > item.text_revision)
          changes.push(`译文已更新 r${item.text_revision}→r${seg.tr_revision}`);
        if (seg.source_revision > item.source_revision)
          changes.push(`源文本变更 r${item.source_revision}→r${seg.source_revision}`);
        if (seg.start_ms !== item.start_ms || seg.end_ms !== item.end_ms)
          changes.push(
            `时间码变动 ${msToSrt(item.start_ms)}→${msToSrt(seg.start_ms)}`,
          );
        if (seg.timing_status !== 'valid') changes.push('待重打轴');
      }
      if (changes.length) {
        affected.push({ segNo: seg.seg_no, changes });
      }
    }
    const currentIds = new Set(current.map((c: any) => c.id));
    const removedSegs: number[] = [];
    for (const item of items) {
      if (!currentIds.has(item.segment_id)) {
        const seg = (
          await this.db.query(`SELECT seg_no FROM segments WHERE id=$1`, [
            item.segment_id,
          ])
        )[0];
        if (seg) removedSegs.push(seg.seg_no);
      }
    }

    return {
      deliveryId,
      language: delivery.language,
      deliveredAtVersion: delivery.version_no,
      currentVersion: latest.version_no,
      upToDate: affected.length === 0 && removedSegs.length === 0,
      affected,
      removed: removedSegs,
    };
  }
}
