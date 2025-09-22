/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { HookRunner } from './hookRunner.js';
import type { PluginManager } from './pluginManager.js';
import type { Logger } from '@opentelemetry/api-logs';
import { HookEventName, HookType } from '../config/config.js';
import type { HookConfig } from '../config/config.js';
import type { HookInput } from './types.js';
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

describe('HookRunner', () => {
  let hookRunner: HookRunner;
  let mockLogger: Logger;
  let mockPluginManager: PluginManager;
  let mockSpawn: MockChildProcessWithoutNullStreams;

  const mockInput: HookInput = {
    session_id: 'test-session',
    transcript_path: '/path/to/transcript',
    cwd: '/test/project',
    hook_event_name: 'BeforeTool',
    timestamp: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.resetAllMocks();

    mockLogger = {} as Logger;
    mockPluginManager = {
      ensurePluginReady: vi.fn(),
    } as unknown as PluginManager;

    hookRunner = new HookRunner(mockLogger, mockPluginManager);

    // Mock spawn with accessible mock functions
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('executeHook', () => {
    describe('command hooks', () => {
      const commandConfig: HookConfig = {
        type: HookType.Command,
        command: './hooks/test.sh',
        timeout: 5000,
      };

      it('should execute command hook successfully', async () => {
        const mockOutput = { decision: 'allow', reason: 'All good' };

        // Mock successful execution
        mockSpawn.mockStdoutOn.mockImplementation(
          (event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(
                () => callback(Buffer.from(JSON.stringify(mockOutput))),
                10,
              );
            }
          },
        );

        mockSpawn.mockProcessOn.mockImplementation(
          (event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 20);
            }
          },
        );

        const result = await hookRunner.executeHook(
          commandConfig,
          HookEventName.BeforeTool,
          mockInput,
        );

        expect(result.success).toBe(true);
        expect(result.output).toEqual(mockOutput);
        expect(result.exitCode).toBe(0);
        expect(mockSpawn.stdin.write).toHaveBeenCalledWith(
          JSON.stringify(mockInput),
        );
      });

      it('should handle command hook failure', async () => {
        const errorMessage = 'Command failed';

        mockSpawn.mockStderrOn.mockImplementation(
          (event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              setTimeout(() => callback(Buffer.from(errorMessage)), 10);
            }
          },
        );

        mockSpawn.mockProcessOn.mockImplementation(
          (event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              setTimeout(() => callback(1), 20);
            }
          },
        );

        const result = await hookRunner.executeHook(
          commandConfig,
          HookEventName.BeforeTool,
          mockInput,
        );

        expect(result.success).toBe(false);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toBe(errorMessage);
      });

      it('should handle command hook timeout', async () => {
        const shortTimeoutConfig: HookConfig = {
          type: HookType.Command,
          command: './hooks/slow.sh',
          timeout: 50, // Very short timeout for testing
        };

        let closeCallback: ((code: number) => void) | undefined;
        let killWasCalled = false;

        // Mock a hanging process that registers the close handler but doesn't call it initially
        mockSpawn.mockProcessOn.mockImplementation(
          (event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              closeCallback = callback; // Store the callback but don't call it yet
            }
          },
        );

        // Mock the kill method to simulate the process being killed
        mockSpawn.kill = vi.fn().mockImplementation((_signal: string) => {
          killWasCalled = true;
          // Simulate that killing the process triggers the close event
          if (closeCallback) {
            setTimeout(() => {
              closeCallback!(128); // Exit code 128 indicates process was killed by signal
            }, 5);
          }
          return true;
        });

        const result = await hookRunner.executeHook(
          shortTimeoutConfig,
          HookEventName.BeforeTool,
          mockInput,
        );

        expect(result.success).toBe(false);
        expect(killWasCalled).toBe(true);
        expect(result.error?.message).toContain('timed out');
        expect(mockSpawn.kill).toHaveBeenCalledWith('SIGTERM');
      });

      it('should expand environment variables in commands', async () => {
        const configWithEnvVar: HookConfig = {
          type: HookType.Command,
          command: '$GEMINI_PROJECT_DIR/hooks/test.sh',
        };

        mockSpawn.mockProcessOn.mockImplementation(
          (event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 10);
            }
          },
        );

        await hookRunner.executeHook(
          configWithEnvVar,
          HookEventName.BeforeTool,
          mockInput,
        );

        expect(spawn).toHaveBeenCalledWith(
          '/test/project/hooks/test.sh',
          [],
          expect.objectContaining({
            env: expect.objectContaining({
              GEMINI_PROJECT_DIR: '/test/project',
              CLAUDE_PROJECT_DIR: '/test/project',
            }),
          }),
        );
      });
    });

    describe('plugin hooks', () => {
      const pluginConfig: HookConfig = {
        type: HookType.Plugin,
        package: 'test-plugin',
        method: 'beforeTool',
        timeout: 5000,
      };

      const mockPlugin = {
        apiVersion: '1.0' as const,
        name: 'test-plugin',
        activate: vi.fn(),
        deactivate: vi.fn(),
      };

      it('should execute plugin hook successfully', async () => {
        const mockOutput = { decision: 'allow', reason: 'Plugin approved' };
        const mockHooks = {
          beforeTool: vi.fn().mockResolvedValue(mockOutput),
        };
        const mockInstance = {
          plugin: {
            ...mockPlugin,
            hooks: mockHooks,
          },
          packageName: 'test-plugin',
          activated: true,
        };

        vi.mocked(mockPluginManager.ensurePluginReady).mockResolvedValue(
          mockInstance,
        );

        const result = await hookRunner.executeHook(
          pluginConfig,
          HookEventName.BeforeTool,
          mockInput,
        );

        expect(result.success).toBe(true);
        expect(result.output).toEqual(mockOutput);
        expect(mockHooks.beforeTool).toHaveBeenCalledWith(mockInput);
      });

      it('should handle plugin hook failure', async () => {
        const mockHooks = {
          beforeTool: vi.fn().mockRejectedValue(new Error('Plugin error')),
        };
        const mockInstance = {
          plugin: {
            ...mockPlugin,
            hooks: mockHooks,
          },
          packageName: 'test-plugin',
          activated: true,
        };

        vi.mocked(mockPluginManager.ensurePluginReady).mockResolvedValue(
          mockInstance,
        );

        const result = await hookRunner.executeHook(
          pluginConfig,
          HookEventName.BeforeTool,
          mockInput,
        );

        expect(result.success).toBe(false);
        expect(result.error?.message).toBe('Plugin error');
      });

      it('should handle plugin not ready', async () => {
        vi.mocked(mockPluginManager.ensurePluginReady).mockResolvedValue(
          undefined,
        );

        const result = await hookRunner.executeHook(
          pluginConfig,
          HookEventName.BeforeTool,
          mockInput,
        );

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Failed to load plugin');
      });

      it('should handle missing hook method', async () => {
        const mockInstance = {
          plugin: {
            ...mockPlugin,
            hooks: {
              // Missing beforeTool method
            },
          },
          packageName: 'test-plugin',
          activated: true,
        };

        vi.mocked(mockPluginManager.ensurePluginReady).mockResolvedValue(
          mockInstance,
        );

        const result = await hookRunner.executeHook(
          pluginConfig,
          HookEventName.BeforeTool,
          mockInput,
        );

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain(
          'Hook method beforeTool not found',
        );
      });

      it('should handle plugin hook timeout', async () => {
        const shortTimeoutConfig: HookConfig = {
          type: HookType.Plugin,
          package: 'test-plugin',
          method: 'beforeTool',
          timeout: 100,
        };

        const mockInstance = {
          plugin: {
            ...mockPlugin,
            hooks: {
              beforeTool: vi
                .fn()
                .mockImplementation(
                  () => new Promise((resolve) => setTimeout(resolve, 200)),
                ),
            },
          },
          packageName: 'test-plugin',
          activated: true,
        };

        vi.mocked(mockPluginManager.ensurePluginReady).mockResolvedValue(
          mockInstance,
        );

        const result = await hookRunner.executeHook(
          shortTimeoutConfig,
          HookEventName.BeforeTool,
          mockInput,
        );

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('timed out');
      });
    });
  });

  describe('executeHooksParallel', () => {
    it('should execute multiple hooks in parallel', async () => {
      const configs: HookConfig[] = [
        { type: HookType.Command, command: './hook1.sh' },
        { type: HookType.Command, command: './hook2.sh' },
      ];

      // Mock both commands to succeed
      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setTimeout(() => callback(0), 10);
          }
        },
      );

      const results = await hookRunner.executeHooksParallel(
        configs,
        HookEventName.BeforeTool,
        mockInput,
      );

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(2);
    });

    it('should handle mixed success and failure', async () => {
      const configs: HookConfig[] = [
        { type: HookType.Command, command: './hook1.sh' },
        { type: HookType.Command, command: './hook2.sh' },
      ];

      let callCount = 0;
      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            const exitCode = callCount++ === 0 ? 0 : 1; // First succeeds, second fails
            setTimeout(() => callback(exitCode), 10);
          }
        },
      );

      const results = await hookRunner.executeHooksParallel(
        configs,
        HookEventName.BeforeTool,
        mockInput,
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });
});
