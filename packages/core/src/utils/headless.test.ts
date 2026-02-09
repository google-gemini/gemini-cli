/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isHeadlessMode } from './headless.js';
import process from 'node:process';

describe('isHeadlessMode', () => {
  const originalStdoutIsTTY = process.stdout.isTTY;
  const originalStdinIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.stubEnv('CI', '');
    vi.stubEnv('GITHUB_ACTIONS', '');
    // We can't easily stub process.stdout.isTTY with vi.stubEnv
    // So we'll use Object.defineProperty
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalStdoutIsTTY,
      configurable: true,
    });
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalStdinIsTTY,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('should return false in a normal TTY environment', () => {
    expect(isHeadlessMode()).toBe(false);
  });

  it('should return true if CI environment variable is "true"', () => {
    vi.stubEnv('CI', 'true');
    expect(isHeadlessMode()).toBe(true);
  });

  it('should return true if GITHUB_ACTIONS environment variable is "true"', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    expect(isHeadlessMode()).toBe(true);
  });

  it('should return true if stdout is not a TTY', () => {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
    });
    expect(isHeadlessMode()).toBe(true);
  });

  it('should return true if stdin is not a TTY', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      configurable: true,
    });
    expect(isHeadlessMode()).toBe(true);
  });

  it('should return true if stdin is a TTY but stdout is not', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
    });
    expect(isHeadlessMode()).toBe(true);
  });

  it('should return true if stdout is a TTY but stdin is not', () => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      configurable: true,
    });
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
    expect(isHeadlessMode()).toBe(true);
  });

  it('should return true if a prompt option is provided', () => {
    expect(isHeadlessMode({ prompt: 'test prompt' })).toBe(true);
    expect(isHeadlessMode({ prompt: true })).toBe(true);
  });

  it('should return false if query is provided but it is still a TTY', () => {
    // Note: per current logic, query alone doesn't force headless if TTY
    // This matches the existing behavior in packages/cli/src/config/config.ts
    expect(isHeadlessMode({ query: 'test query' })).toBe(false);
  });

  it('should handle undefined process.stdout gracefully', () => {
    const originalStdout = process.stdout;
    // @ts-expect-error - testing edge case
    delete process.stdout;

    try {
      expect(isHeadlessMode()).toBe(false);
    } finally {
      Object.defineProperty(process, 'stdout', {
        value: originalStdout,
        configurable: true,
      });
    }
  });

  it('should handle undefined process.stdin gracefully', () => {
    const originalStdin = process.stdin;
    // @ts-expect-error - testing edge case
    delete process.stdin;

    try {
      expect(isHeadlessMode()).toBe(false);
    } finally {
      Object.defineProperty(process, 'stdin', {
        value: originalStdin,
        configurable: true,
      });
    }
  });

  it('should return true if multiple headless indicators are set', () => {
    vi.stubEnv('CI', 'true');
    Object.defineProperty(process.stdout, 'isTTY', {
      value: false,
      configurable: true,
    });
    expect(isHeadlessMode({ prompt: true })).toBe(true);
  });
});
