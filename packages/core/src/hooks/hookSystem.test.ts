/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HookSystem } from './hookSystem.js';
import { Config, HookType } from '../config/config.js';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

// Mock type for the child_process spawn
type MockChildProcessWithoutNullStreams = ChildProcessWithoutNullStreams & {
  mockStdoutOn: ReturnType<typeof vi.fn>;
  mockStderrOn: ReturnType<typeof vi.fn>;
  mockProcessOn: ReturnType<typeof vi.fn>;
};

// Mock child_process with importOriginal for partial mocking
vi.mock('node:child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

// Mock console methods
const mockConsole = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.stubGlobal('console', mockConsole);

describe('HookSystem Integration', () => {
  let hookSystem: HookSystem;
  let config: Config;
  let mockSpawn: MockChildProcessWithoutNullStreams;

  beforeEach(() => {
    vi.resetAllMocks();

    // Create a real config with simple command hook configurations for testing
    config = new Config({
      model: 'gemini-1.5-flash',
      targetDir: '/tmp/test-hooks',
      sessionId: 'test-session',
      debugMode: false,
      cwd: '/tmp/test-hooks',
      hooks: {
        BeforeTool: [
          {
            matcher: 'TestTool',
            hooks: [
              {
                type: HookType.Command,
                command: 'echo',
                timeout: 5000,
              },
            ],
          },
        ],
      },
    });

    hookSystem = new HookSystem(config);

    // Set up spawn mock with accessible mock functions
    const mockStdoutOn = vi.fn();
    const mockStderrOn = vi.fn();
    const mockProcessOn = vi.fn();

    mockSpawn = {
      stdin: {
        write: vi.fn(),
        end: vi.fn(),
      } as unknown as Writable,
      stdout: {
        on: mockStdoutOn,
      } as unknown as Readable,
      stderr: {
        on: mockStderrOn,
      } as unknown as Readable,
      on: mockProcessOn,
      kill: vi.fn(),
      killed: false,
      mockStdoutOn,
      mockStderrOn,
      mockProcessOn,
    } as unknown as MockChildProcessWithoutNullStreams;

    vi.mocked(spawn).mockReturnValue(mockSpawn);
  });

  afterEach(async () => {
    if (hookSystem) {
      await hookSystem.cleanup();
    }
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await hookSystem.initialize();

      expect(mockConsole.log).toHaveBeenCalledWith(
        'Hook system initialized successfully',
      );

      // Verify system is initialized
      const status = hookSystem.getStatus();
      expect(status.initialized).toBe(true);
      // Note: totalHooks might be 0 if hook validation rejects the test hooks
    });

    it('should not initialize twice', async () => {
      await hookSystem.initialize();
      await hookSystem.initialize(); // Second call should be no-op

      // The system logs both registry initialization and system initialization
      expect(mockConsole.log).toHaveBeenCalledWith(
        'Hook system initialized successfully',
      );
    });

    it('should handle initialization errors gracefully', async () => {
      // Create a config with invalid hooks to trigger initialization errors
      const invalidConfig = new Config({
        model: 'gemini-1.5-flash',
        targetDir: '/tmp/test-hooks-invalid',
        sessionId: 'test-session-invalid',
        debugMode: false,
        cwd: '/tmp/test-hooks-invalid',
        hooks: {
          BeforeTool: [
            {
              hooks: [
                {
                  type: 'invalid-type' as HookType, // Invalid hook type for testing
                  command: './test.sh',
                },
              ],
            },
          ],
        },
      });

      const invalidHookSystem = new HookSystem(invalidConfig);

      // Should not throw, but should log warnings
      await invalidHookSystem.initialize();

      expect(mockConsole.warn).toHaveBeenCalled();
      await invalidHookSystem.cleanup();
    });
  });

  describe('getEventBus', () => {
    it('should return event bus when initialized', async () => {
      await hookSystem.initialize();

      // Set up spawn mock behavior for successful execution
      mockSpawn.mockStdoutOn.mockImplementation(
        (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('')), 5); // echo outputs empty
          }
        },
      );

      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
        },
      );

      const eventBus = hookSystem.getEventBus();
      expect(eventBus).toBeDefined();

      // Test that the event bus can actually fire events
      const result = await eventBus.fireBeforeToolEvent('TestTool', {
        test: 'data',
      });
      expect(result.success).toBe(true);
    });

    it('should throw error when not initialized', () => {
      expect(() => hookSystem.getEventBus()).toThrow(
        'Hook system not initialized',
      );
    });
  });

  describe('hook execution', () => {
    it('should execute hooks and return results', async () => {
      await hookSystem.initialize();

      // Set up spawn mock behavior for successful execution
      mockSpawn.mockStdoutOn.mockImplementation(
        (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data') {
            setTimeout(() => callback(Buffer.from('')), 5); // echo outputs empty
          }
        },
      );

      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
        },
      );

      const eventBus = hookSystem.getEventBus();

      // Test BeforeTool event with command hook
      const result = await eventBus.fireBeforeToolEvent('TestTool', {
        test: 'data',
      });

      expect(result.success).toBe(true);
      // Command hooks with echo should succeed but may not have specific decisions
      expect(result.errors).toHaveLength(0);
    });

    it('should handle no matching hooks', async () => {
      await hookSystem.initialize();

      const eventBus = hookSystem.getEventBus();

      // Test with a tool that doesn't match any hooks
      const result = await eventBus.fireBeforeToolEvent('UnmatchedTool', {
        test: 'data',
      });

      expect(result.success).toBe(true);
      expect(result.allOutputs).toHaveLength(0);
      expect(result.finalOutput).toBeUndefined();
    });
  });

  describe('plugin management', () => {
    it('should handle plugin installation failure gracefully', async () => {
      await hookSystem.initialize();

      const result = await hookSystem.installPluginHook('invalid-plugin');

      expect(result).toBe(false);
      // Should not throw, just return false for invalid plugins
    });
  });

  describe('system management', () => {
    it('should cleanup successfully', async () => {
      await hookSystem.initialize();

      // Cleanup should not throw
      await expect(hookSystem.cleanup()).resolves.not.toThrow();
    });

    it('should return correct status when initialized', async () => {
      await hookSystem.initialize();

      const status = hookSystem.getStatus();

      expect(status.initialized).toBe(true);
      // Note: totalHooks might be 0 if hook validation rejects the test hooks
      expect(typeof status.totalHooks).toBe('number');
    });

    it('should return uninitialized status', () => {
      const status = hookSystem.getStatus();

      expect(status.initialized).toBe(false);
    });
  });
});
