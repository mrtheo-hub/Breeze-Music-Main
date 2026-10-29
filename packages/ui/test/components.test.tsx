import { SourceError } from '@breeze/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorState } from '../src/components/States';
import { TrackRow } from '../src/components/TrackRow';
import { t } from './helpers';

describe('TrackRow', () => {
  it('shows title, artists and duration, and plays on click', () => {
    const onPlay = vi.fn();
    render(<TrackRow track={t('a', { durationSec: 125 })} onPlay={onPlay} />);
    const row = screen.getByRole('button', { name: /Song a/ });
    expect(row.textContent).toContain('Artist a');
    expect(row.textContent).toContain('2:05');
    fireEvent.click(row);
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('handles missing artists, artwork and duration without placeholders leaking', () => {
    const { container } = render(<TrackRow track={t('b', { artists: [], thumbnails: [] })} onPlay={() => {}} />);
    expect(container.textContent).toContain('Unknown artist');
    expect(container.textContent).not.toContain('undefined');
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.art-empty')).not.toBeNull();
  });

  it('marks the playing row', () => {
    render(<TrackRow track={t('a')} active onPlay={() => {}} />);
    expect(screen.getByRole('button').getAttribute('aria-current')).toBe('true');
  });

  it('swaps a broken image for the placeholder', () => {
    const { container } = render(
      <TrackRow
        track={t('a', { thumbnails: [{ url: 'https://x/broken.jpg', width: 60, height: 60 }] })}
        onPlay={() => {}}
      />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('explains the error kind and retries', () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new SourceError('network', 'fetch failed')} onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain("Can't reach YouTube Music");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
