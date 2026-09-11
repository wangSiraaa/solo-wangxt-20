import { Fragment, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { Delivery, Impact, Project } from '../types';

interface GateFailure {
  code: 'GATE_FAILED';
  missingTranslations: number[];
  needsRetime: number[];
  openIssues: { segNo: number; type: string; note: string }[];
}

/** 交付页：生成交付包（绑定画面版本 + 术语表快照）、下载、影响分析 */
export default function DeliveriesPage({ project }: { project: Project }) {
  const [language, setLanguage] = useState(project.target_languages[0] ?? 'en');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [gate, setGate] = useState<GateFailure | null>(null);
  const [notice, setNotice] = useState('');
  const [impacts, setImpacts] = useState<Record<string, Impact>>({});

  const load = () =>
    api<Delivery[]>(`/projects/${project.id}/deliveries`).then(setDeliveries);

  useEffect(() => {
    load();
  }, [project.id]);

  const create = async () => {
    setGate(null);
    setNotice('');
    try {
      const d = await api<Delivery>(`/projects/${project.id}/deliveries`, {
        method: 'POST',
        body: JSON.stringify({ language }),
      });
      setNotice(`交付包已生成：${d.language} · V${d.version_no}（快照 ${d.glossary_snapshot_id.slice(0, 8)}…）`);
      load();
    } catch (e) {
      const err = e as ApiError;
      if (err.body?.code === 'GATE_FAILED' || err.body?.missingTranslations) {
        setGate(err.body as GateFailure);
      } else {
        setNotice(err.body?.message ?? '交付失败');
      }
    }
  };

  const toggleImpact = async (id: string) => {
    if (impacts[id]) {
      setImpacts((m) => {
        const { [id]: _, ...rest } = m;
        return rest;
      });
      return;
    }
    const impact = await api<Impact>(`/deliveries/${id}/impact`);
    setImpacts((m) => ({ ...m, [id]: impact }));
  };

  return (
    <>
      <div className="panel">
        <h2>生成交付包</h2>
        <div className="row">
          <label>
            目标语言{' '}
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {project.target_languages.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <button className="primary" onClick={create}>生成交付包</button>
          <span className="muted">
            交付包绑定当前画面版本与术语表快照，含 SRT + glossary.csv + manifest.json
          </span>
        </div>
        {notice && <div className="notice success">{notice}</div>}
        {gate && (
          <div className="notice error">
            <b>交付门禁未通过：</b>
            <ul className="tight">
              {gate.missingTranslations?.length > 0 && (
                <li>缺少译文：片段 {gate.missingTranslations.join('、')}</li>
              )}
              {gate.needsRetime?.length > 0 && (
                <li>待重打轴：片段 {gate.needsRetime.join('、')}（请到翻译工作台确认新时间码）</li>
              )}
              {gate.openIssues?.length > 0 && (
                <li>
                  未解决校对问题：
                  {gate.openIssues.map((i, idx) => (
                    <div key={idx}>片段 {i.segNo} · {i.type === 'terminology' ? '术语' : '时间轴'} · {i.note}</div>
                  ))}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>交付记录</h2>
        <table>
          <thead>
            <tr>
              <th>语言</th><th>画面版本</th><th>术语快照</th><th>交付人</th><th>时间</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <Fragment key={d.id}>
                <tr>
                  <td><span className="badge info">{d.language}</span></td>
                  <td>V{d.version_no} {d.version_label}</td>
                  <td className="mono">{d.glossary_snapshot_id.slice(0, 8)}…</td>
                  <td>{d.created_by}</td>
                  <td className="mono">{new Date(d.created_at).toLocaleString()}</td>
                  <td>
                    <div className="row gap">
                      <a href={`/api/deliveries/${d.id}/download`}>
                        <button className="ghost">下载 zip</button>
                      </a>
                      <button className="ghost" onClick={() => toggleImpact(d.id)}>
                        {impacts[d.id] ? '收起影响' : '影响分析'}
                      </button>
                    </div>
                  </td>
                </tr>
                {impacts[d.id] && (
                  <tr>
                    <td colSpan={6}>
                      <ImpactView impact={impacts[d.id]} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!deliveries.length && (
              <tr><td colSpan={6} className="muted">还没有交付记录</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ImpactView({ impact }: { impact: Impact }) {
  if (impact.upToDate) {
    return (
      <div className="notice success">
        该交付（V{impact.deliveredAtVersion}）与当前 V{impact.currentVersion} 一致，
        {impact.language} 语言无受影响改动。
      </div>
    );
  }
  return (
    <div className="notice">
      交付时为 V{impact.deliveredAtVersion}，当前画面 V{impact.currentVersion}。
      以下改动影响已交付的 {impact.language}：
      <ul className="tight">
        {impact.affected.map((a) => (
          <li key={a.segNo}>
            片段 {a.segNo}：{a.changes.join('；')}
          </li>
        ))}
        {impact.removed.map((n) => (
          <li key={`r${n}`}>片段 {n}：已在新版本中移除</li>
        ))}
      </ul>
    </div>
  );
}
