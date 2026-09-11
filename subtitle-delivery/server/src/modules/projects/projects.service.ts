import { Db } from '../../db/db';
import { nowIso, uuid } from '../../common/timecode';

export class ProjectsService {
  constructor(private db: Db) {}

  async list() {
    return this.db.query(`SELECT * FROM projects ORDER BY created_at`);
  }

  async get(id: string) {
    const rows = await this.db.query(`SELECT * FROM projects WHERE id=$1`, [id]);
    if (!rows[0]) throw new Error(`项目不存在: ${id}`);
    const p = rows[0];
    return { ...p, target_languages: JSON.parse(p.target_languages) };
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
