import { useEffect, useState } from 'react';
import { api, ApiError, getCurrentUser, newIdemKey } from '../api';
import { Project, SegmentRow, msToTc } from '../types';

interface ConflictState {
  conflictId: string;
  segNo: number;
  myText: string;
  currentText: string | null;
  currentRevision: number;
  currentUpdatedBy: string | null;
}

/** 翻译工作台：领取片段、提交译文、显式解决冲突、确认重打轴 */
export default function TranslatePage({ project }: { project: Project }) {
  const [language, setLanguage] = useState(project.target_languages[0] ?? 'en');
  const [rows, setRows] = useState<SegmentRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [idemKeys, setIdemKeys] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [mergeText, setMergeText] = useState('');
  const [notice, setNotice] = useState('');

  const load = () =>
    api<{ rows: SegmentRow[] }>(`/projects/${project.id}/segments?language=${language}`)
      .then((r) => setRows(r.rows));

  useEffect(() => {
    setDrafts({});
    setIdemKeys({});
    load();
  }, [project.id, language]);

  const keyFor = (id: string) => idemKeys[id] ?? (() => {
    const k = newIdemKey();
    setIdemKeys((m) => ({ ...m, [id]: k }));
    return k;
  })();

  const claim = async (row: SegmentRow) => {
    setNotice('');
    try {
      await api(`/segments/${row.id}/claim`, {
        method: 'POST',
        body: JSON.stringify({ language }),
      });
      setDrafts((d) => ({ ...d, [row.id]: d[row.id] ?? row.tr_text ?? '' }));
      load();
    } catch (e) {
      setNotice((e as ApiError).body?.message ?? '领取失败');
    }
  };

  const release = async (row: SegmentRow) => {
    await api(`/segments/${row.id}/claim?language=${language}`, { method: 'DELETE' });
    load();
  };

  const submit = async (row: SegmentRow) => {
    setNotice('');
    const text = drafts[row.id];
    if (!text?.trim()) {
      setNotice('译文不能为空');
      return;
    }
    try {
      const res = await api(`/segments/${row.id}/submissions`, {
        method: 'POST',
        body: JSON.stringify({
          language,
          text,
          baseRevision: row.tr_revision ?? 0,
          idempotencyKey: keyFor(row.id),
        }),
      });
      setNotice(
        res.deduplicated
          ? `片段 ${row.seg_no}：重复提交已去重（仍是 r${res.revision}）`
          : `片段 ${row.seg_no} 已合并为 r${res.revision}`,
      );
      setIdemKeys((m) => ({ ...m, [row.id]: newIdemKey() }));
      load();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409 && err.body?.conflictId) {
        setConflict({
          conflictId: err.body.conflictId,
          segNo: row.seg_no,
          myText: text,
          currentText: err.body.currentText,
          currentRevision: err.body.currentRevision,
          currentUpdatedBy: err.body.currentUpdatedBy,
        });
        setMergeText(text);
      } else {
        setNotice(err.body?.message ?? '提交失败');
      }
    }
  };

  const resolve = async (strategy: 'take_mine' | 'take_current' | 'merge') => {
    if (!conflict) return;
    try {
      await api(`/conflicts/${conflict.conflictId}/resolve`, {
        method: 'POST',
        body: JSON.stringify(
          strategy === 'merge' ? { strategy, mergedText: mergeText } : { strategy },
        ),
      });
      setNotice(`片段 ${conflict.segNo} 冲突已解决（${strategy}）`);
      setConflict(null);
      load();
    } catch (e) {
      setNotice((e as ApiError).body?.message ?? '解决失败');
      setConflict(null);
    }
  };

  const retime = async (row: SegmentRow) => {
    await api(`/segments/${row.id}/retime`, { method: 'POST', body: '{}' });
    setNotice(`片段 ${row.seg_no} 时间码已确认，时间轴检查通过`);
    load();
  };

  const me = getCurrentUser();

  return (
    <>
      <div className="panel">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, flex: 1 }}>翻译工作台</h2>
          <label>
            目标语言{' '}
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {project.target_languages.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">
          提示：用右上角切换身份（译员A / 译员B），两人先后提交同一片段即可触发冲突解决流程。
        </p>
        {notice && <div className="notice">{notice}</div>}
        <table>
          <thead>
            <tr>
              <th>#</th><th>时间码</th><th>源文本</th><th>译文（{language}）</th><th>状态</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const mine = row.claimed_by === me;
              return (
                <tr key={row.id}>
                  <td className="mono">{row.seg_no}</td>
                  <td className="mono">
                    {msToTc(row.start_ms)}<br />→ {msToTc(row.end_ms)}
                  </td>
                  <td>
                    {row.source_text}
                    {row.source_revision > 1 && (
                      <div><span className="badge info">源文 r{row.source_revision}</span></div>
                    )}
                  </td>
                  <td style={{ minWidth: 260 }}>
                    {mine ? (
                      <textarea
                        value={drafts[row.id] ?? ''}
                        placeholder="输入译文…"
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [row.id]: e.target.value }))
                        }
                      />
                    ) : row.tr_text ? (
                      <>
                        {row.tr_text}
                        <div className="muted">r{row.tr_revision} · {row.tr_updated_by}</div>
                      </>
                    ) : (
                      <span className="muted">未翻译</span>
                    )}
                  </td>
                  <td>
                    {row.timing_status === 'needs_retime' && (
                      <span className="badge bad">待重打轴</span>
                    )}
                    {row.timeline_check === 'passed' && <span className="badge ok">轴已检</span>}
                    {row.timeline_check === 'invalidated' && (
                      <span className="badge warn">检查失效</span>
                    )}
                    {row.cross_shot && <span className="badge warn">跨镜头</span>}
                    {row.claimed_by && (
                      <span className="badge info">{row.claimed_by} 持有</span>
                    )}
                    {Number(row.open_issues) > 0 && (
                      <span className="badge warn">{row.open_issues} 个问题</span>
                    )}
                  </td>
                  <td>
                    <div className="row gap">
                      {!row.claimed_by && (
                        <button className="ghost" onClick={() => claim(row)}>领取</button>
                      )}
                      {mine && (
                        <>
                          <button className="primary" onClick={() => submit(row)}>提交</button>
                          <button className="ghost" onClick={() => release(row)}>放弃</button>
                        </>
                      )}
                      {row.timing_status === 'needs_retime' && (
                        <button className="ghost" onClick={() => retime(row)}>
                          确认新时间码
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {conflict && (
        <div className="modal-mask">
          <div className="modal">
            <h2>提交冲突：片段 {conflict.segNo}</h2>
            <p className="muted">
              你基于旧版本编辑，{conflict.currentUpdatedBy ?? '他人'} 已先合并了
              r{conflict.currentRevision}。必须显式选择如何解决：
            </p>
            <div className="compare-cols">
              <div className="compare-box">
                <div className="who">当前版本（{conflict.currentUpdatedBy} · r{conflict.currentRevision}）</div>
                <div>{conflict.currentText ?? '（无）'}</div>
              </div>
              <div className="compare-box">
                <div className="who">你的提交（{me}）</div>
                <div>{conflict.myText}</div>
              </div>
            </div>
            <h3>或手动合并</h3>
            <textarea value={mergeText} onChange={(e) => setMergeText(e.target.value)} />
            <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="ghost" onClick={() => resolve('take_current')}>
                采用当前版本
              </button>
              <button className="ghost" onClick={() => resolve('take_mine')}>
                采用我的版本
              </button>
              <button className="primary" onClick={() => resolve('merge')}>
                使用合并文本
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
