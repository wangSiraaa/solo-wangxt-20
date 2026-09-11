"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectsService = void 0;
const timecode_1 = require("../../common/timecode");
class ProjectsService {
    db;
    constructor(db) {
        this.db = db;
    }
    /** target_languages 在库中是 JSON 字符串，对外统一解析为数组 */
    parseProject(p) {
        return {
            ...p,
            target_languages: typeof p.target_languages === 'string'
                ? JSON.parse(p.target_languages)
                : p.target_languages,
        };
    }
    async list() {
        const rows = await this.db.query(`SELECT * FROM projects ORDER BY created_at`);
        return rows.map((p) => this.parseProject(p));
    }
    async get(id) {
        const rows = await this.db.query(`SELECT * FROM projects WHERE id=$1`, [id]);
        if (!rows[0])
            throw new Error(`项目不存在: ${id}`);
        return this.parseProject(rows[0]);
    }
    async create(name, sourceLanguage, targetLanguages, id) {
        const pid = id ?? (0, timecode_1.uuid)();
        await this.db.query(`INSERT INTO projects (id, name, source_language, target_languages, created_at)
       VALUES ($1,$2,$3,$4,$5)`, [pid, name, sourceLanguage, JSON.stringify(targetLanguages), (0, timecode_1.nowIso)()]);
        return { id: pid };
    }
}
exports.ProjectsService = ProjectsService;
