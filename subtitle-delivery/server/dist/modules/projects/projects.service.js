"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectsService = void 0;
const timecode_1 = require("../../common/timecode");
class ProjectsService {
    db;
    constructor(db) {
        this.db = db;
    }
    async list() {
        return this.db.query(`SELECT * FROM projects ORDER BY created_at`);
    }
    async get(id) {
        const rows = await this.db.query(`SELECT * FROM projects WHERE id=$1`, [id]);
        if (!rows[0])
            throw new Error(`项目不存在: ${id}`);
        const p = rows[0];
        return { ...p, target_languages: JSON.parse(p.target_languages) };
    }
    async create(name, sourceLanguage, targetLanguages, id) {
        const pid = id ?? (0, timecode_1.uuid)();
        await this.db.query(`INSERT INTO projects (id, name, source_language, target_languages, created_at)
       VALUES ($1,$2,$3,$4,$5)`, [pid, name, sourceLanguage, JSON.stringify(targetLanguages), (0, timecode_1.nowIso)()]);
        return { id: pid };
    }
}
exports.ProjectsService = ProjectsService;
