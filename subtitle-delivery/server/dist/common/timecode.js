"use strict";
/** 时间码工具：内部统一用毫秒整数存储 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.msToSrt = msToSrt;
exports.msToTc = msToTc;
exports.fmtDelta = fmtDelta;
exports.nowIso = nowIso;
exports.uuid = uuid;
function msToSrt(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const mmm = ms % 1000;
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return `${p(h)}:${p(m)}:${p(s)},${p(mmm, 3)}`;
}
function msToTc(ms) {
    return msToSrt(ms).replace(',', '.');
}
function fmtDelta(deltaMs) {
    const sign = deltaMs >= 0 ? '+' : '-';
    return `${sign}${(Math.abs(deltaMs) / 1000).toFixed(1)}s`;
}
function nowIso() {
    return new Date().toISOString();
}
function uuid() {
    return crypto.randomUUID();
}
