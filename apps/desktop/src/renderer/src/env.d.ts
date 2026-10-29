/// <reference types="vite/client" />
import type { BreezeApi } from '../../shared/ipc';

declare global {
  interface Window {
    breeze: BreezeApi;
  }
}
