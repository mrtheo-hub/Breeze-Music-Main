import { pathToFileURL } from 'node:url';

/** True when `url` is the app's own page: the dev server origin, or the packaged renderer index.html. */
export function isAppUrl(url: string, devUrl: string | undefined, rendererFile: string): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (devUrl) {
    try {
      return target.origin === new URL(devUrl).origin;
    } catch {
      return false;
    }
  }
  return target.protocol === 'file:' && target.pathname === pathToFileURL(rendererFile).pathname;
}
