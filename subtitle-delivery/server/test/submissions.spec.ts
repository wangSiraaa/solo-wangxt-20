import { describe, expect, it } from 'vitest';
import { makeContext, V1, segmentIdByNo } from './helpers';

describe('片段提交：重复提交与并发冲突', () => {
  it('首次提交直接合并，revision 从 0 到 1', async () => {
    const ctx = await makeContext();
    await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    const segId = await segmentIdByNo(ctx, 1);

    const r = await ctx.segments.submit(segId, 'en', '译员A', 'Hello.', 0, 'k-1');
    expect(r).toMatchObject({ status: 'merged', revision: 1 });
    await ctx.db.close();
  });

  it('重复提交（相同幂等键）不产生重复 revision', async () => {
    const ctx = await makeContext();
    await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    const segId = await segmentIdByNo(ctx, 1);

    const first = await ctx.segments.submit(segId, 'en', '译员A', 'Hello.', 0, 'idem-1');
    // 双击 / 网络重试 / 刷新重发：同一个 idempotencyKey
    const second = await ctx.segments.submit(segId, 'en', '译员A', 'Hello.', 0, 'idem-1');

    expect(first).toMatchObject({ status: 'merged', revision: 1 });
    expect(second).toMatchObject({ status: 'merged', revision: 1, deduplicated: true });

    const subs = await ctx.db.query(
      `SELECT * FROM submissions WHERE segment_id=$1`,
      [segId],
    );
    expect(subs).toHaveLength(1); // 只记了一次
    const text = await ctx.db.query(
      `SELECT revision FROM segment_texts WHERE segment_id=$1 AND language='en'`,
      [segId],
    );
    expect(text[0].revision).toBe(1);
    await ctx.db.close();
  });

  it('两人同时提交同一片段：后到者进入冲突，必须显式解决', async () => {
    const ctx = await makeContext();
    await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    const segId = await segmentIdByNo(ctx, 1);

    // 两人都基于 revision 0 编辑，同时提交
    const [a, b] = await Promise.all([
      ctx.segments.submit(segId, 'en', '译员A', 'Version from A', 0, 'key-a'),
      ctx.segments.submit(segId, 'en', '译员B', 'Version from B', 0, 'key-b'),
    ]);
    const results = [a, b];
    const merged = results.filter((r) => r.status === 'merged');
    const conflicted = results.filter((r) => r.status === 'conflict');
    expect(merged).toHaveLength(1);
    expect(conflicted).toHaveLength(1);

    const conflict = conflicted[0] as Extract<typeof b, { status: 'conflict' }>;
    expect(conflict.currentRevision).toBe(1);

    // 显式解决：采用我的版本
    const resolved = await ctx.segments.resolveConflict(
      conflict.conflictId,
      'take_mine',
      undefined,
      '译员B',
    );
    expect(resolved.status).toBe('resolved');

    const final = await ctx.db.query(
      `SELECT text, revision FROM segment_texts WHERE segment_id=$1 AND language='en'`,
      [segId],
    );
    expect(final[0].revision).toBe(2);
    // 最终文本是被采纳的那一份（A 或 B 取决于谁先落库）
    expect(['Version from A', 'Version from B']).toContain(final[0].text);
    await ctx.db.close();
  });

  it('冲突不可重复解决', async () => {
    const ctx = await makeContext();
    await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    const segId = await segmentIdByNo(ctx, 1);

    await ctx.segments.submit(segId, 'en', '译员A', 'A', 0, 'k1');
    const b = await ctx.segments.submit(segId, 'en', '译员B', 'B', 0, 'k2');
    if (b.status !== 'conflict') throw new Error('应产生冲突');
    await ctx.segments.resolveConflict(b.conflictId, 'take_current', undefined, '校对');
    await expect(
      ctx.segments.resolveConflict(b.conflictId, 'take_mine', undefined, '校对'),
    ).rejects.toMatchObject({ code: 'ALREADY_RESOLVED' });
    await ctx.db.close();
  });

  it('merge 策略：人工合并两版文本', async () => {
    const ctx = await makeContext();
    await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    const segId = await segmentIdByNo(ctx, 1);

    await ctx.segments.submit(segId, 'en', '译员A', 'The last train.', 0, 'k1');
    const b = await ctx.segments.submit(segId, 'en', '译员B', 'The final train!', 0, 'k2');
    if (b.status !== 'conflict') throw new Error('应产生冲突');
    await ctx.segments.resolveConflict(
      b.conflictId,
      'merge',
      'The last train is departing!',
      '校对',
    );
    const final = await ctx.db.query(
      `SELECT text FROM segment_texts WHERE segment_id=$1 AND language='en'`,
      [segId],
    );
    expect(final[0].text).toBe('The last train is departing!');
    await ctx.db.close();
  });

  it('领取互斥：同一片段同一语言只能一人持有', async () => {
    const ctx = await makeContext();
    await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    const segId = await segmentIdByNo(ctx, 1);

    await ctx.segments.claim(segId, 'en', '译员A');
    await expect(ctx.segments.claim(segId, 'en', '译员B')).rejects.toMatchObject({
      code: 'ALREADY_CLAIMED',
      claimedBy: '译员A',
    });
    // 本人重复领取幂等
    const again = await ctx.segments.claim(segId, 'en', '译员A');
    expect(again.assignee).toBe('译员A');
    // 释放后他人可领取
    await ctx.segments.release(segId, 'en', '译员A');
    const bClaim = await ctx.segments.claim(segId, 'en', '译员B');
    expect(bClaim.assignee).toBe('译员B');
    await ctx.db.close();
  });

  it('术语自动检查：译文未用约定译法时生成术语问题', async () => {
    const ctx = await makeContext();
    await ctx.versions.importVersion(ctx.projectId, V1, '测试');
    await ctx.glossary.addTerm(ctx.projectId, 'en', '末班车', 'the last train');
    const segId = await segmentIdByNo(ctx, 1); // 源文含「末班车」

    await ctx.segments.submit(segId, 'en', '译员A', 'The final service is leaving.', 0, 'k1');
    const issues = await ctx.review.list(ctx.projectId, 'en', 'open');
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('terminology');
    expect(issues[0].note).toContain('the last train');

    // 使用约定译法则不产生问题
    const segId2 = await segmentIdByNo(ctx, 2);
    await ctx.glossary.addTerm(ctx.projectId, 'en', '车票', 'ticket');
    await ctx.segments.submit(segId2, 'en', '译员A', 'Keep your ticket safe.', 0, 'k2');
    const after = await ctx.review.list(ctx.projectId, 'en', 'open');
    expect(after).toHaveLength(1);
    await ctx.db.close();
  });
});
