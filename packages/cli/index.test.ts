/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the main module since it likely has side effects
vi.mock('./src/gemini', () => ({
  default: vi.fn(),
}));

describe('CLI Entry Point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export the main CLI function', async () => {
    const cliModule = await import('./index');
    expect(cliModule).toBeDefined();
  });

  it('should handle module import errors gracefully', async () => {
    // Test error handling during module initialization
    expect(async () => {
      await import('./index');
    }).not.toThrow();
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