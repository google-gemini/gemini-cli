/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CommandScanner } from './command-scanner.js';
import * as fs from 'node:fs/promises';

// Mock VS Code API
vi.mock('vscode', () => ({
  workspace: {
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn(),
      onDidChange: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  RelativePattern: vi.fn(),
}));

// Mock core utilities
vi.mock('@google/gemini-cli-core', () => ({
  homedir: () => '/mock/home',
}));

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
}));

describe('CommandScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('constructs without errors', () => {
    const scanner = new CommandScanner({ log: vi.fn() });
    expect(scanner).toBeDefined();
  });

  it('disposes without errors', () => {
    const scanner = new CommandScanner({ log: vi.fn() });
    expect(() => scanner.dispose()).not.toThrow();
  });

  it('returns error when commands directory is inaccessible', async () => {
    const logFn = vi.fn();

    // Mock fs.access to reject (directory doesn't exist or no permissions)
    vi.mocked(fs.access).mockRejectedValueOnce(
      new Error('ENOENT: no such file or directory'),
    );

    const scanner = new CommandScanner({ log: logFn });
    const result = await scanner.scanCommands();

    expect(result.commands).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('ENOENT');
    expect(logFn).toHaveBeenCalledWith(
      expect.stringContaining('does not exist or is inaccessible'),
    );
  });
});
