import { Db } from '../../db/db';
import { nowIso, uuid } from '../../common/timecode';

export class ProjectsService {
  constructor(private db: Db) {}

  /** target_languages 在库中是 JSON 字符串，对外统一解析为数组 */
  private parseProject(p: any) {
    return {
      ...p,
      target_languages:
        typeof p.target_languages === 'string'
          ? JSON.parse(p.target_languages)
          : p.target_languages,
    };
  }

  async list() {
    const rows = await this.db.query(
      `SELECT * FROM projects ORDER BY created_at`,
    );
    return rows.map((p: any) => this.parseProject(p));
  }

  async get(id: string) {
    const rows = await this.db.query(`SELECT * FROM projects WHERE id=$1`, [id]);
    if (!rows[0]) throw new Error(`项目不存在: ${id}`);
    return this.parseProject(rows[0]);
  }

  async create(
    name: string,
    sourceLanguage: string,
    targetLanguages: string[],
    id?: string,
  ) {
    const pid = id ?? uuid();
    await this.db.query(
      `INSERT INTO projects (id, name, source_language, target_languages, created_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [pid, name, sourceLanguage, JSON.stringify(targetLanguages), nowIso()],
    );
    return { id: pid };
  }
}
