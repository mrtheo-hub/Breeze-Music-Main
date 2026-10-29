import '@breeze/ui/styles.css';
import { DEFAULT_SETTINGS } from '@breeze/core';
import { App, PlayerController } from '@breeze/ui';
import { createRoot } from 'react-dom/client';
import { HtmlAudioEngine } from './html-audio-engine';
import { ipcSource, ipcStorage, ipcStreams } from './ipc-adapters';

const api = window.breeze;
const source = ipcSource(api);
const storage = ipcStorage(api);
const settings = await storage.getSettings().catch(() => DEFAULT_SETTINGS);

const engine = new HtmlAudioEngine(ipcStreams(api), () => settings.audioQuality);
const player = new PlayerController({ engine, source, storage, autoplay: () => settings.autoplay }, settings.volume);

createRoot(document.getElementById('root') as HTMLElement).render(
  <App player={player} services={{ source, storage }} />,
);
