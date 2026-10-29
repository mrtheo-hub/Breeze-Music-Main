// Types and constants only: the sandboxed preload imports this file.
import type { AudioQuality, MusicSource, Storage } from '@breeze/core';
import type { StreamInfo } from '@breeze/core/stream';
import type { Result } from './result';

export type Methods = MusicSource &
  Storage & {
    resolveStream(id: string, quality: AudioQuality): Promise<StreamInfo>;
  };

export type MethodName = keyof Methods;

export const METHOD_NAMES = [
  'home',
  'search',
  'track',
  'album',
  'artist',
  'playlist',
  'upNext',
  'getPlaylists',
  'savePlaylist',
  'deletePlaylist',
  'getSettings',
  'saveSettings',
  'addHistory',
  'getHistory',
  'resolveStream',
] as const satisfies readonly MethodName[];

/** Compile-time check that METHOD_NAMES lists every method. */
export const METHOD_NAMES_COMPLETE: [Exclude<MethodName, (typeof METHOD_NAMES)[number]>] extends [never]
  ? true
  : false = true;

export const channel = (name: MethodName): string => `breeze:${name}`;

export type BreezeApi = {
  [K in MethodName]: (...args: Parameters<Methods[K]>) => Promise<Result<Awaited<ReturnType<Methods[K]>>>>;
};
