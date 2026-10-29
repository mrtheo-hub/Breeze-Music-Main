import { channel, METHOD_NAMES, type Methods } from '../shared/ipc';
import { toResult } from '../shared/result';

/** The part of Electron's ipcMain this module uses (kept structural for tests). */
export interface IpcHandle {
  handle(channel: string, listener: (event: unknown, ...args: any[]) => unknown): void;
}

export function registerIpc(ipc: IpcHandle, impl: Methods): void {
  for (const name of METHOD_NAMES) {
    const fn = impl[name] as (...args: unknown[]) => Promise<unknown>;
    ipc.handle(channel(name), (_event, ...args: unknown[]) => toResult(() => fn.apply(impl, args)));
  }
}
