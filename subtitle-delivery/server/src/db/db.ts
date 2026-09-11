/**
 * 数据库抽象层。
 * 默认使用 PGlite（真正的 PostgreSQL WASM 构建，数据持久化在 server/data/pg），
 * 设置 DATABASE_URL 环境变量后切换为真实的 PostgreSQL（见 docker-compose.yml）。
 */
import { PGlite } from '@electric-sql/pglite';
import * as fs from 'fs';
import * as path from 'path';
import { SCHEMA_SQL } from './schema';

export interface Db {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const DB = Symbol('DB');

class PgLiteDb implements Db {
  constructor(private pg: any) {}

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const res = await this.pg.query(sql, params);
    return res.rows as T[];
  }

  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    return this.pg.transaction(async (tx: any) => fn(new PgLiteDb(tx)));
  }

  async close(): Promise<void> {
    await this.pg.close();
  }
}

class PgDb implements Db {
  private pool: any;

  constructor(private client: any, private ownsPool: boolean) {
    this.pool = client;
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const res = await this.pool.query(sql, params);
    return res.rows as T[];
  }

  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(new PgDb(client, false));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end();
  }
}

export async function createDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  let db: Db;
  if (url) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool } = require('pg');
    db = new PgDb(new Pool({ connectionString: url }), true);
  } else {
    const dataDir =
      process.env.PGDATA_DIR || path.join(process.cwd(), 'data', 'pg');
    fs.mkdirSync(dataDir, { recursive: true });
    const pg = new PGlite(dataDir);
    if (pg.waitReady) await pg.waitReady;
    db = new PgLiteDb(pg);
  }
  await migrate(db);
  return db;
}

async function migrate(db: Db): Promise<void> {
  // 逐条执行，兼容两种驱动
  const statements = SCHEMA_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    await db.query(stmt);
  }
}
