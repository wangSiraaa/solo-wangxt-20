import { useEffect, useState } from 'react';
import { api } from '../api';
import { CompareRow, PictureVersion, Project, fmtDelta, msToTc } from '../types';

interface CompareResult {
  a: { versionNo: number; label: string };
  b: { versionNo: number; label: string };
  rows: CompareRow[];
}

/** 双版本字幕对照：并排展示两个画面版本的时间码与状态 */
export default function ComparePage({ project }: { project: Project }) {
  const [versions, setVersions] = useState<PictureVersion[]>([]);
  const [aNo, setANo] = useState(1);
  const [bNo, setBNo] = useState(2);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<PictureVersion[]>(`/projects/${project.id}/versions`).then((vs) => {
      setVersions(vs);
      if (vs.length >= 2) {
        setANo(vs[vs.length - 2].version_no);
        setBNo(vs[vs.length - 1].version_no);
      } else if (vs.length === 1) {
        setANo(vs[0].version_no);
        setBNo(vs[0].version_no);
      }
    });
  }, [project.id]);

  useEffect(() => {
    if (!versions.length) return;
    setError('');
    api<CompareResult>(`/projects/${project.id}/versions/compare?a=${aNo}&b=${bNo}`)
      .then(setResult)
      .catch((e) => {
        setResult(null);
        setError(e.body?.message ?? '对照失败');
      });
  }, [project.id, aNo, bNo, versions.length]);

  return (
    <div className="panel">
      <h2>双版本字幕对照</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <label>
          版本 A{' '}
          <select value={aNo} onChange={(e) => setANo(Number(e.target.value))}>
            {versions.map((v) => (
              <option key={v.id} value={v.version_no}>V{v.version_no} {v.label}</option>
            ))}
          </select>
        </label>
        <label>
          版本 B{' '}
          <select value={bNo} onChange={(e) => setBNo(Number(e.target.value))}>
            {versions.map((v) => (
              <option key={v.id} value={v.version_no}>V{v.version_no} {v.label}</option>
            ))}
          </select>
        </label>
      </div>
      {error && <div className="notice error">{error}</div>}
      {result && (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>源文本</th>
              <th>V{result.a.versionNo} 时间码</th>
              <th>V{result.b.versionNo} 时间码</th>
              <th>偏移</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.segNo}>
                <td className="mono">{r.segNo}</td>
                <td>
                  {r.sourceText}
                  {r.sourceRevision > 1 && (
                    <div><span className="badge info">源文 r{r.sourceRevision}</span></div>
                  )}
                </td>
                <td className="mono">
                  {r.a ? `${msToTc(r.a.startMs)} → ${msToTc(r.a.endMs)}` : '—'}
                </td>
                <td className="mono">
                  {r.b ? `${msToTc(r.b.startMs)} → ${msToTc(r.b.endMs)}` : '—'}
                </td>
                <td className="mono">
                  {r.deltaMs !== null && r.deltaMs !== 0 ? fmtDelta(r.deltaMs) : ''}
                </td>
                <td>
                  {r.status === 'added' && <span className="badge info">新增</span>}
                  {r.status === 'removed' && <span className="badge bad">已移除</span>}
                  {r.deltaMs !== null && r.deltaMs !== 0 && (
                    <span className="badge warn">已移位</span>
                  )}
                  {r.crossShot && <span className="badge warn">跨镜头</span>}
                  {r.b?.timingStatus === 'needs_retime' && (
                    <span className="badge bad">待重打轴</span>
                  )}
                  {r.b?.timelineCheck === 'passed' && r.b.timingStatus === 'valid' && (
                    <span className="badge ok">检查通过</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
