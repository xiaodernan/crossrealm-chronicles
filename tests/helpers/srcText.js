/**
 * 源码指针读手的**归一口**（W-D4 切片5 试点）
 *
 * 为什么存在：Windows 检出默认 CRLF，而本仓库很多"源码结构腿"（`.includes(多行 needle)`
 * 之类）按 LF 字节比对 —— CRLF 平面上 needle 永远对不上，那条腿就从"应验即红"退化成
 * "永远不响 / 误报一片"（W-D4 切片4 实测触发过一次，见 §9 同期条目）。
 *
 * 纪律：以后所有新增的"源码结构腿"一律走这里；既有文件的迁移是一次普查工程，
 * 逐文件换、逐文件证，不夹在别的切片里——**每迁一处，必须在那一片里把改前的假腿量出来
 * （CRLF 平面 PR 里红、LF 平面绿，两种信号都截图）**。
 */
import { readFileSync } from 'node:fs';
import { normalize, isAbsolute } from 'node:path';

/** @param {string} relOrAbs — 接受仓库相对路径（相对 cwd）或绝对路径 */
export function readSrc(relOrAbs) {
  const p = isAbsolute(relOrAbs) ? relOrAbs : normalize(relOrAbs);
  return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}
