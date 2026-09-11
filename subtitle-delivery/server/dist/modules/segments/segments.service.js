"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SegmentsService = void 0;
const timecode_1 = require("../../common/timecode");
/**
 * 片段服务：领取、提交、冲突解决、重打轴。
 *
 * 并发规则：提交时必须带上编辑时看到的 baseRevision。
 *  - baseRevision == 当前 revision → 直接合并，revision+1；
 *  - 不一致（他人已先合并）→ 生成 conflict 记录，必须显式解决
 *    （take_mine / take_current / merge），不允许静默覆盖。
 *
 * 幂等：客户端为每次编辑会话生成 idempotencyKey，重复提交（双击、重试、
 * 网络重发）返回首次提交的结果，不产生重复 revision。
 */
class SegmentsService {
    db;
    constructor(db) {
        this.db = db;
    }
    async list(projectId, language, versionNo) {
        const version = versionNo
            ? (await this.db.query(`SELECT * FROM picture_versions WHERE project_id=$1 AND version_no=$2`, [projectId, versionNo]))[0]
            : (await this.db.query(`SELECT * FROM picture_versions WHERE project_id=$1 ORDER BY version_no DESC LIMIT 1`, [projectId]))[0];
        if (!version)
            return { version: null, rows: [] };
        const rows = await this.db.query(`SELECT s.id, s.seg_no, s.source_text, s.source_revision, s.cross_shot,
              t.start_ms, t.end_ms, t.timing_status, t.timeline_check, t.confirmed_by,
              x.text AS tr_text, x.revision AS tr_revision, x.updated_by AS tr_updated_by,
              a.assignee AS claimed_by,
              (SELECT COUNT(*) FROM review_issues i
                WHERE i.segment_id=s.id AND i.language=$2 AND i.status='open') AS open_issues
       FROM segments s
       JOIN segment_timings t ON t.segment_id=s.id AND t.picture_version_id=$1
       LEFT JOIN segment_texts x ON x.segment_id=s.id AND x.language=$2
       LEFT JOIN assignments a ON a.segment_id=s.id AND a.language=$2 AND a.status='claimed'
       WHERE s.project_id=$3
       ORDER BY s.seg_no`, [version.id, language, projectId]);
        return { version, rows };
    }
    async getSegment(id) {
        const rows = await this.db.query(`SELECT * FROM segments WHERE id=$1`, [id]);
        if (!rows[0])
            throw new Error(`片段不存在: ${id}`);
        return rows[0];
    }
    async claim(segmentId, language, user) {
        await this.getSegment(segmentId);
        const active = await this.db.query(`SELECT * FROM assignments WHERE segment_id=$1 AND language=$2 AND status='claimed'`, [segmentId, language]);
        if (active[0]) {
            if (active[0].assignee === user)
                return active[0];
            const err = new Error(`片段已被 ${active[0].assignee} 领取`);
            err.code = 'ALREADY_CLAIMED';
            err.claimedBy = active[0].assignee;
            throw err;
        }
        const id = (0, timecode_1.uuid)();
        await this.db.query(`INSERT INTO assignments (id, segment_id, language, assignee, status, claimed_at)
       VALUES ($1,$2,$3,$4,'claimed',$5)`, [id, segmentId, language, user, (0, timecode_1.nowIso)()]);
        return { id, segmentId, language, assignee: user };
    }
    async release(segmentId, language, user) {
        await this.db.query(`UPDATE assignments SET status='released'
       WHERE segment_id=$1 AND language=$2 AND status='claimed' AND assignee=$3`, [segmentId, language, user]);
    }
    async submit(segmentId, language, author, text, baseRevision, idempotencyKey) {
        await this.getSegment(segmentId);
        return this.db.tx(async (db) => {
            // 幂等：同一 idempotencyKey 重复提交直接返回首次结果
            if (idempotencyKey) {
                const dup = await db.query(`SELECT * FROM submissions WHERE idempotency_key=$1`, [idempotencyKey]);
                if (dup[0]) {
                    const s = dup[0];
                    if (s.status === 'merged') {
                        const cur = await db.query(`SELECT revision FROM segment_texts WHERE segment_id=$1 AND language=$2`, [segmentId, language]);
                        return {
                            status: 'merged',
                            revision: cur[0]?.revision ?? s.base_revision + 1,
                            submissionId: s.id,
                            deduplicated: true,
                        };
                    }
                    const c = await db.query(`SELECT * FROM conflicts WHERE submission_id=$1 ORDER BY created_at DESC LIMIT 1`, [s.id]);
                    const cur = await db.query(`SELECT * FROM segment_texts WHERE segment_id=$1 AND language=$2`, [segmentId, language]);
                    return {
                        status: 'conflict',
                        conflictId: c[0]?.id,
                        submissionId: s.id,
                        currentText: cur[0]?.text ?? null,
                        currentRevision: cur[0]?.revision ?? 0,
                        currentUpdatedBy: cur[0]?.updated_by ?? null,
                    };
                }
            }
            const curRows = await db.query(`SELECT * FROM segment_texts WHERE segment_id=$1 AND language=$2`, [segmentId, language]);
            const current = curRows[0] ?? null;
            const currentRevision = current ? current.revision : 0;
            const submissionId = (0, timecode_1.uuid)();
            if (baseRevision === currentRevision) {
                const newRevision = currentRevision + 1;
                await db.query(`INSERT INTO segment_texts (segment_id, language, text, revision, updated_by, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (segment_id, language)
           DO UPDATE SET text=$3, revision=$4, updated_by=$5, updated_at=$6`, [segmentId, language, text, newRevision, author, (0, timecode_1.nowIso)()]);
                await db.query(`INSERT INTO submissions (id, segment_id, language, author, text, base_revision, status, idempotency_key, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,'merged',$7,$8)`, [submissionId, segmentId, language, author, text, baseRevision, idempotencyKey ?? null, (0, timecode_1.nowIso)()]);
                await this.autoTerminologyCheck(db, segmentId, language, text, author);
                return { status: 'merged', revision: newRevision, submissionId };
            }
            // 他人已合并了新版本 → 冲突，必须显式解决
            await db.query(`INSERT INTO submissions (id, segment_id, language, author, text, base_revision, status, idempotency_key, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,'conflicted',$7,$8)`, [submissionId, segmentId, language, author, text, baseRevision, idempotencyKey ?? null, (0, timecode_1.nowIso)()]);
            const conflictId = (0, timecode_1.uuid)();
            await db.query(`INSERT INTO conflicts (id, segment_id, language, submission_id, current_revision, status, created_at)
         VALUES ($1,$2,$3,$4,$5,'open',$6)`, [conflictId, segmentId, language, submissionId, currentRevision, (0, timecode_1.nowIso)()]);
            return {
                status: 'conflict',
                conflictId,
                submissionId,
                currentText: current?.text ?? null,
                currentRevision,
                currentUpdatedBy: current?.updated_by ?? null,
            };
        });
    }
    /** 提交后自动术语检查：源文含术语源词但译文未用约定译法 → 生成术语问题 */
    async autoTerminologyCheck(db, segmentId, language, text, author) {
        const seg = await db.query(`SELECT * FROM segments WHERE id=$1`, [segmentId]);
        const terms = await db.query(`SELECT * FROM glossary_terms WHERE project_id=$1 AND language=$2`, [seg[0].project_id, language]);
        for (const term of terms) {
            if (seg[0].source_text.includes(term.source) &&
                !text.toLowerCase().includes(term.target.toLowerCase())) {
                const note = `术语「${term.source}」应译为「${term.target}」`;
                const existing = await db.query(`SELECT id FROM review_issues
           WHERE segment_id=$1 AND language=$2 AND type='terminology' AND status='open' AND note=$3`, [segmentId, language, note]);
                if (!existing[0]) {
                    await db.query(`INSERT INTO review_issues (id, segment_id, language, type, note, status, created_by, created_at)
             VALUES ($1,$2,$3,'terminology',$4,'open',$5,$6)`, [(0, timecode_1.uuid)(), segmentId, language, note, `自动检查(${author})`, (0, timecode_1.nowIso)()]);
                }
            }
        }
    }
    async listConflicts(projectId, status = 'open') {
        return this.db.query(`SELECT c.*, s.seg_no, sub.text AS submitted_text, sub.author AS submitted_by,
              x.text AS current_text, x.updated_by AS current_by
       FROM conflicts c
       JOIN segments s ON s.id=c.segment_id
       JOIN submissions sub ON sub.id=c.submission_id
       LEFT JOIN segment_texts x ON x.segment_id=c.segment_id AND x.language=c.language
       WHERE s.project_id=$1 AND c.status=$2
       ORDER BY c.created_at DESC`, [projectId, status]);
    }
    async resolveConflict(conflictId, strategy, mergedText, user) {
        return this.db.tx(async (db) => {
            const rows = await db.query(`SELECT * FROM conflicts WHERE id=$1`, [conflictId]);
            const conflict = rows[0];
            if (!conflict)
                throw new Error(`冲突不存在: ${conflictId}`);
            if (conflict.status !== 'open') {
                const err = new Error('冲突已被解决，请刷新查看最新状态');
                err.code = 'ALREADY_RESOLVED';
                throw err;
            }
            const sub = (await db.query(`SELECT * FROM submissions WHERE id=$1`, [conflict.submission_id]))[0];
            const cur = (await db.query(`SELECT * FROM segment_texts WHERE segment_id=$1 AND language=$2`, [conflict.segment_id, conflict.language]))[0] ?? null;
            const currentRevision = cur ? cur.revision : 0;
            if (strategy === 'take_current') {
                await db.query(`UPDATE submissions SET status='rejected' WHERE id=$1`, [sub.id]);
            }
            else {
                const finalText = strategy === 'merge' ? mergedText : sub.text;
                if (!finalText)
                    throw new Error('合并策略需要提供 mergedText');
                await db.query(`INSERT INTO segment_texts (segment_id, language, text, revision, updated_by, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (segment_id, language)
           DO UPDATE SET text=$3, revision=$4, updated_by=$5, updated_at=$6`, [conflict.segment_id, conflict.language, finalText, currentRevision + 1, user, (0, timecode_1.nowIso)()]);
                await db.query(`UPDATE submissions SET status='merged' WHERE id=$1`, [sub.id]);
                await this.autoTerminologyCheck(db, conflict.segment_id, conflict.language, finalText, user);
            }
            await db.query(`UPDATE conflicts SET status='resolved', resolution=$1, resolved_by=$2, resolved_at=$3 WHERE id=$4`, [strategy, user, (0, timecode_1.nowIso)(), conflictId]);
            // 同一片段语言的其他未决冲突：基准已过期，标记为 superseded
            const others = await db.query(`SELECT * FROM conflicts WHERE segment_id=$1 AND language=$2 AND status='open' AND id<>$3`, [conflict.segment_id, conflict.language, conflictId]);
            for (const o of others) {
                await db.query(`UPDATE conflicts SET status='resolved', resolution='superseded', resolved_by=$1, resolved_at=$2 WHERE id=$3`, [user, (0, timecode_1.nowIso)(), o.id]);
                await db.query(`UPDATE submissions SET status='superseded' WHERE id=$1`, [
                    o.submission_id,
                ]);
            }
            return { conflictId, strategy, status: 'resolved' };
        });
    }
    /** 重打轴 / 确认新时间码：确认后 timing_status=valid 且时间轴检查通过 */
    async retime(segmentId, user, startMs, endMs) {
        const seg = await this.getSegment(segmentId);
        const version = (await this.db.query(`SELECT * FROM picture_versions WHERE project_id=$1 ORDER BY version_no DESC LIMIT 1`, [seg.project_id]))[0];
        const timing = (await this.db.query(`SELECT * FROM segment_timings WHERE segment_id=$1 AND picture_version_id=$2`, [segmentId, version.id]))[0];
        if (!timing)
            throw new Error('当前版本没有该片段的时间轴');
        await this.db.query(`UPDATE segment_timings
       SET start_ms=$1, end_ms=$2, timing_status='valid', timeline_check='passed', confirmed_by=$3
       WHERE segment_id=$4 AND picture_version_id=$5`, [
            startMs ?? timing.start_ms,
            endMs ?? timing.end_ms,
            user,
            segmentId,
            version.id,
        ]);
        return { segmentId, status: 'valid', timelineCheck: 'passed' };
    }
}
exports.SegmentsService = SegmentsService;
