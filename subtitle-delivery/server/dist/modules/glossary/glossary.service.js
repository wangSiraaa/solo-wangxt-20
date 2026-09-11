"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlossaryService = void 0;
const timecode_1 = require("../../common/timecode");
/** 术语表服务：在线术语表 + 交付时冻结快照 */
class GlossaryService {
    db;
    constructor(db) {
        this.db = db;
    }
    async listTerms(projectId, language) {
        if (language) {
            return this.db.query(`SELECT * FROM glossary_terms WHERE project_id=$1 AND language=$2 ORDER BY source`, [projectId, language]);
        }
        return this.db.query(`SELECT * FROM glossary_terms WHERE project_id=$1 ORDER BY language, source`, [projectId]);
    }
    async addTerm(projectId, language, source, target) {
        const id = (0, timecode_1.uuid)();
        await this.db.query(`INSERT INTO glossary_terms (id, project_id, language, source, target, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6)`, [id, projectId, language, source, target, (0, timecode_1.nowIso)()]);
        return { id };
    }
    /** 冻结当前术语表为快照，返回快照 id（交付包绑定用） */
    async snapshot(projectId) {
        const id = (0, timecode_1.uuid)();
        await this.db.tx(async (db) => {
            await db.query(`INSERT INTO glossary_snapshots (id, project_id, created_at) VALUES ($1,$2,$3)`, [id, projectId, (0, timecode_1.nowIso)()]);
            await db.query(`INSERT INTO glossary_snapshot_terms (snapshot_id, language, source, target)
         SELECT $1, language, source, target FROM glossary_terms WHERE project_id=$2`, [id, projectId]);
        });
        return id;
    }
    async getSnapshot(snapshotId) {
        const snap = (await this.db.query(`SELECT * FROM glossary_snapshots WHERE id=$1`, [snapshotId]))[0];
        if (!snap)
            throw new Error(`快照不存在: ${snapshotId}`);
        const terms = await this.db.query(`SELECT * FROM glossary_snapshot_terms WHERE snapshot_id=$1 ORDER BY language, source`, [snapshotId]);
        return { ...snap, terms };
    }
}
exports.GlossaryService = GlossaryService;
