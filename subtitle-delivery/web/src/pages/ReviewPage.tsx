import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { Issue, Project, SegmentRow } from '../types';

/** 校对页：标记 / 解决术语与时间轴问题 */
export default function ReviewPage({ project }: { project: Project }) {
  const [language, setLanguage] = useState(project.target_languages[0] ?? 'en');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [form, setForm] = useState({ segmentId: '', type: 'terminology', note: '' });
  const [error, setError] = useState('');

  const load = () => {
    api<Issue[]>(
      `/projects/${project.id}/issues?language=${language}${showResolved ? '' : '&status=open'}`,
    ).then(setIssues);
    api<{ rows: SegmentRow[] }>(`/projects/${project.id}/segments?language=${language}`)
      .then((r) => setSegments(r.rows));
  };

  useEffect(load, [project.id, language, showResolved]);

  const create = async () => {
    setError('');
    if (!form.segmentId || !form.note.trim()) {
      setError('请选择片段并填写问题描述');
      return;
    }
    try {
      await api(`/projects/${project.id}/issues`, {
        method: 'POST',
        body: JSON.stringify({ ...form, language }),
      });
      setForm({ ...form, note: '' });
      load();
    } catch (e) {
      setError((e as ApiError).body?.message ?? '创建失败');
    }
  };

  const resolve = async (id: string) => {
    await api(`/issues/${id}/resolve`, { method: 'POST' });
    load();
  };

  return (
    <>
      <div className="panel">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, flex: 1 }}>校对问题</h2>
          <label>
            语言{' '}
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {project.target_languages.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="muted">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
            />{' '}
            显示已解决
          </label>
        </div>
        <table>
          <thead>
            <tr><th>片段</th><th>类型</th><th>问题</th><th>标记人</th><th>状态</th><th></th></tr>
          </thead>
          <tbody>
            {issues.map((i) => (
              <tr key={i.id}>
                <td className="mono">{i.seg_no}</td>
                <td>
                  <span className={`badge ${i.type === 'terminology' ? 'info' : 'warn'}`}>
                    {i.type === 'terminology' ? '术语' : '时间轴'}
                  </span>
                </td>
                <td>{i.note}</td>
                <td>{i.created_by}</td>
                <td>
                  {i.status === 'open'
                    ? <span className="badge bad">未解决</span>
                    : <span className="badge ok">已解决</span>}
                </td>
                <td>
                  {i.status === 'open' && (
                    <button className="ghost" onClick={() => resolve(i.id)}>标记解决</button>
                  )}
                </td>
              </tr>
            ))}
            {!issues.length && (
              <tr><td colSpan={6} className="muted">暂无问题</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>标记新问题</h2>
        {error && <div className="notice error">{error}</div>}
        <div className="row">
          <select
            value={form.segmentId}
            onChange={(e) => setForm({ ...form, segmentId: e.target.value })}
          >
            <option value="">选择片段…</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                #{s.seg_no} {s.source_text.slice(0, 20)}
              </option>
            ))}
          </select>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="terminology">术语</option>
            <option value="timeline">时间轴</option>
          </select>
          <input
            type="text"
            style={{ flex: 1 }}
            placeholder="问题描述，如：术语「末班车」应译为 the last train"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
          <button className="primary" onClick={create}>标记</button>
        </div>
      </div>
    </>
  );
}
