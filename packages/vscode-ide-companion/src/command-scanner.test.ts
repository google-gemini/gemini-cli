/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { CommandScanner } from './command-scanner.js';

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

describe('CommandScanner', () => {
  it('constructs without errors', () => {
    const scanner = new CommandScanner({ log: vi.fn() });
    expect(scanner).toBeDefined();
  });

  it('disposes without errors', () => {
    const scanner = new CommandScanner({ log: vi.fn() });
    expect(() => scanner.dispose()).not.toThrow();
  });
});
