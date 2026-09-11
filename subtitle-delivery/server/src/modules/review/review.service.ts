import { Db } from '../../db/db';
import { nowIso, uuid } from '../../common/timecode';

/** 校对服务：术语与时间轴问题标记 */
export class ReviewService {
  constructor(private db: Db) {}

  async list(projectId: string, language?: string, status?: string) {
    const cond: string[] = ['s.project_id=$1'];
    const params: any[] = [projectId];
    if (language) {
      params.push(language);
      cond.push(`i.language=$${params.length}`);
    }
    if (status) {
      params.push(status);
      cond.push(`i.status=$${params.length}`);
    }
    return this.db.query(
      `SELECT i.*, s.seg_no, s.source_text
       FROM review_issues i JOIN segments s ON s.id=i.segment_id
       WHERE ${cond.join(' AND ')}
       ORDER BY i.created_at DESC`,
      params,
    );
  }

  async create(
    segmentId: string,
    language: string,
    type: 'terminology' | 'timeline',
    note: string,
    user: string,
  ) {
    if (!['terminology', 'timeline'].includes(type)) {
      throw new Error('问题类型必须是 terminology 或 timeline');
    }
    const id = uuid();
    await this.db.query(
      `INSERT INTO review_issues (id, segment_id, language, type, note, status, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,'open',$6,$7)`,
      [id, segmentId, language, type, note, user, nowIso()],
    );
    return { id };
  }

  async resolve(issueId: string, user: string) {
    const rows = await this.db.query(
      `SELECT * FROM review_issues WHERE id=$1`,
      [issueId],
    );
    if (!rows[0]) throw new Error(`问题不存在: ${issueId}`);
    await this.db.query(
      `UPDATE review_issues SET status='resolved', resolved_by=$1, resolved_at=$2 WHERE id=$3`,
      [user, nowIso(), issueId],
    );
    return { id: issueId, status: 'resolved' };
  }
}
