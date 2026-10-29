import { contextBridge, ipcRenderer } from 'electron';
import { type BreezeApi, channel, METHOD_NAMES } from '../shared/ipc';

// Only named Breeze calls cross the bridge; the renderer never sees ipcRenderer itself.
const api = Object.fromEntries(
  METHOD_NAMES.map((name) => [name, (...args: unknown[]) => ipcRenderer.invoke(channel(name), ...args)]),
) as BreezeApi;

contextBridge.exposeInMainWorld('breeze', api);
