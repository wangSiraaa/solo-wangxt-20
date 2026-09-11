import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import { makeContext, V1, V2, segmentIdByNo } from './helpers';

async function translateAll(ctx: any, lang: string) {
  for (const segNo of [1, 2, 3, 4, 5]) {
    const id = await segmentIdByNo(ctx, segNo);
    await ctx.segments.submit(id, lang, '译员A', `[${lang}] seg ${segNo}`, 0, `seed-${lang}-${segNo}`);
  }
}

describe('交付包：门禁、版本绑定与影响分析', () => {
  it('门禁：有待重打轴片段时拒绝交付并给出明细', async () => {
    const ctx = await makeContext();
    await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    await translateAll(ctx, 'en');
    await ctx.db.query(`UPDATE segment_timings SET timeline_check='passed'`);
    // 导入 V2 → 片段 3/4/5 待重打轴
    await ctx.versions.importVersion(ctx.projectId, V2, '测试');

    await expect(ctx.deliveries.create(ctx.projectId, 'en', '制片')).rejects.toMatchObject({
      gate: {
        code: 'GATE_FAILED',
        needsRetime: [3, 4, 5],
      },
    });
    await ctx.db.close();
  });

  it('交付包绑定画面版本与术语表快照，快照在术语表变更后保持不变', async () => {
    const ctx = await makeContext();
    await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    await translateAll(ctx, 'en');
    await ctx.db.query(`UPDATE segment_timings SET timeline_check='passed'`);
    await ctx.glossary.addTerm(ctx.projectId, 'en', '末班车', 'the last train');

    const delivery = await ctx.deliveries.create(ctx.projectId, 'en', '制片');
    expect(delivery.version_no).toBe(1);
    expect(fs.existsSync(delivery.file_path)).toBe(true);

    // 交付后修改术语表 → 快照不受影响
    await ctx.glossary.addTerm(ctx.projectId, 'en', '站台', 'platform');
    const snapshot = await ctx.glossary.getSnapshot(delivery.glossary_snapshot_id);
    expect(snapshot.terms).toHaveLength(1);
    expect(snapshot.terms[0]).toMatchObject({ source: '末班车', target: 'the last train' });
    await ctx.db.close();
  });

  it('影响分析：译文更新、源文变更、时间码变动都能追溯到已交付语言', async () => {
    const ctx = await makeContext();
    await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    await translateAll(ctx, 'en');
    await ctx.db.query(`UPDATE segment_timings SET timeline_check='passed'`);
    const delivery = await ctx.deliveries.create(ctx.projectId, 'en', '制片');

    // 交付时是最新的
    let impact = await ctx.deliveries.impact(delivery.id);
    expect(impact.upToDate).toBe(true);

    // 1) 交付后有人更新了片段1的译文
    const seg1 = await segmentIdByNo(ctx, 1);
    await ctx.segments.submit(seg1, 'en', '译员B', 'Revised translation', 1, 'rev-1');

    // 2) 导入 V2：片段2 源文变更；片段 3/4/5 时间码偏移且待重打轴；片段6 新增
    await ctx.versions.importVersion(ctx.projectId, V2, '测试');

    impact = await ctx.deliveries.impact(delivery.id);
    expect(impact.upToDate).toBe(false);
    expect(impact.deliveredAtVersion).toBe(1);
    expect(impact.currentVersion).toBe(2);

    const bySeg = new Map(impact.affected.map((a: any) => [a.segNo, a.changes]));
    expect(bySeg.get(1).join()).toContain('译文已更新');
    expect(bySeg.get(2).join()).toContain('源文本变更');
    expect(bySeg.get(3).join()).toContain('时间码变动');
    expect(bySeg.get(3).join()).toContain('待重打轴');
    expect(bySeg.get(6).join()).toContain('新增片段');
    await ctx.db.close();
  });

  it('重打轴确认后可交付，且交付基于最新画面版本', async () => {
    const ctx = await makeContext();
    await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    await translateAll(ctx, 'en');
    await ctx.db.query(`UPDATE segment_timings SET timeline_check='passed'`);
    await ctx.versions.importVersion(ctx.projectId, V2, '测试');

    // 新增片段6 还没有译文 → 门禁拦截
    await expect(ctx.deliveries.create(ctx.projectId, 'en', '制片')).rejects.toMatchObject({
      gate: { missingTranslations: [6] },
    });
    const seg6 = await segmentIdByNo(ctx, 6);
    await ctx.segments.submit(seg6, 'en', '译员A', 'This city never sleeps.', 0, 'seg6-en');

    // 重打轴确认 3/4/5
    for (const segNo of [3, 4, 5]) {
      await ctx.segments.retime(await segmentIdByNo(ctx, segNo), '校对');
    }

    const delivery = await ctx.deliveries.create(ctx.projectId, 'en', '制片');
    expect(delivery.version_no).toBe(2);
    await ctx.db.close();
  });
});
