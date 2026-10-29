import type { HomeSection, SearchResult } from '@breeze/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorToast } from '../src/components/ErrorToast';
import { PlayerBar } from '../src/components/PlayerBar';
import { HomeScreen } from '../src/screens/HomeScreen';
import { SearchScreen } from '../src/screens/SearchScreen';
import { flush, renderWithApp, t } from './helpers';

const songs = (...ids: string[]): SearchResult => ({
  songs: ids.map((id) => t(id)),
  albums: [],
  artists: [],
  playlists: [],
});

describe('SearchScreen', () => {
  it('prompts before typing', () => {
    renderWithApp(<SearchScreen debounceMs={0} />);
    expect(screen.getByText('Find something to play')).toBeTruthy();
  });

  it('searches songs and plays the clicked one in context', async () => {
    const search = vi.fn(async () => songs('a', 'b'));
    const { engine } = renderWithApp(<SearchScreen debounceMs={0} />, { source: { search } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search songs' }), { target: { value: ' daft ' } });
    fireEvent.click(await screen.findByRole('button', { name: /Song b/ }));
    await flush();
    expect(search).toHaveBeenCalledWith('daft', 'songs');
    expect(engine.loaded).toEqual(['b']);
  });

  it('says when nothing matched', async () => {
    renderWithApp(<SearchScreen debounceMs={0} />, { source: { search: async () => songs() } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzzz' } });
    expect(await screen.findByText('No songs found')).toBeTruthy();
  });

  it('shows the error and retries', async () => {
    const search = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    renderWithApp(<SearchScreen debounceMs={0} />, { source: { search } });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'x' } });
    expect((await screen.findByRole('alert')).textContent).toContain("Can't reach YouTube Music");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
  });

  it('returns to the prompt when the box is cleared', async () => {
    renderWithApp(<SearchScreen debounceMs={0} />, { source: { search: async () => songs('a') } });
    const box = screen.getByRole('searchbox');
    fireEvent.change(box, { target: { value: 'a' } });
    await screen.findByRole('button', { name: /Song a/ });
    fireEvent.change(box, { target: { value: '  ' } });
    expect(await screen.findByText('Find something to play')).toBeTruthy();
  });
});

describe('HomeScreen', () => {
  it('shows sections that contain songs and plays within the section', async () => {
    const home: HomeSection[] = [
      {
        title: 'Quick picks',
        items: [
          { kind: 'track', track: t('a') },
          { kind: 'album', album: { id: 'al', title: 'Album', thumbnails: [] } },
          { kind: 'track', track: t('b') },
        ],
      },
      { title: 'Albums only', items: [{ kind: 'album', album: { id: 'al2', title: 'X', thumbnails: [] } }] },
    ];
    const { engine, player } = renderWithApp(<HomeScreen />, { source: { home: async () => home } });
    expect(await screen.findByText('Quick picks')).toBeTruthy();
    expect(screen.queryByText('Albums only')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Song b/ }));
    await flush();
    expect(engine.loaded).toEqual(['b']);
    expect(player.getState().queue.tracks.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('PlayerBar', () => {
  it('starts empty, then shows the playing track and controls', async () => {
    const { player } = renderWithApp(<PlayerBar />);
    expect(screen.getByText('Nothing playing')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true);
    await act(() => player.playTracks([t('a', { artists: [] })]));
    expect(screen.getByText('Song a')).toBeTruthy();
    expect(screen.getByText('Unknown artist')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
  });

  it('cycles the repeat label', () => {
    renderWithApp(<PlayerBar />);
    fireEvent.click(screen.getByRole('button', { name: 'Repeat: off' }));
    expect(screen.getByRole('button', { name: 'Repeat: all' })).toBeTruthy();
  });
});

describe('ErrorToast', () => {
  it('shows playback errors and can be dismissed', async () => {
    const { engine, player } = renderWithApp(<ErrorToast />);
    engine.failIds.add('a');
    await act(() => player.playTracks([t('a')]));
    expect(screen.getByRole('status').textContent).toContain('YouTube is limiting requests');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
