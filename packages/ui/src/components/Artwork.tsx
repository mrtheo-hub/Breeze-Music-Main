import type { Thumbnail } from '@breeze/core';
import { Music } from 'lucide-react';
import { useState } from 'react';
import { pickThumb } from '../format';

export function Artwork({ thumbnails, size, className }: { thumbnails: Thumbnail[]; size: number; className: string }) {
  const url = pickThumb(thumbnails, size * 2); // 2x for high-DPI screens
  const [failed, setFailed] = useState<string | null>(null);
  if (!url || failed === url) {
    return (
      <span className={`${className} art-empty`} aria-hidden="true">
        <Music size={Math.round(size / 2.4)} />
      </span>
    );
  }
  return (
    <img
      className={className}
      src={url}
      alt=""
      loading="lazy"
      width={size}
      height={size}
      onError={() => setFailed(url)}
    />
  );
}
