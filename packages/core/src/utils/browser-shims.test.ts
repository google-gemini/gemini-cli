/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { installBrowserShims } from './browser-shims.js';
import { describe, it, expect, beforeAll } from 'vitest';
import { init, Terminal } from 'ghostty-web';

describe('browser-shims', () => {
  beforeAll(() => {
    installBrowserShims();
  });

  it('should install self and window shims', () => {
    expect(globalThis.self).toBeDefined();
    expect(globalThis.window).toBeDefined();
  });

  it('should install document shim with createElement', () => {
    expect(globalThis.document).toBeDefined();
    expect(typeof globalThis.document.createElement).toBe('function');

    const div = globalThis.document.createElement('div');
    expect(div).toBeDefined();
  });

  it('should install fetch shim that handles file and data URLs', async () => {
    expect(typeof globalThis.fetch).toBe('function');

    // Test data URL (minimal WASM-like header)
    const dataUrl =
      'data:application/wasm;base64,AGFzbQEAAAABBgBgAX5/AX8DAgEABwcBA2xvZwAA';
    const response = await globalThis.fetch(dataUrl);
    expect(response.ok).toBe(true);
    const buffer = await response.arrayBuffer();
    expect(buffer).toBeInstanceOf(ArrayBuffer);
  });

  it('should allow ghostty-web to initialize and create a terminal', async () => {
    await init();
    const term = new Terminal({
      cols: 80,
      rows: 24,
    });

    expect(term).toBeDefined();

    // Terminal needs to be opened to write
    // We use type casting to avoid 'any'
    const parent = globalThis.document.createElement('div');
    term.open(parent as unknown as HTMLElement);

    term.write('Pickle Rick was here');

    const line = term.buffer.active.getLine(0);
    expect(line?.translateToString(true)).toContain('Pickle Rick');
  });

  it('should shim console.log', () => {
    expect((console.log as any).__isShimmed).toBe(true);
  });
});
