import { useEffect, useState } from 'react';
import { api, setCurrentUser } from './api';
import { Project } from './types';
import ImportPage from './pages/ImportPage';
import ComparePage from './pages/ComparePage';
import TranslatePage from './pages/TranslatePage';
import ReviewPage from './pages/ReviewPage';
import DeliveriesPage from './pages/DeliveriesPage';

const USERS = ['译员A', '译员B', '校对员', '制片'];
const TABS = [
  { key: 'import', label: '版本导入' },
  { key: 'compare', label: '双版对照' },
  { key: 'translate', label: '翻译工作台' },
  { key: 'review', label: '校对' },
  { key: 'deliveries', label: '交付' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<TabKey>('import');
  const [user, setUser] = useState(USERS[0]);
  const [error, setError] = useState('');

  useEffect(() => {
    setCurrentUser(user);
  }, [user]);

  useEffect(() => {
    api<Project[]>('/projects')
      .then((list) => setProject(list[0] ?? null))
      .catch((e) => setError(`无法连接服务端：${e?.message ?? e}`));
  }, []);

  if (error) return <main><div className="notice error">{error}</div></main>;
  if (!project) return <main><p className="muted">加载中…</p></main>;

  return (
    <>
      <header>
        <h1>字幕版本交付系统</h1>
        <span className="project-name">{project.name}</span>
        <nav>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'active' : ''}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="user-switch">
          <span className="muted">当前身份</span>
          <select value={user} onChange={(e) => setUser(e.target.value)}>
            {USERS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
      </header>
      <main>
        {tab === 'import' && <ImportPage project={project} />}
        {tab === 'compare' && <ComparePage project={project} />}
        {tab === 'translate' && <TranslatePage project={project} />}
        {tab === 'review' && <ReviewPage project={project} />}
        {tab === 'deliveries' && <DeliveriesPage project={project} />}
      </main>
    </>
  );
}
