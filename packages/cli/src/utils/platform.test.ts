/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { canOpenBrowser } from './platform.js';

describe('canOpenBrowser', () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Restore original platform and env before each test
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
    });
    process.env = { ...originalEnv };
  });

  it('should return false on Linux when DISPLAY is not set', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    delete process.env.DISPLAY;
    expect(canOpenBrowser()).toBe(false);
  });

  it('should return true on Linux when DISPLAY is set', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.DISPLAY = ':0';
    expect(canOpenBrowser()).toBe(true);
  });

  it('should return true on a non-Linux platform (e.g., macOS)', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    delete process.env.DISPLAY;
    expect(canOpenBrowser()).toBe(true);
  });

  it('should return true on another non-Linux platform (e.g., Windows)', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    delete process.env.DISPLAY;
    expect(canOpenBrowser()).toBe(true);
  });
});
