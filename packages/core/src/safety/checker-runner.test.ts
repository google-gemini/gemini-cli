/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { CheckerRunner } from './checker-runner.js';
import { ContextBuilder } from './context-builder.js';
import { CheckerRegistry } from './registry.js';
import type { InProcessCheckerConfig } from '../policy/types.js';
import type { SafetyCheckResult } from './protocol.js';
import type { Config } from '../config/config.js';

// Mock dependencies
vi.mock('./registry.js');
vi.mock('./context-builder.js');
vi.mock('node:child_process');

describe('CheckerRunner', () => {
  let runner: CheckerRunner;
  let mockContextBuilder: ContextBuilder;
  let mockRegistry: CheckerRegistry;

  const mockToolCall = { name: 'test_tool', args: {} };
  const mockInProcessConfig: InProcessCheckerConfig = {
    type: 'in-process',
    name: 'allowed-path',
  };

  beforeEach(() => {
    mockContextBuilder = new ContextBuilder({} as Config);
    mockRegistry = new CheckerRegistry('/mock/dist');
    CheckerRegistry.prototype.resolveInProcess = vi.fn();

    runner = new CheckerRunner(mockContextBuilder, {
      checkersPath: '/mock/dist',
    });
    // Inject mocked registry
    // @ts-expect-error - accessing private property for test
    runner['registry'] = mockRegistry;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should run in-process checker successfully', async () => {
    const mockResult: SafetyCheckResult = { allowed: true };
    const mockChecker = {
      check: vi.fn().mockResolvedValue(mockResult),
    };
    vi.mocked(mockRegistry.resolveInProcess).mockReturnValue(mockChecker);
    vi.mocked(mockContextBuilder.buildFullContext).mockReturnValue({
      environment: { cwd: '/tmp', workspaces: [] },
    });

    const result = await runner.runChecker(mockToolCall, mockInProcessConfig);

    expect(result).toEqual(mockResult);
    expect(mockRegistry.resolveInProcess).toHaveBeenCalledWith('allowed-path');
    expect(mockChecker.check).toHaveBeenCalled();
  });

  it('should handle in-process checker errors', async () => {
    const mockChecker = {
      check: vi.fn().mockRejectedValue(new Error('Checker failed')),
    };
    vi.mocked(mockRegistry.resolveInProcess).mockReturnValue(mockChecker);
    vi.mocked(mockContextBuilder.buildFullContext).mockReturnValue({
      environment: { cwd: '/tmp', workspaces: [] },
    });

    const result = await runner.runChecker(mockToolCall, mockInProcessConfig);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Failed to run in-process checker');
    expect(result.reason).toContain('Checker failed');
  });

  it('should respect timeout for in-process checkers', async () => {
    vi.useFakeTimers();
    const mockChecker = {
      check: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 6000)); // Longer than default 5s timeout
        return { allowed: true };
      }),
    };
    vi.mocked(mockRegistry.resolveInProcess).mockReturnValue(mockChecker);
    vi.mocked(mockContextBuilder.buildFullContext).mockReturnValue({
      environment: { cwd: '/tmp', workspaces: [] },
    });

    const runPromise = runner.runChecker(mockToolCall, mockInProcessConfig);
    vi.advanceTimersByTime(5001);

    const result = await runPromise;
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('timed out');

    vi.useRealTimers();
  });

  it('should use minimal context when requested', async () => {
    const configWithContext: InProcessCheckerConfig = {
      ...mockInProcessConfig,
      required_context: ['environment'],
    };
    const mockChecker = {
      check: vi.fn().mockResolvedValue({ allowed: true }),
    };
    vi.mocked(mockRegistry.resolveInProcess).mockReturnValue(mockChecker);
    vi.mocked(mockContextBuilder.buildMinimalContext).mockReturnValue({
      environment: { cwd: '/tmp', workspaces: [] },
    });

    await runner.runChecker(mockToolCall, configWithContext);

    expect(mockContextBuilder.buildMinimalContext).toHaveBeenCalledWith([
      'environment',
    ]);
    expect(mockContextBuilder.buildFullContext).not.toHaveBeenCalled();
  });

  describe('External Checkers', () => {
    const mockExternalConfig = {
      type: 'external' as const,
      name: 'python-checker',
    };

    it('should spawn external checker directly', async () => {
      const mockCheckerPath = '/mock/dist/python-checker';
      vi.mocked(mockRegistry.resolveExternal).mockReturnValue(mockCheckerPath);
      vi.mocked(mockContextBuilder.buildFullContext).mockReturnValue({
        environment: { cwd: '/tmp', workspaces: [] },
      });

      const mockStdout = {
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from(JSON.stringify({ allowed: true })));
          }
        }),
      };
      const mockChildProcess = {
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: mockStdout,
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === 'close') {
            // Defer the close callback slightly to allow stdout 'data' to be registered
            setTimeout(() => callback(0), 0);
          }
        }),
        kill: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(spawn).mockReturnValue(mockChildProcess as any);

      const result = await runner.runChecker(mockToolCall, mockExternalConfig);

      expect(result.allowed).toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        mockCheckerPath,
        [],
        expect.anything(),
      );
    });
  });
});
