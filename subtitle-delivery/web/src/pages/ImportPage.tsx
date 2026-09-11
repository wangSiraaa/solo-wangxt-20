import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { ImportReport, PictureVersion, Project, fmtDelta, msToTc } from '../types';

/** 版本导入：载入样例或上传剪辑表 JSON，展示 diff 报告 */
export default function ImportPage({ project }: { project: Project }) {
  const [versions, setVersions] = useState<PictureVersion[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState('');

  const loadVersions = () =>
    api<PictureVersion[]>(`/projects/${project.id}/versions`).then(setVersions);

  useEffect(() => {
    loadVersions();
  }, [project.id]);

  const doImport = async (payload: any) => {
    setError('');
    try {
      const r = await api<ImportReport>(`/projects/${project.id}/versions/import`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setReport(r);
      loadVersions();
    } catch (e) {
      const err = e as ApiError;
      setError(err.body?.message ?? '导入失败');
    }
  };

  const importSample = async () => {
    const sample = await api('/samples/picture_v2.json');
    await doImport(sample);
  };

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        doImport(JSON.parse(String(reader.result)));
      } catch {
        setError('文件不是合法的 JSON');
      }
    };
    reader.readAsText(file);
  };

  return (
    <>
      <div className="panel">
        <h2>画面版本</h2>
        <table>
          <thead>
            <tr><th>版本</th><th>标签</th><th>导入手</th><th>导入时间</th></tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td><span className="badge info">V{v.version_no}</span></td>
                <td>{v.label}</td>
                <td>{v.imported_by}</td>
                <td className="mono">{new Date(v.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>导入新版画面</h3>
        <div className="row">
          <button className="primary" onClick={importSample}>
            导入样例 V2（导演剪辑版）
          </button>
          <span className="muted">或</span>
          <input
            type="file"
            accept=".json"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </div>
        <p className="muted">
          样例 V2 在 00:30 处插入了一个 12 秒的航拍镜头，其后的字幕整体偏移；
          2 号片段仅修改了台词文字。导入后系统会自动 diff。
        </p>
        {error && <div className="notice error">{error}</div>}
      </div>

      {report && (
        <div className="panel">
          <h2>导入报告：V{report.versionNo} {report.label}</h2>
          {report.insertedShots.length > 0 && (
            <div className="notice">
              插入 {report.insertedShots.length} 个镜头：
              {report.insertedShots.map((s) => (
                <span key={s.shotNo} className="mono">
                  镜头{s.shotNo}（{msToTc(s.inMs)}–{msToTc(s.outMs)}）
                </span>
              ))}
              ，后续字幕不能沿用旧时间码。
            </div>
          )}
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div>
              <h3>时间码偏移（{report.shifted.length}）</h3>
              <ul className="tight">
                {report.shifted.map((s) => (
                  <li key={s.segNo}>
                    片段 {s.segNo} <span className="mono">{fmtDelta(s.deltaMs)}</span>{' '}
                    <span className="badge warn">待重打轴</span>
                  </li>
                ))}
                {!report.shifted.length && <li className="muted">无</li>}
              </ul>
            </div>
            <div>
              <h3>仅文字变更（{report.textOnlyChanged.length}）</h3>
              <ul className="tight">
                {report.textOnlyChanged.map((n) => (
                  <li key={n}>
                    片段 {n} <span className="badge ok">时间轴检查保留</span>
                  </li>
                ))}
                {!report.textOnlyChanged.length && <li className="muted">无</li>}
              </ul>
            </div>
            <div>
              <h3>新增 / 移除</h3>
              <ul className="tight">
                {report.added.map((n) => (
                  <li key={`a${n}`}>片段 {n} <span className="badge info">新增</span></li>
                ))}
                {report.removed.map((n) => (
                  <li key={`r${n}`}>片段 {n} <span className="badge bad">已移除</span></li>
                ))}
                {!report.added.length && !report.removed.length && <li className="muted">无</li>}
              </ul>
            </div>
            <div>
              <h3>跨镜头警告（{report.crossShot.length}）</h3>
              <ul className="tight">
                {report.crossShot.map((n) => (
                  <li key={n}>
                    片段 {n} <span className="badge warn">横跨镜头边界</span>
                  </li>
                ))}
                {!report.crossShot.length && <li className="muted">无</li>}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
