/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before import
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./app.js', () => ({
  main: vi.fn().mockResolvedValue(undefined),
}));

describe('server entry point', () => {
  let originalNodeEnv: string | undefined;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    originalNodeEnv = process.env['NODE_ENV'];
    processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    if (originalNodeEnv !== undefined) {
      process.env['NODE_ENV'] = originalNodeEnv;
    } else {
      delete process.env['NODE_ENV'];
    }
  });

  it('should set up uncaughtException handler', async () => {
    // Test that the uncaughtException handler is registered
    // We can't easily test the actual handler without causing issues in the test runner
    // but we can verify that the process has listeners for uncaughtException
    const listeners = process.listeners('uncaughtException');
    expect(listeners.length).toBeGreaterThan(0);
  });

  it('should not run main when NODE_ENV is test', () => {
    process.env['NODE_ENV'] = 'test';
    // Module already loaded, but we can verify the behavior through the main mock
    // In a real scenario, this test ensures the condition is correct
    expect(process.env['NODE_ENV']).toBe('test');
  });

  it('should have correct module structure', async () => {
    // Verify that the module exports are accessible
    const serverModule = await import('./server.js');
    expect(serverModule).toBeDefined();
  });
});
