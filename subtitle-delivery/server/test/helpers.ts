import { PGlite } from '@electric-sql/pglite';
import { Db } from '../src/db/db';
import { SCHEMA_SQL } from '../src/db/schema';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { VersionsService, ImportVersionDto } from '../src/modules/versions/versions.service';
import { SegmentsService } from '../src/modules/segments/segments.service';
import { GlossaryService } from '../src/modules/glossary/glossary.service';
import { ReviewService } from '../src/modules/review/review.service';
import { DeliveriesService } from '../src/modules/deliveries/deliveries.service';

class MemoryDb implements Db {
  constructor(private pg: PGlite) {}
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const res = await this.pg.query(sql, params);
    return res.rows as T[];
  }
  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    return (this.pg as any).transaction(async (tx: any) => fn(new MemoryDb(tx)));
  }
  async close(): Promise<void> {
    await this.pg.close();
  }
}

export interface TestContext {
  db: Db;
  projects: ProjectsService;
  versions: VersionsService;
  segments: SegmentsService;
  glossary: GlossaryService;
  review: ReviewService;
  deliveries: DeliveriesService;
  projectId: string;
}

/** 每个测试用独立的内存 PGlite，避免互相污染 */
export async function makeContext(): Promise<TestContext> {
  const pg = new PGlite();
  await (pg as any).waitReady;
  const db = new MemoryDb(pg);
  for (const stmt of SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.query(stmt);
  }
  const projects = new ProjectsService(db);
  const versions = new VersionsService(db);
  const segments = new SegmentsService(db);
  const glossary = new GlossaryService(db);
  const review = new ReviewService(db);
  const deliveries = new DeliveriesService(db, glossary);
  const projectId = 'test-project';
  await db.query(
    `INSERT INTO projects (id, name, source_language, target_languages, created_at)
     VALUES ($1,'测试项目','zh','["en","ja"]','2026-01-01T00:00:00.000Z')`,
    [projectId],
  );
  return { db, projects, versions, segments, glossary, review, deliveries, projectId };
}

export const V1: ImportVersionDto = {
  label: 'V1 初剪',
  shots: [
    { shotNo: 1, inMs: 0, outMs: 30000 },
    { shotNo: 2, inMs: 30000, outMs: 65000 },
    { shotNo: 3, inMs: 65000, outMs: 100000 },
  ],
  segments: [
    { segNo: 1, startMs: 2000, endMs: 6000, sourceText: '各位乘客，末班车即将发车。' },
    { segNo: 2, startMs: 8000, endMs: 12000, sourceText: '请保管好您的车票。' },
    { segNo: 3, startMs: 32000, endMs: 36000, sourceText: '列车长，货舱的灯还亮着。' },
    { segNo: 4, startMs: 63000, endMs: 67000, sourceText: '你听到铁轨的声音了吗？' }, // 跨镜头：横跨 65000 边界
    { segNo: 5, startMs: 70000, endMs: 75000, sourceText: '像有人在敲。' },
  ],
};

/** 在 V1 基础上：30s 处插入 12s 镜头，后续片段整体 +12s；片段2 仅改文字 */
export const V2: ImportVersionDto = {
  label: 'V2 导演剪辑',
  shots: [
    { shotNo: 1, inMs: 0, outMs: 30000 },
    { shotNo: 2, inMs: 30000, outMs: 42000 }, // 新插入的镜头
    { shotNo: 3, inMs: 42000, outMs: 77000 },
    { shotNo: 4, inMs: 77000, outMs: 112000 },
  ],
  segments: [
    V1.segments[0],
    { ...V1.segments[1], sourceText: '请保管好您的车票和随身物品。' }, // 仅文字变更
    { ...V1.segments[2], startMs: 44000, endMs: 48000 },
    { ...V1.segments[3], startMs: 75000, endMs: 79000 }, // 仍跨镜头（77000 边界）
    { ...V1.segments[4], startMs: 82000, endMs: 87000 },
    { segNo: 6, startMs: 34000, endMs: 38000, sourceText: '这座城市从不睡觉。' }, // 新增
  ],
};

export async function segmentIdByNo(ctx: TestContext, segNo: number): Promise<string> {
  const rows = await ctx.db.query(
    `SELECT id FROM segments WHERE project_id=$1 AND seg_no=$2`,
    [ctx.projectId, segNo],
  );
  return rows[0].id;
}

export async function timingOf(ctx: TestContext, segNo: number, versionNo: number) {
  const rows = await ctx.db.query(
    `SELECT t.* FROM segment_timings t
     JOIN segments s ON s.id=t.segment_id
     JOIN picture_versions v ON v.id=t.picture_version_id
     WHERE s.project_id=$1 AND s.seg_no=$2 AND v.version_no=$3`,
    [ctx.projectId, segNo, versionNo],
  );
  return rows[0] ?? null;
}
