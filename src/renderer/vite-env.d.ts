/// <reference types="vite/client" />

import type { IsoDesktopApi } from '../shared/ipc';

declare global {
  interface Window {
    iso11820: IsoDesktopApi;
  }
}

export {};
