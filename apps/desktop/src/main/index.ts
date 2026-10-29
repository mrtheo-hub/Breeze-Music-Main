import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { registerIpc } from './ipc';
import { isAppUrl } from './navigation';
import { createServices } from './services';
import { JsonFileStorage } from './storage';

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 880,
    minHeight: 600,
    show: false,
    title: 'Breeze',
    backgroundColor: '#0e1116',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win?.show());
  // Never open other windows in-app; https links go to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  const rendererFile = join(import.meta.dirname, '../renderer/index.html');
  // A dropped link or file must not navigate the window: the preload (window.breeze) would reach that page.
  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url, devUrl, rendererFile)) return;
    event.preventDefault();
    if (url.startsWith('https:')) void shell.openExternal(url);
  });
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(rendererFile);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app
    .whenReady()
    .then(() => {
      registerIpc(ipcMain, createServices(new JsonFileStorage(app.getPath('userData'))));
      createWindow();
    })
    .catch((e: unknown) => {
      console.error('Breeze failed to start', e);
      app.quit();
    });
  app.on('window-all-closed', () => app.quit());
}
