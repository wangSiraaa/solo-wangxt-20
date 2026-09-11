"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DB = void 0;
exports.createDb = createDb;
/**
 * 数据库抽象层。
 * 默认使用 PGlite（真正的 PostgreSQL WASM 构建，数据持久化在 server/data/pg），
 * 设置 DATABASE_URL 环境变量后切换为真实的 PostgreSQL（见 docker-compose.yml）。
 */
const pglite_1 = require("@electric-sql/pglite");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const schema_1 = require("./schema");
exports.DB = Symbol('DB');
class PgLiteDb {
    pg;
    constructor(pg) {
        this.pg = pg;
    }
    async query(sql, params = []) {
        const res = await this.pg.query(sql, params);
        return res.rows;
    }
    async tx(fn) {
        return this.pg.transaction(async (tx) => fn(new PgLiteDb(tx)));
    }
    async close() {
        await this.pg.close();
    }
}
class PgDb {
    client;
    ownsPool;
    pool;
    constructor(client, ownsPool) {
        this.client = client;
        this.ownsPool = ownsPool;
        this.pool = client;
    }
    async query(sql, params = []) {
        const res = await this.pool.query(sql, params);
        return res.rows;
    }
    async tx(fn) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await fn(new PgDb(client, false));
            await client.query('COMMIT');
            return result;
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
    async close() {
        if (this.ownsPool)
            await this.pool.end();
    }
}
async function createDb() {
    const url = process.env.DATABASE_URL;
    let db;
    if (url) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Pool } = require('pg');
        db = new PgDb(new Pool({ connectionString: url }), true);
    }
    else {
        const dataDir = process.env.PGDATA_DIR || path.join(process.cwd(), 'data', 'pg');
        fs.mkdirSync(dataDir, { recursive: true });
        const pg = new pglite_1.PGlite(dataDir);
        if (pg.waitReady)
            await pg.waitReady;
        db = new PgLiteDb(pg);
    }
    await migrate(db);
    return db;
}
async function migrate(db) {
    // 逐条执行，兼容两种驱动
    const statements = schema_1.SCHEMA_SQL.split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    for (const stmt of statements) {
        await db.query(stmt);
    }
}
