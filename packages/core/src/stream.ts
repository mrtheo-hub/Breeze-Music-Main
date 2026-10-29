import vm from 'node:vm';
import { Innertube, Platform } from 'youtubei.js';
import { guard, SourceError } from './errors';
import type { AudioQuality } from './types';

export interface StreamInfo {
  url: string;
  mimeType: string;
  bitrate: number;
  /** ms since epoch after which the URL stops working. */
  expiresAt: number;
}

export interface RawFormat {
  has_audio?: boolean;
  has_video?: boolean;
  bitrate?: number;
  mime_type?: string;
  decipher(player: unknown): Promise<string> | string;
}

/** The youtubei.js calls the resolver needs. Each info call may throw. */
export interface StreamClient {
  player: unknown;
  musicInfo(id: string): Promise<any>;
  iosInfo(id: string): Promise<any>;
}

const SIX_HOURS = 6 * 3600 * 1000;

export function pickFormat(formats: RawFormat[], quality: AudioQuality): RawFormat | null {
  const audio = formats.filter((f) => f.has_audio && !f.has_video).sort((a, b) => (a.bitrate ?? 0) - (b.bitrate ?? 0));
  if (audio.length === 0) return null;
  const at = quality === 'low' ? 0 : quality === 'medium' ? Math.floor((audio.length - 1) / 2) : audio.length - 1;
  return audio[at] ?? null;
}

export function expiryOf(url: string, now = Date.now()): number {
  const expire = Number(new URL(url).searchParams.get('expire'));
  return Number.isFinite(expire) && expire > 0 ? expire * 1000 : now + SIX_HOURS;
}

let evaluatorInstalled = false;

/**
 * youtubei.js needs a JS evaluator to decipher stream URLs. YouTube's player code runs
 * in a fresh vm context (JS builtins + env only: no process, require or Electron) with a timeout.
 */
export function installVmEvaluator(): void {
  if (evaluatorInstalled) return;
  Platform.shim.eval = (data: { output: string }, env: Record<string, unknown>) =>
    vm.runInNewContext(`(function(){${data.output}})()`, { ...env }, { timeout: 2000 });
  evaluatorInstalled = true;
}

export class StreamResolver {
  constructor(private readonly client: StreamClient) {}

  static create(): Promise<StreamResolver> {
    return guard(async () => {
      installVmEvaluator();
      const yt = await Innertube.create({ retrieve_player: true });
      return new StreamResolver({
        player: yt.session.player,
        musicInfo: (id) => yt.music.getInfo(id),
        iosInfo: (id) => yt.getBasicInfo(id, { client: 'IOS' }),
      });
    });
  }

  /** Try the YouTube Music client, then IOS. Spiked 2026-10-29: both give audio/mp4 that plays. */
  resolve(id: string, quality: AudioQuality = 'high'): Promise<StreamInfo> {
    return guard(async () => {
      let lastError: unknown = new SourceError('not_found', `No playable audio for ${id}`);
      for (const load of [this.client.musicInfo, this.client.iosInfo]) {
        try {
          const info = await load.call(this.client, id);
          const format = pickFormat(info?.streaming_data?.adaptive_formats ?? [], quality);
          if (!format) continue;
          const url = await format.decipher(this.client.player);
          return {
            url,
            mimeType: format.mime_type ?? 'audio/mp4',
            bitrate: format.bitrate ?? 0,
            expiresAt: expiryOf(url),
          };
        } catch (e) {
          lastError = e;
        }
      }
      throw lastError;
    });
  }
}
