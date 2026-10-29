import { describe, expect, it } from 'vitest';
import { lineAt, parseLrc } from '../src/lrc';

describe('parseLrc', () => {
  it('parses 2-digit fractions as centiseconds', () => {
    expect(parseLrc('[00:12.34]Hello')).toEqual([{ timeMs: 12340, text: 'Hello' }]);
  });

  it('parses 1-digit and 3-digit fractions and no fraction', () => {
    expect(parseLrc('[00:01.5]a\n[00:01.123]b\n[01:02]c').map((l) => l.timeMs)).toEqual([1123, 1500, 62000]);
  });

  it('expands several timestamps on one line and sorts', () => {
    expect(parseLrc('[00:05.00]Two\n[00:01.00][00:09.00]Chorus')).toEqual([
      { timeMs: 1000, text: 'Chorus' },
      { timeMs: 5000, text: 'Two' },
      { timeMs: 9000, text: 'Chorus' },
    ]);
  });

  it('ignores metadata tags and untimed lines', () => {
    expect(parseLrc('[ar:Someone]\n[ti:Song]\nplain line\n[00:01.00]x')).toEqual([{ timeMs: 1000, text: 'x' }]);
  });

  it('applies a positive offset by showing lines earlier, never below 0', () => {
    expect(parseLrc('[offset:+500]\n[00:02.00]a\n[00:00.20]b').map((l) => l.timeMs)).toEqual([0, 1500]);
  });

  it('handles CRLF and keeps empty timed lines as gaps', () => {
    expect(parseLrc('[00:01.00]a\r\n[00:02.00]\r\n')).toEqual([
      { timeMs: 1000, text: 'a' },
      { timeMs: 2000, text: '' },
    ]);
  });

  it('returns [] for empty input', () => {
    expect(parseLrc('')).toEqual([]);
  });
});

describe('lineAt', () => {
  const lines = parseLrc('[00:01.00]a\n[00:03.00]b\n[00:05.00]c');

  it('is -1 before the first line', () => {
    expect(lineAt(lines, 500)).toBe(-1);
  });

  it('matches exact times and gaps between lines', () => {
    expect(lineAt(lines, 1000)).toBe(0);
    expect(lineAt(lines, 4999)).toBe(1);
    expect(lineAt(lines, 60_000)).toBe(2);
  });

  it('is -1 for no lines', () => {
    expect(lineAt([], 1000)).toBe(-1);
  });
});
