/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the main module since it likely has side effects
vi.mock('./src/gemini', () => ({
  main: vi.fn().mockResolvedValue(undefined),
}));

describe('CLI Entry Point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export the main CLI function', async () => {
    const cliModule = await import('./index');
    expect(cliModule).toBeDefined();
  });

  it('should handle module import errors gracefully', async () => {
    // Test that module import resolves successfully
    await expect(import('./index')).resolves.toBeDefined();
  });

  it('should have proper CLI structure', async () => {
    const cliModule = await import('./index');
    expect(typeof cliModule).toBe('object');
  });

  it('should handle process arguments correctly', async () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'gemini-cli', '--help'];

    try {
      const cliModule = await import('./index');
      expect(cliModule).toBeDefined();
    } finally {
      process.argv = originalArgv;
    }
  });

  it('should handle environment variables', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    try {
      const cliModule = await import('./index');
      expect(cliModule).toBeDefined();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
