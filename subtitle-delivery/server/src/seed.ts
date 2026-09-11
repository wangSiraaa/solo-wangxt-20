import * as fs from 'fs';
import * as path from 'path';
import { Db } from './db/db';
import { ProjectsService } from './modules/projects/projects.service';
import { VersionsService } from './modules/versions/versions.service';
import { GlossaryService } from './modules/glossary/glossary.service';
import { DeliveriesService } from './modules/deliveries/deliveries.service';
import { nowIso } from './common/timecode';

const PROJECT_ID = 'proj-midnight-train';

const SEED_TRANSLATIONS_EN: Record<number, string> = {
  1: 'Attention passengers, the last train is about to depart.',
  2: 'Please keep your ticket safe.',
  3: 'Conductor, the light in the cargo hold is still on.',
  4: "Leave it. We'll check when we arrive.",
  5: 'Did you hear the sound of the rails?',
  6: 'Like someone knocking.',
  7: 'That person on the platform was here last night too.',
  8: "Don't look back. Keep walking.",
};

function findSamplesDir(): string {
  const candidates = [
    path.join(process.cwd(), 'samples'),
    path.join(process.cwd(), '..', 'samples'),
    path.join(__dirname, '..', '..', 'samples'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'picture_v1.json'))) return dir;
  }
  throw new Error('找不到 samples 目录');
}

export function samplesDir() {
  return findSamplesDir();
}

/**
 * 启动种子：项目《午夜列车》第8集 + 术语表 + V1 画面导入 +
 * 英文译文（revision 1，时间轴检查全部通过）+ V1 英文交付包。
 * 这样制片一打开就能看到"已交付语言"，导入 V2 后即可查看影响面。
 */
export class SeedService {
  constructor(
    private db: Db,
    private projects: ProjectsService,
    private versions: VersionsService,
    private glossary: GlossaryService,
    private deliveries: DeliveriesService,
  ) {}

  async run() {
    const existing = await this.db.query(`SELECT id FROM projects LIMIT 1`);
    if (existing.length) return;

    const dir = findSamplesDir();
    await this.projects.create('《午夜列车》第8集', 'zh', ['en', 'ja'], PROJECT_ID);

    // 术语表（来自 samples/glossary.csv）
    const csv = fs
      .readFileSync(path.join(dir, 'glossary.csv'), 'utf-8')
      .trim()
      .split('\n')
      .slice(1);
    for (const line of csv) {
      const [language, source, target] = line.split(',');
      await this.glossary.addTerm(PROJECT_ID, language, source, target);
    }

    // 导入 V1 画面
    const v1 = JSON.parse(
      fs.readFileSync(path.join(dir, 'picture_v1.json'), 'utf-8'),
    );
    await this.versions.importVersion(PROJECT_ID, v1, '系统初始化');

    // 写入英文译文 r1，并标记 V1 全部时间轴检查通过
    const segs = await this.db.query(
      `SELECT id, seg_no FROM segments WHERE project_id=$1`,
      [PROJECT_ID],
    );
    for (const seg of segs) {
      const text = SEED_TRANSLATIONS_EN[seg.seg_no];
      if (text) {
        await this.db.query(
          `INSERT INTO segment_texts (segment_id, language, text, revision, updated_by, updated_at)
           VALUES ($1,'en',$2,1,'译员A',$3)`,
          [seg.id, text, nowIso()],
        );
      }
      await this.db.query(
        `UPDATE segment_timings SET timeline_check='passed', confirmed_by='校对员'
         WHERE segment_id=$1`,
        [seg.id],
      );
    }

    // V1 英文交付包（制片视角的基线）
    await this.deliveries.create(PROJECT_ID, 'en', '制片');

    console.log('[seed] 项目《午夜列车》第8集已初始化：V1 画面 + 英文交付基线');
  }
}
