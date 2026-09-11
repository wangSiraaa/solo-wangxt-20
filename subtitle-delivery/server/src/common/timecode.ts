/** 时间码工具：内部统一用毫秒整数存储 */

export function msToSrt(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mmm = ms % 1000;
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(mmm, 3)}`;
}

export function msToTc(ms: number): string {
  return msToSrt(ms).replace(',', '.');
}

export function fmtDelta(deltaMs: number): string {
  const sign = deltaMs >= 0 ? '+' : '-';
  return `${sign}${(Math.abs(deltaMs) / 1000).toFixed(1)}s`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function uuid(): string {
  return crypto.randomUUID();
}
