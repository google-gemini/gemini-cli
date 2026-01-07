/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { HookRunner } from './hookRunner.js';
import { HookEventName, HookType, ConfigSource } from './types.js';
import type { HookConfig } from './types.js';
import type { HookInput } from './types.js';
import type { Readable, Writable } from 'node:stream';
import type { Config } from '../config/config.js';

// Mock type for the child_process spawn
type MockChildProcessWithoutNullStreams = ChildProcessWithoutNullStreams & {
  mockStdoutOn: ReturnType<typeof vi.fn>;
  mockStderrOn: ReturnType<typeof vi.fn>;
  mockProcessOn: ReturnType<typeof vi.fn>;
};

// Mock child_process with importOriginal for partial mocking
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    spawn: vi.fn(),
  };
});

// Mock debugLogger using vi.hoisted
const mockDebugLogger = vi.hoisted(() => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: mockDebugLogger,
}));

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
  let mockSpawn: MockChildProcessWithoutNullStreams;
  let mockConfig: Config;

  const mockInput: HookInput = {
    session_id: 'test-session',
    transcript_path: '/path/to/transcript',
    cwd: '/test/project',
    hook_event_name: 'BeforeTool',
    timestamp: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.resetAllMocks();

    mockConfig = {
      isTrustedFolder: vi.fn().mockReturnValue(true),
      sanitizationConfig: {
        enableEnvironmentVariableRedaction: true,
      },
    } as unknown as Config;

    hookRunner = new HookRunner(mockConfig);

    // Mock spawn with accessible mock functions
    const mockStdoutOn = vi.fn();
    const mockStderrOn = vi.fn();
    const mockProcessOn = vi.fn();

    mockSpawn = {
      stdin: {
        write: vi.fn(),
        end: vi.fn(),
        on: vi.fn(),
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
    describe('security checks', () => {
      it('should block project hooks in untrusted folders', async () => {
        vi.mocked(mockConfig.isTrustedFolder).mockReturnValue(false);

        const projectHookConfig: HookConfig = {
          type: HookType.Command,
          command: './hooks/test.sh',
          source: ConfigSource.Project,
        };

        const result = await hookRunner.executeHook(
          projectHookConfig,
          HookEventName.BeforeTool,
          mockInput,
        );

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain(
          'Security: Blocked execution of project hook in untrusted folder',
        );
        expect(mockDebugLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Security: Blocked execution'),
        );
        expect(spawn).not.toHaveBeenCalled();
      });

      it('should allow project hooks in trusted folders', async () => {
        vi.mocked(mockConfig.isTrustedFolder).mockReturnValue(true);

        const projectHookConfig: HookConfig = {
          type: HookType.Command,
          command: './hooks/test.sh',
          source: ConfigSource.Project,
        };

        // Mock successful execution
        mockSpawn.mockProcessOn.mockImplementation(
          (event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 10);
            }
          },
        );

        const result = await hookRunner.executeHook(
          projectHookConfig,
          HookEventName.BeforeTool,
          mockInput,
        );

        expect(result.success).toBe(true);
        expect(spawn).toHaveBeenCalled();
      });

      it('should allow non-project hooks even in untrusted folders', async () => {
        vi.mocked(mockConfig.isTrustedFolder).mockReturnValue(false);

        const systemHookConfig: HookConfig = {
          type: HookType.Command,
          command: './hooks/test.sh',
          source: ConfigSource.System,
        };

        // Mock successful execution
        mockSpawn.mockProcessOn.mockImplementation(
          (event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              setTimeout(() => callback(0), 10);
            }
          },
        );

        const result = await hookRunner.executeHook(
          systemHookConfig,
          HookEventName.BeforeTool,
          mockInput,
        );

        expect(result.success).toBe(true);
        expect(spawn).toHaveBeenCalled();
      });
    });

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
              setImmediate(() =>
                callback(Buffer.from(JSON.stringify(mockOutput))),
              );
            }
          },
        );

        mockSpawn.mockProcessOn.mockImplementation(
          (event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              setImmediate(() => callback(0));
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
              setImmediate(() => callback(Buffer.from(errorMessage)));
            }
          },
        );

        mockSpawn.mockProcessOn.mockImplementation(
          (event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              setImmediate(() => callback(1));
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

      it('should use hook name in error messages if available', async () => {
        const namedConfig: HookConfig = {
          name: 'my-friendly-hook',
          type: HookType.Command,
          command: './hooks/fail.sh',
        };

        // Mock error during spawn
        vi.mocked(spawn).mockImplementationOnce(() => {
          throw new Error('Spawn error');
        });

        await hookRunner.executeHook(
          namedConfig,
          HookEventName.BeforeTool,
          mockInput,
        );

        expect(mockDebugLogger.warn).toHaveBeenCalledWith(
          expect.stringContaining(
            '(hook: my-friendly-hook): Error: Spawn error',
          ),
        );
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
            setImmediate(() => {
              closeCallback!(128); // Exit code 128 indicates process was killed by signal
            });
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
              setImmediate(() => callback(0));
            }
          },
        );

        await hookRunner.executeHook(
          configWithEnvVar,
          HookEventName.BeforeTool,
          mockInput,
        );

        expect(spawn).toHaveBeenCalledWith(
          expect.stringMatching(/bash|powershell/),
          expect.arrayContaining([
            expect.stringMatching(/['"]?\/test\/project['"]?\/hooks\/test\.sh/),
          ]),
          expect.objectContaining({
            shell: false,
            env: expect.objectContaining({
              GEMINI_PROJECT_DIR: '/test/project',
              CLAUDE_PROJECT_DIR: '/test/project',
            }),
          }),
        );
      });

      it('should not allow command injection via GEMINI_PROJECT_DIR', async () => {
        const maliciousCwd = '/test/project; echo "pwned" > /tmp/pwned';
        const mockMaliciousInput: HookInput = {
          ...mockInput,
          cwd: maliciousCwd,
        };

        const config: HookConfig = {
          type: HookType.Command,
          command: 'ls $GEMINI_PROJECT_DIR',
        };

        // Mock the process closing immediately
        mockSpawn.mockProcessOn.mockImplementation(
          (event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              setImmediate(() => callback(0));
            }
          },
        );

        await hookRunner.executeHook(
          config,
          HookEventName.BeforeTool,
          mockMaliciousInput,
        );

        // If secure, spawn will be called with the shell executable and escaped command
        expect(spawn).toHaveBeenCalledWith(
          expect.stringMatching(/bash|powershell/),
          expect.arrayContaining([
            expect.stringMatching(/ls (['"]).*echo.*pwned.*\1/),
          ]),
          expect.objectContaining({ shell: false }),
        );
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
            setImmediate(() => callback(0));
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

    it('should call onHookStart and onHookEnd callbacks', async () => {
      const configs: HookConfig[] = [
        { name: 'hook1', type: HookType.Command, command: './hook1.sh' },
      ];

      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setImmediate(() => callback(0));
          }
        },
      );

      const onStart = vi.fn();
      const onEnd = vi.fn();

      await hookRunner.executeHooksParallel(
        configs,
        HookEventName.BeforeTool,
        mockInput,
        onStart,
        onEnd,
      );

      expect(onStart).toHaveBeenCalledWith(configs[0], 0);
      expect(onEnd).toHaveBeenCalledWith(
        configs[0],
        expect.objectContaining({ success: true }),
      );
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
            setImmediate(() => callback(exitCode));
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

  describe('executeHooksSequential', () => {
    it('should execute multiple hooks in sequence', async () => {
      const configs: HookConfig[] = [
        { type: HookType.Command, command: './hook1.sh' },
        { type: HookType.Command, command: './hook2.sh' },
      ];

      const executionOrder: string[] = [];

      // Mock both commands to succeed
      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            const args = vi.mocked(spawn).mock.calls[
              executionOrder.length
            ][1] as string[];
            const command = args[args.length - 1];
            executionOrder.push(command);
            setImmediate(() => callback(0));
          }
        },
      );

      const results = await hookRunner.executeHooksSequential(
        configs,
        HookEventName.BeforeTool,
        mockInput,
      );

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(2);
      // Verify they were called sequentially
      expect(executionOrder).toEqual(['./hook1.sh', './hook2.sh']);
    });

    it('should call onHookStart and onHookEnd callbacks sequentially', async () => {
      const configs: HookConfig[] = [
        { name: 'hook1', type: HookType.Command, command: './hook1.sh' },
        { name: 'hook2', type: HookType.Command, command: './hook2.sh' },
      ];

      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setImmediate(() => callback(0));
          }
        },
      );

      const onStart = vi.fn();
      const onEnd = vi.fn();

      await hookRunner.executeHooksSequential(
        configs,
        HookEventName.BeforeTool,
        mockInput,
        onStart,
        onEnd,
      );

      expect(onStart).toHaveBeenCalledTimes(2);
      expect(onEnd).toHaveBeenCalledTimes(2);
      expect(onStart).toHaveBeenNthCalledWith(1, configs[0], 0);
      expect(onStart).toHaveBeenNthCalledWith(2, configs[1], 1);
    });

    it('should continue execution even if a hook fails', async () => {
      const configs: HookConfig[] = [
        { type: HookType.Command, command: './hook1.sh' },
        { type: HookType.Command, command: './hook2.sh' },
        { type: HookType.Command, command: './hook3.sh' },
      ];

      let callCount = 0;
      mockSpawn.mockStderrOn.mockImplementation(
        (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data' && callCount === 1) {
            // Second hook fails
            setImmediate(() => callback(Buffer.from('Hook 2 failed')));
          }
        },
      );

      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            const exitCode = callCount++ === 1 ? 1 : 0; // Second fails, others succeed
            setImmediate(() => callback(exitCode));
          }
        },
      );

      const results = await hookRunner.executeHooksSequential(
        configs,
        HookEventName.BeforeTool,
        mockInput,
      );

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(3);
    });

    it('should pass modified input from one hook to the next for BeforeAgent', async () => {
      const configs: HookConfig[] = [
        { type: HookType.Command, command: './hook1.sh' },
        { type: HookType.Command, command: './hook2.sh' },
      ];

      const mockBeforeAgentInput = {
        ...mockInput,
        prompt: 'Original prompt',
      };

      const mockOutput1 = {
        decision: 'allow' as const,
        hookSpecificOutput: {
          additionalContext: 'Context from hook 1',
        },
      };

      let hookCallCount = 0;
      mockSpawn.mockStdoutOn.mockImplementation(
        (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data') {
            if (hookCallCount === 0) {
              setImmediate(() =>
                callback(Buffer.from(JSON.stringify(mockOutput1))),
              );
            }
          }
        },
      );

      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            hookCallCount++;
            setImmediate(() => callback(0));
          }
        },
      );

      const results = await hookRunner.executeHooksSequential(
        configs,
        HookEventName.BeforeAgent,
        mockBeforeAgentInput,
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].output).toEqual(mockOutput1);

      // Verify that the second hook received modified input
      const secondHookInput = JSON.parse(
        vi.mocked(mockSpawn.stdin.write).mock.calls[1][0],
      );
      expect(secondHookInput.prompt).toContain('Original prompt');
      expect(secondHookInput.prompt).toContain('Context from hook 1');
    });

    it('should pass modified LLM request from one hook to the next for BeforeModel', async () => {
      const configs: HookConfig[] = [
        { type: HookType.Command, command: './hook1.sh' },
        { type: HookType.Command, command: './hook2.sh' },
      ];

      const mockBeforeModelInput = {
        ...mockInput,
        llm_request: {
          model: 'gemini-1.5-pro',
          messages: [{ role: 'user', content: 'Hello' }],
        },
      };

      const mockOutput1 = {
        decision: 'allow' as const,
        hookSpecificOutput: {
          llm_request: {
            temperature: 0.7,
          },
        },
      };

      let hookCallCount = 0;
      mockSpawn.mockStdoutOn.mockImplementation(
        (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data') {
            if (hookCallCount === 0) {
              setImmediate(() =>
                callback(Buffer.from(JSON.stringify(mockOutput1))),
              );
            }
          }
        },
      );

      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            hookCallCount++;
            setImmediate(() => callback(0));
          }
        },
      );

      const results = await hookRunner.executeHooksSequential(
        configs,
        HookEventName.BeforeModel,
        mockBeforeModelInput,
      );

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);

      // Verify that the second hook received modified input
      const secondHookInput = JSON.parse(
        vi.mocked(mockSpawn.stdin.write).mock.calls[1][0],
      );
      expect(secondHookInput.llm_request.model).toBe('gemini-1.5-pro');
      expect(secondHookInput.llm_request.temperature).toBe(0.7);
    });

    it('should not modify input if hook fails', async () => {
      const configs: HookConfig[] = [
        { type: HookType.Command, command: './hook1.sh' },
        { type: HookType.Command, command: './hook2.sh' },
      ];

      mockSpawn.mockStderrOn.mockImplementation(
        (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data') {
            setImmediate(() => callback(Buffer.from('Hook failed')));
          }
        },
      );

      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setImmediate(() => callback(1)); // All hooks fail
          }
        },
      );

      const results = await hookRunner.executeHooksSequential(
        configs,
        HookEventName.BeforeTool,
        mockInput,
      );

      expect(results).toHaveLength(2);
      expect(results.every((r) => !r.success)).toBe(true);

      // Verify that both hooks received the same original input
      const firstHookInput = JSON.parse(
        vi.mocked(mockSpawn.stdin.write).mock.calls[0][0],
      );
      const secondHookInput = JSON.parse(
        vi.mocked(mockSpawn.stdin.write).mock.calls[1][0],
      );
      expect(firstHookInput).toEqual(secondHookInput);
    });
  });

  describe('invalid JSON handling', () => {
    const commandConfig: HookConfig = {
      type: HookType.Command,
      command: './hooks/test.sh',
    };

    it('should handle invalid JSON output gracefully', async () => {
      const invalidJson = '{ "decision": "allow", incomplete';

      mockSpawn.mockStdoutOn.mockImplementation(
        (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data') {
            setImmediate(() => callback(Buffer.from(invalidJson)));
          }
        },
      );

      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setImmediate(() => callback(0));
          }
        },
      );

      const result = await hookRunner.executeHook(
        commandConfig,
        HookEventName.BeforeTool,
        mockInput,
      );

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      // Should convert plain text to structured output
      expect(result.output).toEqual({
        decision: 'allow',
        systemMessage: invalidJson,
      });
    });

    it('should handle malformed JSON with exit code 0', async () => {
      const malformedJson = 'not json at all';

      mockSpawn.mockStdoutOn.mockImplementation(
        (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data') {
            setImmediate(() => callback(Buffer.from(malformedJson)));
          }
        },
      );

      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setImmediate(() => callback(0));
          }
        },
      );

      const result = await hookRunner.executeHook(
        commandConfig,
        HookEventName.BeforeTool,
        mockInput,
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        decision: 'allow',
        systemMessage: malformedJson,
      });
    });

    it('should handle invalid JSON with exit code 1 (non-blocking error)', async () => {
      const invalidJson = '{ broken json';

      mockSpawn.mockStderrOn.mockImplementation(
        (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data') {
            setImmediate(() => callback(Buffer.from(invalidJson)));
          }
        },
      );

      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setImmediate(() => callback(1));
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
      expect(result.output).toEqual({
        decision: 'allow',
        systemMessage: `Warning: ${invalidJson}`,
      });
    });

    it('should handle invalid JSON with exit code 2 (blocking error)', async () => {
      const invalidJson = '{ "error": incomplete';

      mockSpawn.mockStderrOn.mockImplementation(
        (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data') {
            setImmediate(() => callback(Buffer.from(invalidJson)));
          }
        },
      );

      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setImmediate(() => callback(2));
          }
        },
      );

      const result = await hookRunner.executeHook(
        commandConfig,
        HookEventName.BeforeTool,
        mockInput,
      );

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.output).toEqual({
        decision: 'deny',
        reason: invalidJson,
      });
    });

    it('should handle empty JSON output', async () => {
      mockSpawn.mockStdoutOn.mockImplementation(
        (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data') {
            setImmediate(() => callback(Buffer.from('')));
          }
        },
      );

      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setImmediate(() => callback(0));
          }
        },
      );

      const result = await hookRunner.executeHook(
        commandConfig,
        HookEventName.BeforeTool,
        mockInput,
      );

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.output).toBeUndefined();
    });

    it('should handle double-encoded JSON string', async () => {
      const mockOutput = { decision: 'allow', reason: 'All good' };
      const doubleEncodedJson = JSON.stringify(JSON.stringify(mockOutput));

      mockSpawn.mockStdoutOn.mockImplementation(
        (event: string, callback: (data: Buffer) => void) => {
          if (event === 'data') {
            setImmediate(() => callback(Buffer.from(doubleEncodedJson)));
          }
        },
      );

      mockSpawn.mockProcessOn.mockImplementation(
        (event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            setImmediate(() => callback(0));
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
    });
  });
});
