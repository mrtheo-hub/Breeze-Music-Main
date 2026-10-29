import type { ArtistRef, Thumbnail } from '@breeze/core';

export function formatTime(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return '0:00';
  const s = Math.floor(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function artistNames(artists: ArtistRef[]): string {
  const names = artists.map((a) => a.name).filter(Boolean);
  return names.length > 0 ? names.join(', ') : 'Unknown artist';
}

/** Smallest image at least `size` px wide, else the largest available. */
export function pickThumb(thumbs: Thumbnail[], size: number): string | undefined {
  const sorted = [...thumbs].sort((a, b) => a.width - b.width);
  return (sorted.find((t) => t.width >= size) ?? sorted.at(-1))?.url;
}

export function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && seen.add(item.id));
}
