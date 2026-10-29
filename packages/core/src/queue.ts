import type { Track } from './types';

export type RepeatMode = 'off' | 'all' | 'one';

export interface QueueState {
  tracks: Track[];
  /** -1 when the queue is empty. */
  index: number;
  repeat: RepeatMode;
  shuffled: boolean;
  /** Unshuffled order. Mirrors `tracks` while `shuffled` is false. */
  original: Track[];
}

export function emptyQueue(): QueueState {
  return { tracks: [], index: -1, repeat: 'off', shuffled: false, original: [] };
}

export function current(s: QueueState): Track | null {
  return s.tracks[s.index] ?? null;
}

function withTracks(s: QueueState, tracks: Track[], index: number, original: Track[]): QueueState {
  return { ...s, tracks, index, original: s.shuffled ? original : tracks };
}

/**
 * Copy each incoming track so every queue entry is its own object. `original`
 * is matched by reference, so the same song queued twice must not share one.
 */
const entries = (tracks: Track[]): Track[] => tracks.map((t) => ({ ...t }));

function shuffleInPlace(list: Track[], random: () => number): void {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j] as Track, list[i] as Track];
  }
}

export function setQueue(s: QueueState, tracks: Track[], startIndex = 0, random = Math.random): QueueState {
  const list = entries(tracks);
  const index = list.length === 0 ? -1 : Math.min(Math.max(startIndex, 0), list.length - 1);
  if (!s.shuffled || index === -1) return { ...s, tracks: list, original: list, index, shuffled: false };
  // Shuffled: the chosen track plays first, every other track follows in random order.
  const rest = list.filter((_, i) => i !== index);
  shuffleInPlace(rest, random);
  return { ...s, tracks: [list[index] as Track, ...rest], original: list, index: 0, shuffled: true };
}

export function enqueue(s: QueueState, tracks: Track[]): QueueState {
  const added = entries(tracks);
  const list = [...s.tracks, ...added];
  const index = s.index === -1 && list.length > 0 ? 0 : s.index;
  return withTracks(s, list, index, [...s.original, ...added]);
}

export function playNext(s: QueueState, incoming: Track[]): QueueState {
  const tracks = entries(incoming);
  const list = [...s.tracks];
  list.splice(s.index + 1, 0, ...tracks);
  const cur = current(s);
  const original = [...s.original];
  const at = cur ? original.indexOf(cur) + 1 : original.length;
  original.splice(at, 0, ...tracks);
  const index = s.index === -1 && list.length > 0 ? 0 : s.index;
  return withTracks(s, list, index, original);
}

export function removeAt(s: QueueState, i: number): QueueState {
  if (i < 0 || i >= s.tracks.length) return s;
  const removed = s.tracks[i];
  const list = s.tracks.filter((_, j) => j !== i);
  const original = [...s.original];
  const oi = original.indexOf(removed as Track);
  if (oi !== -1) original.splice(oi, 1);
  let index: number;
  if (list.length === 0) index = -1;
  else if (i < s.index) index = s.index - 1;
  else if (i === s.index) index = Math.min(s.index, list.length - 1);
  else index = s.index;
  return withTracks(s, list, index, original);
}

export function move(s: QueueState, from: number, to: number): QueueState {
  const n = s.tracks.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return s;
  const list = [...s.tracks];
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item as Track);
  let index = s.index;
  if (from === s.index) index = to;
  else if (from < s.index && to >= s.index) index = s.index - 1;
  else if (from > s.index && to <= s.index) index = s.index + 1;
  return withTracks(s, list, index, s.original);
}

export function clear(s: QueueState): QueueState {
  return { ...s, tracks: [], original: [], index: -1 };
}

export function next(s: QueueState, auto = false): { state: QueueState; ended: boolean } {
  if (s.index === -1) return { state: s, ended: true };
  if (auto && s.repeat === 'one') return { state: s, ended: false };
  if (s.index + 1 < s.tracks.length) return { state: { ...s, index: s.index + 1 }, ended: false };
  if (s.repeat === 'all') return { state: { ...s, index: 0 }, ended: false };
  return { state: s, ended: true };
}

export function prev(s: QueueState): QueueState {
  if (s.index > 0) return { ...s, index: s.index - 1 };
  if (s.repeat === 'all' && s.tracks.length > 0) return { ...s, index: s.tracks.length - 1 };
  return s;
}

export function toggleShuffle(s: QueueState, random = Math.random): QueueState {
  if (!s.shuffled) {
    const played = s.tracks.slice(0, s.index + 1);
    const rest = s.tracks.slice(s.index + 1);
    shuffleInPlace(rest, random);
    return { ...s, tracks: [...played, ...rest], original: s.tracks, shuffled: true };
  }
  const cur = current(s);
  const list = [...s.original];
  const found = cur ? list.indexOf(cur) : -1;
  const index = list.length === 0 ? -1 : found !== -1 ? found : Math.min(Math.max(s.index, 0), list.length - 1);
  return { ...s, tracks: list, original: list, index, shuffled: false };
}

export function setRepeat(s: QueueState, mode: RepeatMode): QueueState {
  return { ...s, repeat: mode };
}
