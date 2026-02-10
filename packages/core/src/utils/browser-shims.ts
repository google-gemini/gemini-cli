/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

interface ShimmedElement {
  style: Record<string, string>;
  classList: {
    add: () => void;
    remove: () => void;
    contains: () => boolean;
    toggle: () => void;
  };
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  appendChild: (node: ShimmedElement) => void;
  removeChild: (node: ShimmedElement) => void;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string, value: string) => void;
  hasAttribute: (name: string) => boolean;
  getAttribute: (name: string) => string | null;
  getBoundingClientRect: () => {
    width: number;
    height: number;
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
  focus: () => void;
  blur: () => void;
  getContext?: () => {
    measureText: () => { width: number; height: number };
    fillRect: () => void;
    fillText: () => void;
    drawImage: () => void;
    beginPath: () => void;
    moveTo: () => void;
    lineTo: () => void;
    stroke: () => void;
    arc: () => void;
    fill: () => void;
    setTransform: () => void;
    save: () => void;
    restore: () => void;
    scale: () => void;
    clearRect: () => void;
  };
  width?: number;
  height?: number;
}

interface ShimmedDocument {
  createElement: (tag: string) => ShimmedElement;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  getElementById: (id: string) => ShimmedElement | null;
  body: ShimmedElement;
  documentElement: ShimmedElement;
}

interface ShimmedNavigator {
  userAgent: string;
  clipboard: {
    writeText: (text: string) => Promise<void>;
    readText: () => Promise<string>;
  };
}

interface ShimmedResponse {
  ok: boolean;
  status: number;
  statusText: string;
  arrayBuffer: () => Promise<ArrayBufferLike>;
}

interface GlobalWithShims {
  self: Window & GlobalWithShims;
  window: Window & GlobalWithShims;
  name: string;
  location: Location & {
    href: string;
    origin: string;
    protocol: string;
    host: string;
    hostname: string;
    port: string;
    pathname: string;
    search: string;
    hash: string;
    toString: () => string;
  };
  document: Document & ShimmedDocument;
  navigator: Navigator & ShimmedNavigator;
  fetch: (url: string | URL) => Promise<ShimmedResponse>;
  ResizeObserver: new () => {
    observe: () => void;
    unobserve: () => void;
    disconnect: () => void;
  };
  requestAnimationFrame: (cb: (time: number) => void) => number;
  cancelAnimationFrame: (id: number) => void;
}

/**
 * Minimal browser shims to allow web-focused libraries (like ghostty-web)
 * to run in a Node.js environment.
 */
export function installBrowserShims(): void {
  // Use a targeted cast to avoid 'any' or 'unknown'
  // We cast to our specific interface which is a subset of globalThis
  const global = globalThis as typeof globalThis & GlobalWithShims;

  if (typeof global.self === 'undefined') {
    global.self = global as any;
  }

  if (typeof global.window === 'undefined') {
    global.window = global as any;
  }

  if (typeof global.name === 'undefined') {
    global.name = 'gemini-cli-shim';
  }

  if (typeof global.location === 'undefined') {
    global.location = {
      href: `file://${process.cwd()}/`,
      origin: 'file://',
      protocol: 'file:',
      host: '',
      hostname: '',
      port: '',
      pathname: process.cwd() + '/',
      search: '',
      hash: '',
      ancestorOrigins: {
        length: 0,
        contains: () => false,
        item: () => null,
      } as any,
      assign: () => {},
      reload: () => {},
      replace: () => {},
      toString() {
        return this.href;
      },
    } as any;
  }

  const createBaseElement = (): any => ({
    style: {},
    classList: {
      add: (): void => {},
      remove: (): void => {},
      contains: (): boolean => false,
      toggle: (): void => {},
    },
    addEventListener: (): void => {},
    removeEventListener: (): void => {},
    appendChild: (node: any): any => node,
    removeChild: (node: any): any => node,
    setAttribute: (): void => {},
    removeAttribute: (): void => {},
    hasAttribute: (): boolean => false,
    getAttribute: (): string | null => null,
    getBoundingClientRect: () => ({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
    }),
    focus: (): void => {},
    blur: (): void => {},
    // HTMLElement properties stubs
    accessKey: '',
    accessKeyLabel: '',
    autocapitalize: '',
    dir: '',
    draggable: false,
    hidden: false,
    inert: false,
    lang: '',
    spellcheck: false,
    title: '',
  });

  if (typeof global.document === 'undefined') {
    global.document = {
      createElement: (tag: string): any => {
        const el = createBaseElement();
        if (tag === 'canvas') {
          return {
            ...el,
            getContext: () => ({
              measureText: () => ({
                width: 10,
                height: 20,
              }),
              fillRect: (): void => {},
              fillText: (): void => {},
              drawImage: (): void => {},
              beginPath: (): void => {},
              moveTo: (): void => {},
              lineTo: (): void => {},
              stroke: (): void => {},
              arc: (): void => {},
              fill: (): void => {},
              setTransform: (): void => {},
              save: (): void => {},
              restore: (): void => {},
              scale: (): void => {},
              clearRect: (): void => {},
            }),
            width: 800,
            height: 600,
          };
        }
        return el;
      },
      createElementNS: (_ns: string, tag: string): any => {
        return createBaseElement();
      },
      addEventListener: (): void => {},
      removeEventListener: (): void => {},
      getElementById: (): null => null,
      body: createBaseElement(),
      documentElement: createBaseElement(),
    } as any;
  }

  if (typeof global.navigator === 'undefined') {
    global.navigator = {
      userAgent: 'Node.js',
      clipboard: {
        writeText: async (): Promise<void> => {},
        readText: async (): Promise<string> => '',
      },
    } as any;
  }

  if (typeof global.fetch === 'undefined') {
    global.fetch = (async (url: string | URL): Promise<ShimmedResponse> => {
      const urlStr = url.toString();
      if (urlStr.startsWith('file://')) {
        const filePath = fileURLToPath(urlStr);
        const buffer = fs.readFileSync(filePath);
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: async (): Promise<ArrayBufferLike> =>
            buffer.buffer.slice(
              buffer.byteOffset,
              buffer.byteOffset + buffer.byteLength,
            ),
        };
      }
      if (urlStr.startsWith('data:')) {
        const commaIndex = urlStr.indexOf(',');
        if (commaIndex === -1) {
          throw new Error('Invalid data URL');
        }
        const base64 = urlStr.slice(commaIndex + 1);
        const buffer = Buffer.from(base64, 'base64');
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: async (): Promise<ArrayBufferLike> =>
            buffer.buffer.slice(
              buffer.byteOffset,
              buffer.byteOffset + buffer.byteLength,
            ),
        };
      }
      throw new Error(`Fetch not implemented for URL: ${urlStr}`);
    }) as any;
  }

  if (typeof global.ResizeObserver === 'undefined') {
    global.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as any;
  }

  if (typeof global.requestAnimationFrame === 'undefined') {
    global.requestAnimationFrame = (cb: (time: number) => void): number => {
      return setTimeout(() => cb(Date.now()), 16) as any;
    };
  }

  if (typeof global.cancelAnimationFrame === 'undefined') {
    global.cancelAnimationFrame = (id: number): void => {
      clearTimeout(id);
    };
  }

  // Silence noisy ghostty-vt warnings in Node.js environment
  if (!(console.log as any).__isShimmed) {
    const originalLog = console.log;
    const shimmedLog = (...args: any[]) => {
      const isGhosttyWarning =
        args.length > 0 &&
        typeof args[0] === 'string' &&
        args[0].includes('[ghostty-vt]') &&
        args.some((arg) => typeof arg === 'string' && arg.includes('warning'));

      if (isGhosttyWarning) {
        return;
      }
      originalLog.apply(console, args);
    };
    (shimmedLog as any).__isShimmed = true;
    console.log = shimmedLog;
  }
}
