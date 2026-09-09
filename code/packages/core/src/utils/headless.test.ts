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

  it('should return true if query is provided', () => {
    expect(isHeadlessMode({ query: 'test query' })).toBe(true);
  });

  it('should return true if -p or --prompt is in process.argv as a fallback', () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'index.js', '-p', 'hello'];
    try {
      expect(isHeadlessMode()).toBe(true);
    } finally {
      process.argv = originalArgv;
    }

    process.argv = ['node', 'index.js', '--prompt', 'hello'];
    try {
      expect(isHeadlessMode()).toBe(true);
    } finally {
      process.argv = originalArgv;
    }
  });

  it('should return false if -y or --yolo is in process.argv as a fallback', () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'index.js', '-y'];
    try {
      expect(isHeadlessMode()).toBe(false);
    } finally {
      process.argv = originalArgv;
    }

    process.argv = ['node', 'index.js', '--yolo'];
    try {
      expect(isHeadlessMode()).toBe(false);
    } finally {
      process.argv = originalArgv;
    }
  });

  it('should handle undefined process.stdout gracefully', () => {
    const originalStdout = process.stdout;
    Object.defineProperty(process, 'stdout', {
      value: undefined,
      configurable: true,
    });

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
    Object.defineProperty(process, 'stdin', {
      value: undefined,
      configurable: true,
    });

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
