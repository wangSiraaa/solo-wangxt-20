import { describe, expect, it } from 'vitest';
import { makeContext, V1, V2, timingOf } from './helpers';

describe('画面版本导入与 diff', () => {
  it('V1 导入：片段与镜头建立，时间轴检查为 pending', async () => {
    const ctx = await makeContext();
    const report = await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    expect(report.versionNo).toBe(1);
    expect(report.added).toEqual([1, 2, 3, 4, 5]);
    // 片段4 在 V1 就横跨 65000 的镜头边界
    expect(report.crossShot).toEqual([4]);
    const t = await timingOf(ctx, 1, 1);
    expect(t.timing_status).toBe('valid');
    expect(t.timeline_check).toBe('pending');
    await ctx.db.close();
  });

  it('插入镜头后：后续片段时间码失效，不能直接沿用旧时间码', async () => {
    const ctx = await makeContext();
    await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    // 模拟 V1 全部通过时间轴检查
    await ctx.db.query(`UPDATE segment_timings SET timeline_check='passed'`);

    const report = await ctx.versions.importVersion(ctx.projectId, V2, '测试');

    // 插入了一个 12s 镜头
    expect(report.insertedShots).toHaveLength(1);
    expect(report.insertedShots[0]).toMatchObject({ inMs: 30000, outMs: 42000 });
    // 插入点之后的片段 3/4/5 整体偏移 +12s
    expect(report.shifted).toEqual([
      { segNo: 3, deltaMs: 12000 },
      { segNo: 4, deltaMs: 12000 },
      { segNo: 5, deltaMs: 12000 },
    ]);
    expect(report.needsRetime).toEqual([3, 4, 5]);

    // 偏移片段：needs_retime + 已通过的检查作废
    for (const segNo of [3, 4, 5]) {
      const t = await timingOf(ctx, segNo, 2);
      expect(t.timing_status).toBe('needs_retime');
      expect(t.timeline_check).toBe('invalidated');
    }
    // 插入点之前的片段 1 不受影响
    const t1 = await timingOf(ctx, 1, 2);
    expect(t1.timing_status).toBe('valid');
    expect(t1.timeline_check).toBe('passed');
    await ctx.db.close();
  });

  it('纯文字变更的片段保留已通过的时间轴检查', async () => {
    const ctx = await makeContext();
    await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    await ctx.db.query(`UPDATE segment_timings SET timeline_check='passed'`);

    const report = await ctx.versions.importVersion(ctx.projectId, V2, '测试');
    expect(report.textOnlyChanged).toEqual([2]);

    const t2 = await timingOf(ctx, 2, 2);
    expect(t2.timing_status).toBe('valid');
    expect(t2.timeline_check).toBe('passed'); // 保留，未作废

    // 源文 revision 已提升
    const seg = await ctx.db.query(
      `SELECT source_text, source_revision FROM segments WHERE project_id=$1 AND seg_no=2`,
      [ctx.projectId],
    );
    expect(seg[0].source_text).toBe('请保管好您的车票和随身物品。');
    expect(seg[0].source_revision).toBe(2);
    await ctx.db.close();
  });

  it('跨镜头字幕：偏移后仍横跨镜头边界的片段被标记并进入报告', async () => {
    const ctx = await makeContext();
    await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    const report = await ctx.versions.importVersion(ctx.projectId, V2, '测试');
    // 片段4 在 V2 为 75000-79000，横跨 77000 的镜头边界
    expect(report.crossShot).toContain(4);
    const seg = await ctx.db.query(
      `SELECT cross_shot FROM segments WHERE project_id=$1 AND seg_no=4`,
      [ctx.projectId],
    );
    expect(seg[0].cross_shot).toBe(true);
    // 跨镜头且发生偏移 → 必须重打轴
    const t = await timingOf(ctx, 4, 2);
    expect(t.timing_status).toBe('needs_retime');
    await ctx.db.close();
  });

  it('新增片段与双版本对照', async () => {
    const ctx = await makeContext();
    await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    const report = await ctx.versions.importVersion(ctx.projectId, V2, '测试');
    expect(report.added).toEqual([6]);

    const cmp = await ctx.versions.compare(ctx.projectId, 1, 2);
    const row3 = cmp.rows.find((r: any) => r.segNo === 3);
    expect(row3.deltaMs).toBe(12000);
    const row6 = cmp.rows.find((r: any) => r.segNo === 6);
    expect(row6.status).toBe('added');
    await ctx.db.close();
  });
});
