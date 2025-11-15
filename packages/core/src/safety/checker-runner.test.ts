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
import {
  type InProcessCheckerConfig,
  InProcessCheckerType,
} from '../policy/types.js';
import type { SafetyCheckResult } from './protocol.js';
import { SafetyCheckDecision } from './protocol.js';
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
    name: InProcessCheckerType.ALLOWED_PATH,
  };

  beforeEach(() => {
    mockContextBuilder = new ContextBuilder({} as Config);
    mockRegistry = new CheckerRegistry('/mock/dist');
    CheckerRegistry.prototype.resolveInProcess = vi.fn();

    runner = new CheckerRunner(mockContextBuilder, mockRegistry, {
      checkersPath: '/mock/dist',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should run in-process checker successfully', async () => {
    const mockResult: SafetyCheckResult = {
      decision: SafetyCheckDecision.ALLOW,
    };
    const mockChecker = {
      check: vi.fn().mockResolvedValue(mockResult),
    };
    vi.mocked(mockRegistry.resolveInProcess).mockReturnValue(mockChecker);
    vi.mocked(mockContextBuilder.buildFullContext).mockReturnValue({
      environment: { cwd: '/tmp', workspaces: [] },
    });

    const result = await runner.runChecker(mockToolCall, mockInProcessConfig);

    expect(result).toEqual(mockResult);
    expect(mockRegistry.resolveInProcess).toHaveBeenCalledWith(
      InProcessCheckerType.ALLOWED_PATH,
    );
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

    expect(result.decision).toBe(SafetyCheckDecision.DENY);
    expect(result.reason).toContain('Failed to run in-process checker');
    expect(result.reason).toContain('Checker failed');
  });

  it('should respect timeout for in-process checkers', async () => {
    vi.useFakeTimers();
    const mockChecker = {
      check: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 6000)); // Longer than default 5s timeout
        return { decision: SafetyCheckDecision.ALLOW };
      }),
    };
    vi.mocked(mockRegistry.resolveInProcess).mockReturnValue(mockChecker);
    vi.mocked(mockContextBuilder.buildFullContext).mockReturnValue({
      environment: { cwd: '/tmp', workspaces: [] },
    });

    const runPromise = runner.runChecker(mockToolCall, mockInProcessConfig);
    vi.advanceTimersByTime(5001);

    const result = await runPromise;
    expect(result.decision).toBe(SafetyCheckDecision.DENY);
    expect(result.reason).toContain('timed out');

    vi.useRealTimers();
  });

  it('should use minimal context when requested', async () => {
    const configWithContext: InProcessCheckerConfig = {
      ...mockInProcessConfig,
      required_context: ['environment'],
    };
    const mockChecker = {
      check: vi.fn().mockResolvedValue({ decision: SafetyCheckDecision.ALLOW }),
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

  it('should pass config to in-process checker via toolCall', async () => {
    const mockConfig = { included_args: ['foo'] };
    const configWithConfig: InProcessCheckerConfig = {
      ...mockInProcessConfig,
      config: mockConfig,
    };
    const mockResult: SafetyCheckResult = {
      decision: SafetyCheckDecision.ALLOW,
    };
    const mockChecker = {
      check: vi.fn().mockResolvedValue(mockResult),
    };
    vi.mocked(mockRegistry.resolveInProcess).mockReturnValue(mockChecker);
    vi.mocked(mockContextBuilder.buildFullContext).mockReturnValue({
      environment: { cwd: '/tmp', workspaces: [] },
    });

    await runner.runChecker(mockToolCall, configWithConfig);

    expect(mockChecker.check).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: mockToolCall,
        config: mockConfig,
      }),
    );
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
            callback(
              Buffer.from(
                JSON.stringify({ decision: SafetyCheckDecision.ALLOW }),
              ),
            );
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

      expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
      expect(spawn).toHaveBeenCalledWith(
        mockCheckerPath,
        [],
        expect.anything(),
      );
    });

    it('should include checker name in timeout error message', async () => {
      vi.useFakeTimers();
      const mockCheckerPath = '/mock/dist/python-checker';
      vi.mocked(mockRegistry.resolveExternal).mockReturnValue(mockCheckerPath);
      vi.mocked(mockContextBuilder.buildFullContext).mockReturnValue({
        environment: { cwd: '/tmp', workspaces: [] },
      });

      const mockChildProcess = {
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(), // Never calls 'close'
        kill: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(spawn).mockReturnValue(mockChildProcess as any);

      const runPromise = runner.runChecker(mockToolCall, mockExternalConfig);
      vi.advanceTimersByTime(5001);

      const result = await runPromise;
      expect(result.decision).toBe(SafetyCheckDecision.DENY);
      expect(result.reason).toContain(
        'Safety checker "python-checker" timed out',
      );

      vi.useRealTimers();
    });

    it('should send SIGKILL if process ignores SIGTERM', async () => {
      vi.useFakeTimers();
      const mockCheckerPath = '/mock/dist/python-checker';
      vi.mocked(mockRegistry.resolveExternal).mockReturnValue(mockCheckerPath);
      vi.mocked(mockContextBuilder.buildFullContext).mockReturnValue({
        environment: { cwd: '/tmp', workspaces: [] },
      });

      const mockChildProcess = {
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(), // Never calls 'close' automatically
        kill: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(spawn).mockReturnValue(mockChildProcess as any);

      const runPromise = runner.runChecker(mockToolCall, mockExternalConfig);

      // Trigger main timeout
      vi.advanceTimersByTime(5001);

      // Should have sent SIGTERM
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');

      // Advance past cleanup timeout (5000ms)
      vi.advanceTimersByTime(5000);

      // Should have sent SIGKILL
      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGKILL');

      // Clean up promise
      await runPromise;
      vi.useRealTimers();
    });

    it('should include checker name in non-zero exit code error message', async () => {
      const mockCheckerPath = '/mock/dist/python-checker';
      vi.mocked(mockRegistry.resolveExternal).mockReturnValue(mockCheckerPath);
      vi.mocked(mockContextBuilder.buildFullContext).mockReturnValue({
        environment: { cwd: '/tmp', workspaces: [] },
      });

      const mockChildProcess = {
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === 'close') {
            callback(1); // Exit code 1
          }
        }),
        kill: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(spawn).mockReturnValue(mockChildProcess as any);

      const result = await runner.runChecker(mockToolCall, mockExternalConfig);

      expect(result.decision).toBe(SafetyCheckDecision.DENY);
      expect(result.reason).toContain(
        'Safety checker "python-checker" exited with code 1',
      );
    });
  });
});
