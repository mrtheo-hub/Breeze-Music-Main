import type { LyricsLine } from './types';

const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const OFFSET = /^\[offset:\s*([+-]?\d+)\s*\]/im;

export function parseLrc(text: string): LyricsLine[] {
  const offset = Number(text.match(OFFSET)?.[1] ?? 0);
  const out: LyricsLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(STAMP)];
    if (stamps.length === 0) continue;
    const line = raw.replace(STAMP, '').trim();
    for (const m of stamps) {
      const ms = Number((m[3] ?? '0').padEnd(3, '0').slice(0, 3));
      const time = (Number(m[1]) * 60 + Number(m[2])) * 1000 + ms - offset;
      out.push({ timeMs: Math.max(0, time), text: line });
    }
  }
  return out.sort((a, b) => a.timeMs - b.timeMs);
}

/** Index of the line active at `ms`, or -1 before the first line. */
export function lineAt(lines: LyricsLine[], ms: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((lines[mid] as LyricsLine).timeMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
