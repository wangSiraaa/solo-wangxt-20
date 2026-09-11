export interface Project {
  id: string;
  name: string;
  source_language: string;
  target_languages: string[];
}

export interface PictureVersion {
  id: string;
  version_no: number;
  label: string;
  imported_by: string;
  created_at: string;
}

export interface SegmentRow {
  id: string;
  seg_no: number;
  source_text: string;
  source_revision: number;
  cross_shot: boolean;
  start_ms: number;
  end_ms: number;
  timing_status: 'valid' | 'needs_retime';
  timeline_check: 'pending' | 'passed' | 'invalidated';
  tr_text: string | null;
  tr_revision: number | null;
  tr_updated_by: string | null;
  claimed_by: string | null;
  open_issues: number;
}

export interface ImportReport {
  versionId: string;
  versionNo: number;
  label: string;
  insertedShots: { shotNo: number; inMs: number; outMs: number }[];
  removedShots: { shotNo: number; inMs: number; outMs: number }[];
  shifted: { segNo: number; deltaMs: number }[];
  textOnlyChanged: number[];
  added: number[];
  removed: number[];
  crossShot: number[];
  needsRetime: number[];
}

export interface CompareRow {
  segNo: number;
  sourceText: string;
  sourceRevision: number;
  crossShot: boolean;
  a: { startMs: number; endMs: number } | null;
  b: { startMs: number; endMs: number; timingStatus: string; timelineCheck: string } | null;
  deltaMs: number | null;
  status: 'added' | 'removed' | 'kept';
}

export interface Issue {
  id: string;
  segment_id: string;
  seg_no: number;
  source_text: string;
  language: string;
  type: 'terminology' | 'timeline';
  note: string;
  status: 'open' | 'resolved';
  created_by: string;
  created_at: string;
}

export interface Delivery {
  id: string;
  language: string;
  version_no: number;
  version_label: string;
  glossary_snapshot_id: string;
  created_by: string;
  created_at: string;
}

export interface Impact {
  deliveryId: string;
  language: string;
  deliveredAtVersion: number;
  currentVersion: number;
  upToDate: boolean;
  affected: { segNo: number; changes: string[] }[];
  removed: number[];
}

export function msToTc(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mmm = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)}.${p(mmm, 3)}`;
}

export function fmtDelta(ms: number): string {
  const sign = ms >= 0 ? '+' : '-';
  return `${sign}${(Math.abs(ms) / 1000).toFixed(1)}s`;
}
