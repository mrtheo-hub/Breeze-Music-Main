import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isAppUrl } from '../src/main/navigation';

const file = resolve('/app/out/renderer/index.html');

describe('isAppUrl', () => {
  it('allows the dev server origin', () => {
    expect(isAppUrl('http://localhost:5173/', 'http://localhost:5173', file)).toBe(true);
    expect(isAppUrl('http://localhost:5173/#/search', 'http://localhost:5173/', file)).toBe(true);
  });

  it('blocks another origin', () => {
    expect(isAppUrl('http://localhost:9999/', 'http://localhost:5173', file)).toBe(false);
  });

  it('blocks a remote site', () => {
    expect(isAppUrl('https://evil.example', undefined, file)).toBe(false);
    expect(isAppUrl('https://evil.example', 'http://localhost:5173', file)).toBe(false);
  });

  it('allows the renderer index.html', () => {
    expect(isAppUrl(pathToFileURL(file).href, undefined, file)).toBe(true);
    expect(isAppUrl(`${pathToFileURL(file).href}#/x`, undefined, file)).toBe(true);
  });

  it('blocks another file path', () => {
    expect(isAppUrl(pathToFileURL(resolve('/other/secret.html')).href, undefined, file)).toBe(false);
  });

  it('blocks garbage', () => {
    expect(isAppUrl('not a url', undefined, file)).toBe(false);
  });
});
