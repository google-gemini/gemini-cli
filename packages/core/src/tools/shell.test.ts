/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';

const mockShellExecutionService = vi.hoisted(() => vi.fn());
vi.mock('../services/shellExecutionService.js', () => ({
  ShellExecutionService: { execute: mockShellExecutionService },
}));
vi.mock('fs');
vi.mock('os');
vi.mock('crypto');
vi.mock('../utils/summarizer.js');

import { isCommandAllowed } from '../utils/shell-utils.js';
import { ShellTool } from './shell.js';
import { type Config } from '../config/config.js';
import type { PermissionRepository } from '../permissions/PermissionRepository.js';
import {
  type ShellExecutionResult,
  type ShellOutputEvent,
} from '../services/shellExecutionService.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { EOL } from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as summarizer from '../utils/summarizer.js';
import { ToolErrorType } from './tool-error.js';
import { ToolConfirmationOutcome } from './tools.js';
import { OUTPUT_UPDATE_INTERVAL_MS } from './shell.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';

describe('ShellTool', () => {
  let shellTool: ShellTool;
  let mockConfig: Config;
  let mockPermissionRepo: PermissionRepository;
  let mockShellOutputCallback: (event: ShellOutputEvent) => void;
  let resolveExecutionPromise: (result: ShellExecutionResult) => void;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock permission repository
    const permissions = new Map<string, Set<string>>();
    mockPermissionRepo = {
      isAllowed: vi
        .fn()
        .mockImplementation(
          async (toolId: string, permissionKey: string) =>
            permissions.get(toolId)?.has(permissionKey) ?? false,
        ),
      grant: vi
        .fn()
        .mockImplementation(async (toolId: string, permissionKey: string) => {
          if (!permissions.has(toolId)) {
            permissions.set(toolId, new Set());
          }
          permissions.get(toolId)!.add(permissionKey);
        }),
      revoke: vi
        .fn()
        .mockImplementation(async (toolId: string, permissionKey: string) => {
          permissions.get(toolId)?.delete(permissionKey);
        }),
      revokeAllForTool: vi.fn().mockImplementation(async (toolId: string) => {
        permissions.delete(toolId);
      }),
      revokeAll: vi.fn().mockImplementation(async () => {
        permissions.clear();
      }),
      getAllGranted: vi
        .fn()
        .mockImplementation(async () => new Map(permissions)),
    };

    mockConfig = {
      getCoreTools: vi.fn().mockReturnValue([]),
      getExcludeTools: vi.fn().mockReturnValue([]),
      getDebugMode: vi.fn().mockReturnValue(false),
      getTargetDir: vi.fn().mockReturnValue('/test/dir'),
      getSummarizeToolOutputConfig: vi.fn().mockReturnValue(undefined),
      getWorkspaceContext: () => createMockWorkspaceContext('.'),
      getGeminiClient: vi.fn(),
      getShouldUseNodePtyShell: vi.fn().mockReturnValue(false),
    } as unknown as Config;

    shellTool = new ShellTool(mockConfig, mockPermissionRepo);

    vi.mocked(os.platform).mockReturnValue('linux');
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');
    (vi.mocked(crypto.randomBytes) as Mock).mockReturnValue(
      Buffer.from('abcdef', 'hex'),
    );

    // Capture the output callback to simulate streaming events from the service
    mockShellExecutionService.mockImplementation((_cmd, _cwd, callback) => {
      mockShellOutputCallback = callback;
      return {
        pid: 12345,
        result: new Promise((resolve) => {
          resolveExecutionPromise = resolve;
        }),
      };
    });
  });

  describe('isCommandAllowed', () => {
    it('should allow a command if no restrictions are provided', () => {
      (mockConfig.getCoreTools as Mock).mockReturnValue(undefined);
      (mockConfig.getExcludeTools as Mock).mockReturnValue(undefined);
      expect(isCommandAllowed('ls -l', mockConfig).allowed).toBe(true);
    });

    it('should block a command with command substitution using $()', () => {
      expect(isCommandAllowed('echo $(rm -rf /)', mockConfig).allowed).toBe(
        false,
      );
    });
  });

  describe('build', () => {
    it('should return an invocation for a valid command', () => {
      const invocation = shellTool.build({ command: 'ls -l' });
      expect(invocation).toBeDefined();
    });

    it('should throw an error for an empty command', () => {
      expect(() => shellTool.build({ command: ' ' })).toThrow(
        'Command cannot be empty.',
      );
    });

    it('should throw an error for a non-existent directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(() =>
        shellTool.build({ command: 'ls', directory: 'rel/path' }),
      ).toThrow(
        "Directory 'rel/path' is not a registered workspace directory.",
      );
    });
  });

  describe('execute', () => {
    const mockAbortSignal = new AbortController().signal;

    const resolveShellExecution = (
      result: Partial<ShellExecutionResult> = {},
    ) => {
      const fullResult: ShellExecutionResult = {
        rawOutput: Buffer.from(result.output || ''),
        output: 'Success',
        exitCode: 0,
        signal: null,
        error: null,
        aborted: false,
        pid: 12345,
        executionMethod: 'child_process',
        ...result,
      };
      resolveExecutionPromise(fullResult);
    };

    it('should wrap command on linux and parse pgrep output', async () => {
      const invocation = shellTool.build({ command: 'my-command &' });
      const promise = invocation.execute(mockAbortSignal);
      resolveShellExecution({ pid: 54321 });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`54321${EOL}54322${EOL}`); // Service PID and background PID

      const result = await promise;

      const tmpFile = path.join(os.tmpdir(), 'shell_pgrep_abcdef.tmp');
      const wrappedCommand = `{ my-command & }; __code=$?; pgrep -g 0 >${tmpFile} 2>&1; exit $__code;`;
      expect(mockShellExecutionService).toHaveBeenCalledWith(
        wrappedCommand,
        expect.any(String),
        expect.any(Function),
        mockAbortSignal,
        false,
        undefined,
        undefined,
      );
      expect(result.llmContent).toContain('Background PIDs: 54322');
      expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith(tmpFile);
    });

    it('should not wrap command on windows', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      const invocation = shellTool.build({ command: 'dir' });
      const promise = invocation.execute(mockAbortSignal);
      resolveShellExecution({
        rawOutput: Buffer.from(''),
        output: '',
        exitCode: 0,
        signal: null,
        error: null,
        aborted: false,
        pid: 12345,
        executionMethod: 'child_process',
      });
      await promise;
      expect(mockShellExecutionService).toHaveBeenCalledWith(
        'dir',
        expect.any(String),
        expect.any(Function),
        mockAbortSignal,
        false,
        undefined,
        undefined,
      );
    });

    it('should format error messages correctly', async () => {
      const error = new Error('wrapped command failed');
      const invocation = shellTool.build({ command: 'user-command' });
      const promise = invocation.execute(mockAbortSignal);
      resolveShellExecution({
        error,
        exitCode: 1,
        output: 'err',
        rawOutput: Buffer.from('err'),
        signal: null,
        aborted: false,
        pid: 12345,
        executionMethod: 'child_process',
      });

      const result = await promise;
      expect(result.llmContent).toContain('Error: wrapped command failed');
      expect(result.llmContent).not.toContain('pgrep');
    });

    it('should return a SHELL_EXECUTE_ERROR for a command failure', async () => {
      const error = new Error('command failed');
      const invocation = shellTool.build({ command: 'user-command' });
      const promise = invocation.execute(mockAbortSignal);
      resolveShellExecution({
        error,
        exitCode: 1,
      });

      const result = await promise;

      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe(ToolErrorType.SHELL_EXECUTE_ERROR);
      expect(result.error?.message).toBe('command failed');
    });

    it('should throw an error for invalid parameters', () => {
      expect(() => shellTool.build({ command: '' })).toThrow(
        'Command cannot be empty.',
      );
    });

    it('should throw an error for invalid directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(() =>
        shellTool.build({ command: 'ls', directory: 'nonexistent' }),
      ).toThrow(
        `Directory 'nonexistent' is not a registered workspace directory.`,
      );
    });

    it('should summarize output when configured', async () => {
      (mockConfig.getSummarizeToolOutputConfig as Mock).mockReturnValue({
        [shellTool.name]: { tokenBudget: 1000 },
      });
      vi.mocked(summarizer.summarizeToolOutput).mockResolvedValue(
        'summarized output',
      );

      const invocation = shellTool.build({ command: 'ls' });
      const promise = invocation.execute(mockAbortSignal);
      resolveExecutionPromise({
        output: 'long output',
        rawOutput: Buffer.from('long output'),
        exitCode: 0,
        signal: null,
        error: null,
        aborted: false,
        pid: 12345,
        executionMethod: 'child_process',
      });

      const result = await promise;

      expect(summarizer.summarizeToolOutput).toHaveBeenCalledWith(
        expect.any(String),
        mockConfig.getGeminiClient(),
        mockAbortSignal,
        1000,
      );
      expect(result.llmContent).toBe('summarized output');
      expect(result.returnDisplay).toBe('long output');
    });

    it('should clean up the temp file on synchronous execution error', async () => {
      const error = new Error('sync spawn error');
      mockShellExecutionService.mockImplementation(() => {
        throw error;
      });
      vi.mocked(fs.existsSync).mockReturnValue(true); // Pretend the file exists

      const invocation = shellTool.build({ command: 'a-command' });
      await expect(invocation.execute(mockAbortSignal)).rejects.toThrow(error);

      const tmpFile = path.join(os.tmpdir(), 'shell_pgrep_abcdef.tmp');
      expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith(tmpFile);
    });

    describe('Streaming to `updateOutput`', () => {
      let updateOutputMock: Mock;
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        updateOutputMock = vi.fn();
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      it('should throttle text output updates', async () => {
        const invocation = shellTool.build({ command: 'stream' });
        const promise = invocation.execute(mockAbortSignal, updateOutputMock);

        // First chunk, should be throttled.
        mockShellOutputCallback({
          type: 'data',
          chunk: 'hello ',
        });
        expect(updateOutputMock).not.toHaveBeenCalled();

        // Advance time past the throttle interval.
        await vi.advanceTimersByTimeAsync(OUTPUT_UPDATE_INTERVAL_MS + 1);

        // Send a second chunk. THIS event triggers the update with the CUMULATIVE content.
        mockShellOutputCallback({
          type: 'data',
          chunk: 'world',
        });

        // It should have been called once now with the combined output.
        expect(updateOutputMock).toHaveBeenCalledOnce();
        expect(updateOutputMock).toHaveBeenCalledWith('hello world');

        resolveExecutionPromise({
          rawOutput: Buffer.from(''),
          output: '',
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
          executionMethod: 'child_process',
        });
        await promise;
      });

      it('should immediately show binary detection message and throttle progress', async () => {
        const invocation = shellTool.build({ command: 'cat img' });
        const promise = invocation.execute(mockAbortSignal, updateOutputMock);

        mockShellOutputCallback({ type: 'binary_detected' });
        expect(updateOutputMock).toHaveBeenCalledOnce();
        expect(updateOutputMock).toHaveBeenCalledWith(
          '[Binary output detected. Halting stream...]',
        );

        mockShellOutputCallback({
          type: 'binary_progress',
          bytesReceived: 1024,
        });
        expect(updateOutputMock).toHaveBeenCalledOnce();

        // Advance time past the throttle interval.
        await vi.advanceTimersByTimeAsync(OUTPUT_UPDATE_INTERVAL_MS + 1);

        // Send a SECOND progress event. This one will trigger the flush.
        mockShellOutputCallback({
          type: 'binary_progress',
          bytesReceived: 2048,
        });

        // Now it should be called a second time with the latest progress.
        expect(updateOutputMock).toHaveBeenCalledTimes(2);
        expect(updateOutputMock).toHaveBeenLastCalledWith(
          '[Receiving binary output... 2.0 KB received]',
        );

        resolveExecutionPromise({
          rawOutput: Buffer.from(''),
          output: '',
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
          executionMethod: 'child_process',
        });
        await promise;
      });
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should request confirmation for a new command and allowlist it on "Always"', async () => {
      const params = { command: 'npm install' };
      const invocation = shellTool.build(params);
      const confirmation = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(confirmation).not.toBe(false);
      expect(confirmation && confirmation.type).toBe('exec');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (confirmation as any).onConfirm(
        ToolConfirmationOutcome.ProceedAlways,
      );

      // Should now be allowlisted
      const secondInvocation = shellTool.build({ command: 'npm test' });
      const secondConfirmation = await secondInvocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(secondConfirmation).toBe(false);
    });

    it('should throw an error if validation fails', () => {
      expect(() => shellTool.build({ command: '' })).toThrow();
    });
  });

  describe('getDescription', () => {
    it('should return the windows description when on windows', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      const shellTool = new ShellTool(mockConfig, mockPermissionRepo);
      expect(shellTool.description).toMatchSnapshot();
    });

    it('should return the non-windows description when not on windows', () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      const shellTool = new ShellTool(mockConfig, mockPermissionRepo);
      expect(shellTool.description).toMatchSnapshot();
    });
  });
});

describe('build', () => {
  it('should return an invocation for valid directory', () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
      getTargetDir: () => '/root',
      getWorkspaceContext: () =>
        createMockWorkspaceContext('/root', ['/users/test']),
    } as unknown as Config;
    const localMockPermissionRepo = {
      isAllowed: vi.fn().mockResolvedValue(false),
      grant: vi.fn().mockResolvedValue(undefined),
      revoke: vi.fn().mockResolvedValue(undefined),
      revokeAllForTool: vi.fn().mockResolvedValue(undefined),
      revokeAll: vi.fn().mockResolvedValue(undefined),
      getAllGranted: vi.fn().mockResolvedValue(new Map()),
    };
    const shellTool = new ShellTool(config, localMockPermissionRepo);
    const invocation = shellTool.build({
      command: 'ls',
      directory: 'test',
    });
    expect(invocation).toBeDefined();
  });

  it('should throw an error for directory outside workspace', () => {
    const config = {
      getCoreTools: () => undefined,
      getExcludeTools: () => undefined,
      getTargetDir: () => '/root',
      getWorkspaceContext: () =>
        createMockWorkspaceContext('/root', ['/users/test']),
    } as unknown as Config;
    const localMockPermissionRepo = {
      isAllowed: vi.fn().mockResolvedValue(false),
      grant: vi.fn().mockResolvedValue(undefined),
      revoke: vi.fn().mockResolvedValue(undefined),
      revokeAllForTool: vi.fn().mockResolvedValue(undefined),
      revokeAll: vi.fn().mockResolvedValue(undefined),
      getAllGranted: vi.fn().mockResolvedValue(new Map()),
    };
    const shellTool = new ShellTool(config, localMockPermissionRepo);
    expect(() =>
      shellTool.build({
        command: 'ls',
        directory: 'test2',
      }),
    ).toThrow('is not a registered workspace directory');
  });

  describe('permission management methods', () => {
    let shellTool: ShellTool;
    let mockConfig: Config;
    let localMockPermissionRepo: PermissionRepository;

    beforeEach(() => {
      // Create mock permission repository
      const permissions = new Map<string, Set<string>>();
      localMockPermissionRepo = {
        isAllowed: vi
          .fn()
          .mockImplementation(
            async (toolId: string, permissionKey: string) =>
              permissions.get(toolId)?.has(permissionKey) ?? false,
          ),
        grant: vi
          .fn()
          .mockImplementation(async (toolId: string, permissionKey: string) => {
            if (!permissions.has(toolId)) {
              permissions.set(toolId, new Set());
            }
            permissions.get(toolId)!.add(permissionKey);
          }),
        revoke: vi
          .fn()
          .mockImplementation(async (toolId: string, permissionKey: string) => {
            permissions.get(toolId)?.delete(permissionKey);
          }),
        revokeAllForTool: vi.fn().mockImplementation(async (toolId: string) => {
          permissions.delete(toolId);
        }),
        revokeAll: vi.fn().mockImplementation(async () => {
          permissions.clear();
        }),
        getAllGranted: vi
          .fn()
          .mockImplementation(async () => new Map(permissions)),
      };

      mockConfig = {
        getCoreTools: vi.fn().mockReturnValue([]),
        getExcludeTools: vi.fn().mockReturnValue([]),
        getDebugMode: vi.fn().mockReturnValue(false),
        getTargetDir: vi.fn().mockReturnValue('/test/dir'),
        getSummarizeToolOutputConfig: vi.fn().mockReturnValue(undefined),
        getWorkspaceContext: () => createMockWorkspaceContext('.'),
        getGeminiClient: vi.fn(),
        getShouldUseNodePtyShell: vi.fn().mockReturnValue(false),
      } as unknown as Config;

      shellTool = new ShellTool(mockConfig, localMockPermissionRepo);
    });

    it('should start with empty allowed commands', async () => {
      const commands = await shellTool.getAllowedCommands();
      expect(commands).toEqual([]);
    });

    it('should return array of allowed commands', async () => {
      const commands = await shellTool.getAllowedCommands();
      expect(Array.isArray(commands)).toBe(true);
    });

    it('should add commands to allowlist through tool execution flow', async () => {
      // Grant permission directly through repository
      await localMockPermissionRepo.grant('shell', 'ls');

      const commands = await shellTool.getAllowedCommands();
      expect(commands).toContain('ls');

      // Test revoking command
      await shellTool.revokeCommandPermission('ls');
      const commandsAfterRevoke = await shellTool.getAllowedCommands();
      expect(commandsAfterRevoke).not.toContain('ls');
    });

    it('should revoke specific command permissions', async () => {
      // Grant permission first
      await localMockPermissionRepo.grant('shell', 'git');
      let commands = await shellTool.getAllowedCommands();
      expect(commands).toContain('git');

      // Test revoking
      await shellTool.revokeCommandPermission('git');
      commands = await shellTool.getAllowedCommands();
      expect(commands).not.toContain('git');
    });

    it('should clear all command permissions', async () => {
      // Grant some permissions first
      await localMockPermissionRepo.grant('shell', 'ls');
      await localMockPermissionRepo.grant('shell', 'git');

      await shellTool.clearAllPermissions();
      const commands = await shellTool.getAllowedCommands();
      expect(commands).toEqual([]);
    });

    it('should handle revoking non-existent commands gracefully', async () => {
      await shellTool.revokeCommandPermission('non-existent-command');
      const commands = await shellTool.getAllowedCommands();
      expect(commands).toEqual([]);
    });

    it('should return consistent array references', async () => {
      const commands1 = await shellTool.getAllowedCommands();
      const commands2 = await shellTool.getAllowedCommands();

      expect(Array.isArray(commands1)).toBe(true);
      expect(Array.isArray(commands2)).toBe(true);
      // They should be separate array instances
      expect(commands1).not.toBe(commands2);
      // But should have the same content
      expect(commands1).toEqual(commands2);
    });

    it('should handle clearing empty allowlist', async () => {
      // Clear empty list should not throw
      await shellTool.clearAllPermissions();
      const commands = await shellTool.getAllowedCommands();
      expect(commands).toEqual([]);
    });
  });
});
