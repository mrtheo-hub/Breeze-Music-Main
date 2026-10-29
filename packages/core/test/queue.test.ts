import { describe, expect, it } from 'vitest';
import {
  clear,
  current,
  emptyQueue,
  enqueue,
  move,
  next,
  playNext,
  prev,
  removeAt,
  setQueue,
  setRepeat,
  toggleShuffle,
} from '../src/queue';
import type { Track } from '../src/types';

const t = (id: string): Track => ({ id, title: id, artists: [], thumbnails: [] });
const ids = (tracks: Track[]) => tracks.map((x) => x.id);
const abcde = () => setQueue(emptyQueue(), ['a', 'b', 'c', 'd', 'e'].map(t), 1);

describe('setQueue / current', () => {
  it('starts empty', () => {
    expect(emptyQueue().index).toBe(-1);
    expect(current(emptyQueue())).toBeNull();
  });

  it('clamps the start index', () => {
    expect(setQueue(emptyQueue(), [t('a'), t('b')], 9).index).toBe(1);
    expect(setQueue(emptyQueue(), [t('a'), t('b')], -3).index).toBe(0);
  });

  it('empty list gives index -1', () => {
    expect(setQueue(abcde(), []).index).toBe(-1);
  });

  it('does not mutate the input array', () => {
    const list = [t('a'), t('b')];
    setQueue(emptyQueue(), list).tracks.push(t('z'));
    expect(ids(list)).toEqual(['a', 'b']);
  });
});

describe('next / prev', () => {
  it('advances', () => {
    const r = next(abcde());
    expect(current(r.state)?.id).toBe('c');
    expect(r.ended).toBe(false);
  });

  it('ends at the last track with repeat off', () => {
    const last = setQueue(emptyQueue(), [t('a'), t('b')], 1);
    const r = next(last);
    expect(r.ended).toBe(true);
    expect(r.state.index).toBe(1);
  });

  it('wraps with repeat all', () => {
    const last = setRepeat(setQueue(emptyQueue(), [t('a'), t('b')], 1), 'all');
    expect(current(next(last).state)?.id).toBe('a');
  });

  it('repeat one replays on auto but skips on manual next', () => {
    const s = setRepeat(abcde(), 'one');
    expect(current(next(s, true).state)?.id).toBe('b');
    expect(current(next(s, false).state)?.id).toBe('c');
  });

  it('empty queue reports ended', () => {
    expect(next(emptyQueue()).ended).toBe(true);
  });

  it('prev stays at the start with repeat off and wraps with repeat all', () => {
    const first = setQueue(emptyQueue(), [t('a'), t('b')], 0);
    expect(prev(first).index).toBe(0);
    expect(prev(setRepeat(first, 'all')).index).toBe(1);
    expect(prev(abcde()).index).toBe(0);
  });
});

describe('editing', () => {
  it('enqueue into an empty queue selects the first track', () => {
    const s = enqueue(emptyQueue(), [t('a'), t('b')]);
    expect(s.index).toBe(0);
    expect(ids(s.tracks)).toEqual(['a', 'b']);
  });

  it('playNext inserts right after the current track', () => {
    const s = playNext(abcde(), [t('x'), t('y')]);
    expect(ids(s.tracks)).toEqual(['a', 'b', 'x', 'y', 'c', 'd', 'e']);
    expect(current(s)?.id).toBe('b');
  });

  it('removing before the current track keeps the same song playing', () => {
    const s = removeAt(abcde(), 0);
    expect(current(s)?.id).toBe('b');
  });

  it('removing after the current track keeps the index', () => {
    expect(removeAt(abcde(), 3).index).toBe(1);
  });

  it('removing the current track selects the next one', () => {
    expect(current(removeAt(abcde(), 1))?.id).toBe('c');
  });

  it('removing the current track when it is last selects the new last', () => {
    const s = setQueue(emptyQueue(), [t('a'), t('b')], 1);
    const r = removeAt(s, 1);
    expect(r.index).toBe(0);
    expect(current(r)?.id).toBe('a');
  });

  it('removing the only track empties the queue', () => {
    expect(removeAt(setQueue(emptyQueue(), [t('a')]), 0).index).toBe(-1);
  });

  it('out-of-range remove is a no-op', () => {
    const s = abcde();
    expect(removeAt(s, 99)).toBe(s);
  });

  it('moving the current track follows it', () => {
    const s = move(abcde(), 1, 4);
    expect(ids(s.tracks)).toEqual(['a', 'c', 'd', 'e', 'b']);
    expect(current(s)?.id).toBe('b');
  });

  it('moving a track across the current one keeps the same song playing', () => {
    expect(current(move(abcde(), 0, 3))?.id).toBe('b');
    expect(current(move(abcde(), 4, 0))?.id).toBe('b');
  });

  it('clear empties everything', () => {
    const s = clear(abcde());
    expect(s.tracks).toEqual([]);
    expect(s.index).toBe(-1);
  });
});

describe('shuffle', () => {
  it('keeps played tracks in place and shuffles the rest', () => {
    const s = toggleShuffle(abcde(), () => 0);
    expect(s.shuffled).toBe(true);
    expect(ids(s.tracks)).toEqual(['a', 'b', 'd', 'e', 'c']);
    expect(current(s)?.id).toBe('b');
  });

  it('unshuffle restores the original order and keeps the current track', () => {
    const shuffled = next(toggleShuffle(abcde(), () => 0)).state; // now on 'd'
    const s = toggleShuffle(shuffled);
    expect(s.shuffled).toBe(false);
    expect(ids(s.tracks)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(current(s)?.id).toBe('d');
  });

  it('tracks added while shuffled survive unshuffle', () => {
    const s = toggleShuffle(enqueue(toggleShuffle(abcde(), () => 0), [t('z')]));
    expect(ids(s.tracks)).toEqual(['a', 'b', 'c', 'd', 'e', 'z']);
  });

  it('tracks removed while shuffled stay removed after unshuffle', () => {
    const shuffled = toggleShuffle(abcde(), () => 0); // a b d e c
    const s = toggleShuffle(removeAt(shuffled, 4)); // remove c
    expect(ids(s.tracks)).toEqual(['a', 'b', 'd', 'e']);
  });

  it('setQueue while shuffled keeps shuffle on', () => {
    const s = setQueue(toggleShuffle(emptyQueue()), ['a', 'b', 'c'].map(t), 0, () => 0);
    expect(s.shuffled).toBe(true);
    expect(current(s)?.id).toBe('a');
  });
});
