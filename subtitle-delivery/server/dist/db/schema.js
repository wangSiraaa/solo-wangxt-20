"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEMA_SQL = void 0;
/**
 * 字幕版本交付系统 schema。
 * 版本关系核心：
 *  - picture_versions 1-N shots（镜头表，导入时 diff 标记 inserted）
 *  - segments 是项目级实体，segment_timings 按画面版本保存时间码与检查状态
 *  - segment_texts 保存每个语言的当前译文与 revision（冲突检测的基准）
 *  - deliveries 绑定 picture_version + glossary_snapshot，delivery_items 冻结交付时的 revision
 */
exports.SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_language TEXT NOT NULL,
  target_languages TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS picture_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  version_no INTEGER NOT NULL,
  label TEXT NOT NULL,
  imported_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, version_no)
);

CREATE TABLE IF NOT EXISTS shots (
  id TEXT PRIMARY KEY,
  picture_version_id TEXT NOT NULL REFERENCES picture_versions(id),
  shot_no INTEGER NOT NULL,
  in_ms INTEGER NOT NULL,
  out_ms INTEGER NOT NULL,
  change_type TEXT NOT NULL DEFAULT 'same'
);

CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  seg_no INTEGER NOT NULL,
  source_text TEXT NOT NULL,
  source_revision INTEGER NOT NULL DEFAULT 1,
  cross_shot BOOLEAN NOT NULL DEFAULT FALSE,
  created_in_version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(project_id, seg_no)
);

CREATE TABLE IF NOT EXISTS segment_timings (
  segment_id TEXT NOT NULL REFERENCES segments(id),
  picture_version_id TEXT NOT NULL REFERENCES picture_versions(id),
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  timing_status TEXT NOT NULL DEFAULT 'valid',
  timeline_check TEXT NOT NULL DEFAULT 'pending',
  confirmed_by TEXT,
  PRIMARY KEY (segment_id, picture_version_id)
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  segment_id TEXT NOT NULL REFERENCES segments(id),
  language TEXT NOT NULL,
  assignee TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'claimed',
  claimed_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS assignments_active_idx
  ON assignments(segment_id, language) WHERE status = 'claimed';

CREATE TABLE IF NOT EXISTS segment_texts (
  segment_id TEXT NOT NULL REFERENCES segments(id),
  language TEXT NOT NULL,
  text TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (segment_id, language)
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  segment_id TEXT NOT NULL REFERENCES segments(id),
  language TEXT NOT NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  base_revision INTEGER NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS submissions_idem_idx
  ON submissions(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS conflicts (
  id TEXT PRIMARY KEY,
  segment_id TEXT NOT NULL REFERENCES segments(id),
  language TEXT NOT NULL,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  current_revision INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolution TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_issues (
  id TEXT PRIMARY KEY,
  segment_id TEXT NOT NULL REFERENCES segments(id),
  language TEXT NOT NULL,
  type TEXT NOT NULL,
  note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_by TEXT,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS glossary_terms (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  language TEXT NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS glossary_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS glossary_snapshot_terms (
  snapshot_id TEXT NOT NULL REFERENCES glossary_snapshots(id),
  language TEXT NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  language TEXT NOT NULL,
  picture_version_id TEXT NOT NULL REFERENCES picture_versions(id),
  glossary_snapshot_id TEXT NOT NULL REFERENCES glossary_snapshots(id),
  file_path TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_items (
  delivery_id TEXT NOT NULL REFERENCES deliveries(id),
  segment_id TEXT NOT NULL,
  text_revision INTEGER NOT NULL,
  source_revision INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  PRIMARY KEY (delivery_id, segment_id)
);
`;
