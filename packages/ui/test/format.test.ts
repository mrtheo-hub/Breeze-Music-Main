import { describe, expect, it } from 'vitest';
import { artistNames, formatTime, pickThumb, uniqueById } from '../src/format';

describe('formatTime', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65.9, '1:05'],
    [3725, '1:02:05'],
    [Number.NaN, '0:00'],
    [-3, '0:00'],
  ])('%s -> %s', (sec, out) => {
    expect(formatTime(sec)).toBe(out);
  });
});

describe('artistNames', () => {
  it('joins names and falls back to Unknown artist', () => {
    expect(artistNames([{ name: 'A' }, { name: 'B' }])).toBe('A, B');
    expect(artistNames([])).toBe('Unknown artist');
    expect(artistNames([{ name: '' }])).toBe('Unknown artist');
  });
});

describe('pickThumb', () => {
  const thumbs = [
    { url: 'big', width: 544, height: 544 },
    { url: 'small', width: 60, height: 60 },
    { url: 'mid', width: 120, height: 120 },
  ];

  it('picks the smallest image at least the requested size', () => {
    expect(pickThumb(thumbs, 100)).toBe('mid');
  });

  it('falls back to the largest, or undefined when empty', () => {
    expect(pickThumb(thumbs, 2000)).toBe('big');
    expect(pickThumb([], 100)).toBeUndefined();
  });
});

describe('uniqueById', () => {
  it('keeps the first of each id', () => {
    expect(
      uniqueById([
        { id: 'a', n: 1 },
        { id: 'b', n: 2 },
        { id: 'a', n: 3 },
      ]).map((x) => x.n),
    ).toEqual([1, 2]);
  });
});
