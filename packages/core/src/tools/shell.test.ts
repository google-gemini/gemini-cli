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
  beforeAll,
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
vi.mock('child_process');
vi.mock('../utils/summarizer.js');

// Mock process.kill at the module level
const mockProcessKill = vi.fn();
vi.stubGlobal('process', {
  ...process,
  kill: mockProcessKill,
});

import {
  initializeShellParsers,
  isCommandAllowed,
} from '../utils/shell-utils.js';
import { ShellTool, ShellToolInvocation } from './shell.js';
import { type Config } from '../config/config.js';
import {
  type ShellExecutionResult,
  type ShellOutputEvent,
} from '../services/shellExecutionService.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { EOL } from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import * as summarizer from '../utils/summarizer.js';
import { ToolErrorType } from './tool-error.js';
import { ToolConfirmationOutcome } from './tools.js';
import { OUTPUT_UPDATE_INTERVAL_MS } from './shell.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import { SHELL_TOOL_NAME } from './tool-names.js';

const originalComSpec = process.env['ComSpec'];
const itWindowsOnly = process.platform === 'win32' ? it : it.skip;

describe('ShellTool', () => {
  let shellTool: ShellTool;
  let mockConfig: Config;
  let mockShellOutputCallback: (event: ShellOutputEvent) => void;
  let resolveExecutionPromise: (result: ShellExecutionResult) => void;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      getAllowedTools: vi.fn().mockReturnValue([]),
      getApprovalMode: vi.fn().mockReturnValue('strict'),
      getCoreTools: vi.fn().mockReturnValue([]),
      getExcludeTools: vi.fn().mockReturnValue([]),
      getDebugMode: vi.fn().mockReturnValue(false),
      getTargetDir: vi.fn().mockReturnValue('/test/dir'),
      getSummarizeToolOutputConfig: vi.fn().mockReturnValue(undefined),
      getWorkspaceContext: vi
        .fn()
        .mockReturnValue(createMockWorkspaceContext('/test/dir')),
      getGeminiClient: vi.fn(),
      getEnableInteractiveShell: vi.fn().mockReturnValue(false),
      isInteractive: vi.fn().mockReturnValue(true),
    } as unknown as Config;

    shellTool = new ShellTool(mockConfig);

    vi.mocked(os.platform).mockReturnValue('linux');
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');
    (vi.mocked(crypto.randomBytes) as Mock).mockReturnValue(
      Buffer.from('abcdef', 'hex'),
    );
    process.env['ComSpec'] =
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

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

  afterEach(() => {
    if (originalComSpec === undefined) {
      delete process.env['ComSpec'];
    } else {
      process.env['ComSpec'] = originalComSpec;
    }
  });

  describe('isCommandAllowed', () => {
    it('should allow a command if no restrictions are provided', () => {
      (mockConfig.getCoreTools as Mock).mockReturnValue(undefined);
      (mockConfig.getExcludeTools as Mock).mockReturnValue(undefined);
      expect(isCommandAllowed('goodCommand --safe', mockConfig).allowed).toBe(
        true,
      );
    });

    it('should allow a command with command substitution using $()', () => {
      const evaluation = isCommandAllowed(
        'echo $(goodCommand --safe)',
        mockConfig,
      );
      expect(evaluation.allowed).toBe(true);
      expect(evaluation.reason).toBeUndefined();
    });
  });

  describe('build', () => {
    it('should return an invocation for a valid command', () => {
      const invocation = shellTool.build({ command: 'goodCommand --safe' });
      expect(invocation).toBeDefined();
    });

    it('should throw an error for an empty command', () => {
      expect(() => shellTool.build({ command: ' ' })).toThrow(
        'Command cannot be empty.',
      );
    });

    it('should throw an error for a relative directory path', () => {
      expect(() =>
        shellTool.build({ command: 'ls', directory: 'rel/path' }),
      ).toThrow('Directory must be an absolute path.');
    });

    it('should throw an error for a directory outside the workspace', () => {
      (mockConfig.getWorkspaceContext as Mock).mockReturnValue(
        createMockWorkspaceContext('/test/dir', ['/another/workspace']),
      );
      expect(() =>
        shellTool.build({ command: 'ls', directory: '/not/in/workspace' }),
      ).toThrow(
        "Directory '/not/in/workspace' is not within any of the registered workspace directories.",
      );
    });

    it('should return an invocation for a valid absolute directory path', () => {
      (mockConfig.getWorkspaceContext as Mock).mockReturnValue(
        createMockWorkspaceContext('/test/dir', ['/another/workspace']),
      );
      const invocation = shellTool.build({
        command: 'ls',
        directory: '/test/dir/subdir',
      });
      expect(invocation).toBeDefined();
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
        '/test/dir',
        expect.any(Function),
        mockAbortSignal,
        false,
        {},
      );
      expect(result.llmContent).toContain('Background PIDs: 54322');
      expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith(tmpFile);
    });

    it('should use the provided directory as cwd', async () => {
      (mockConfig.getWorkspaceContext as Mock).mockReturnValue(
        createMockWorkspaceContext('/test/dir'),
      );
      const invocation = shellTool.build({
        command: 'ls',
        directory: '/test/dir/subdir',
      });
      const promise = invocation.execute(mockAbortSignal);
      resolveShellExecution();
      await promise;

      const tmpFile = path.join(os.tmpdir(), 'shell_pgrep_abcdef.tmp');
      const wrappedCommand = `{ ls; }; __code=$?; pgrep -g 0 >${tmpFile} 2>&1; exit $__code;`;
      expect(mockShellExecutionService).toHaveBeenCalledWith(
        wrappedCommand,
        '/test/dir/subdir',
        expect.any(Function),
        mockAbortSignal,
        false,
        {},
      );
    });

    itWindowsOnly('should not wrap command on windows', async () => {
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
        '/test/dir',
        expect.any(Function),
        mockAbortSignal,
        false,
        {},
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
      expect(() =>
        shellTool.build({ command: 'ls', directory: 'nonexistent' }),
      ).toThrow('Directory must be an absolute path.');
    });

    it('should summarize output when configured', async () => {
      (mockConfig.getSummarizeToolOutputConfig as Mock).mockReturnValue({
        [SHELL_TOOL_NAME]: { tokenBudget: 1000 },
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

    it('should kill background processes when AbortSignal is triggered', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      const mockSpawn = vi.fn();
      vi.mocked(spawn).mockImplementation(mockSpawn);
      vi.useFakeTimers();

      const shellTool = new ShellTool(mockConfig);
      const invocation = shellTool.build({ command: 'sleep 100 &' });

      const abortController = new AbortController();
      const { signal } = abortController;

      // Mock pgrep output with background PIDs
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`12345${EOL}54321${EOL}`);

      const promise = invocation.execute(signal);
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

      // Now abort the signal to trigger cleanup
      abortController.abort();

      // Should kill the background process group (negative PID for process group)
      expect(mockProcessKill).toHaveBeenCalledWith(-54321, 'SIGTERM');

      // Advance timers to check for SIGKILL (the setTimeout is in the cleanup handler)
      await vi.advanceTimersByTimeAsync(250);
      expect(mockProcessKill).toHaveBeenCalledWith(-54321, 'SIGKILL');

      vi.useRealTimers();
    });

    it('should not attempt cleanup on Windows when no background PIDs exist', async () => {
      const originalPlatform = vi.mocked(os.platform).getMockImplementation();
      vi.mocked(os.platform).mockReturnValue('win32');
      const mockSpawn = vi.fn();
      vi.mocked(spawn).mockImplementation(mockSpawn);

      // Create invocation directly to bypass validation
      const invocation = new ShellToolInvocation(
        mockConfig,
        { command: 'echo test' },
        new Set(),
      );

      const abortController = new AbortController();
      const { signal } = abortController;

      const promise = invocation.execute(signal);
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

      // Abort the signal
      abortController.abort();

      // Should not call spawn for taskkill since no background PIDs
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(mockProcessKill).not.toHaveBeenCalled();

      // Restore original platform mock
      if (originalPlatform) {
        vi.mocked(os.platform).mockImplementation(originalPlatform);
      } else {
        vi.mocked(os.platform).mockReturnValue('linux');
      }
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

    describe('in non-interactive mode', () => {
      beforeEach(() => {
        (mockConfig.isInteractive as Mock).mockReturnValue(false);
      });

      it('should not throw an error or block for an allowed command', async () => {
        (mockConfig.getAllowedTools as Mock).mockReturnValue(['ShellTool(wc)']);
        const invocation = shellTool.build({ command: 'wc -l foo.txt' });
        const confirmation = await invocation.shouldConfirmExecute(
          new AbortController().signal,
        );
        expect(confirmation).toBe(false);
      });

      it('should not throw an error or block for an allowed command with arguments', async () => {
        (mockConfig.getAllowedTools as Mock).mockReturnValue([
          'ShellTool(wc -l)',
        ]);
        const invocation = shellTool.build({ command: 'wc -l foo.txt' });
        const confirmation = await invocation.shouldConfirmExecute(
          new AbortController().signal,
        );
        expect(confirmation).toBe(false);
      });

      it('should throw an error for command that is not allowed', async () => {
        (mockConfig.getAllowedTools as Mock).mockReturnValue([
          'ShellTool(wc -l)',
        ]);
        const invocation = shellTool.build({ command: 'madeupcommand' });
        await expect(
          invocation.shouldConfirmExecute(new AbortController().signal),
        ).rejects.toThrow('madeupcommand');
      });

      it('should throw an error for a command that is a prefix of an allowed command', async () => {
        (mockConfig.getAllowedTools as Mock).mockReturnValue([
          'ShellTool(wc -l)',
        ]);
        const invocation = shellTool.build({ command: 'wc' });
        await expect(
          invocation.shouldConfirmExecute(new AbortController().signal),
        ).rejects.toThrow('wc');
      });
    });
  });

  describe('getDescription', () => {
    it('should return the windows description when on windows', () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      const shellTool = new ShellTool(mockConfig);
      expect(shellTool.description).toMatchSnapshot();
    });

    it('should return the non-windows description when not on windows', () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      const shellTool = new ShellTool(mockConfig);
      expect(shellTool.description).toMatchSnapshot();
    });
  });
  describe('AbortSignal-based background process cleanup', () => {
    const mockSpawn = vi.fn();

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

    beforeEach(() => {
      vi.resetAllMocks();
      mockProcessKill.mockClear();
      vi.mocked(spawn).mockImplementation(mockSpawn);
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.mocked(os.tmpdir).mockReturnValue('/tmp');
      (vi.mocked(crypto.randomBytes) as Mock).mockReturnValue(
        Buffer.from('abcdef', 'hex'),
      );

      // Setup the shell execution service mock
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

    it('should kill Unix processes using process groups when AbortSignal fires', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.useFakeTimers();

      const shellTool = new ShellTool(mockConfig);
      const invocation = shellTool.build({ command: 'sleep 100 &' });

      const abortController = new AbortController();
      const { signal } = abortController;

      // Mock pgrep output
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`12345${EOL}54321${EOL}`);

      const promise = invocation.execute(signal);
      resolveShellExecution({
        pid: 12345,
        output: '',
        exitCode: 0,
      });

      await promise;

      // Trigger abort to kill background processes
      abortController.abort();

      // Should kill process group (negative PID)
      expect(mockProcessKill).toHaveBeenCalledWith(-54321, 'SIGTERM');

      // Advance timers to trigger SIGKILL
      await vi.advanceTimersByTimeAsync(250);
      expect(mockProcessKill).toHaveBeenCalledWith(-54321, 'SIGKILL');

      vi.useRealTimers();
    });

    it('should not track background processes on Windows', async () => {
      const originalPlatform = vi.mocked(os.platform).getMockImplementation();
      vi.mocked(os.platform).mockReturnValue('win32');

      // Create invocation directly to bypass validation
      const invocation = new ShellToolInvocation(
        mockConfig,
        { command: 'echo test' },
        new Set(),
      );

      const abortController = new AbortController();
      const { signal } = abortController;

      // Windows doesn't use pgrep for background PID detection
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const promise = invocation.execute(signal);
      resolveShellExecution({
        pid: 12345,
        output: '',
        exitCode: 0,
      });

      await promise;

      // Trigger abort
      abortController.abort();

      // Should not call taskkill since Windows doesn't track background PIDs
      expect(mockSpawn).not.toHaveBeenCalled();

      // Restore original platform mock
      if (originalPlatform) {
        vi.mocked(os.platform).mockImplementation(originalPlatform);
      } else {
        vi.mocked(os.platform).mockReturnValue('linux');
      }
      expect(mockProcessKill).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully when processes are already dead', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');

      const shellTool = new ShellTool(mockConfig);
      const invocation = shellTool.build({ command: 'sleep 100 &' });

      const abortController = new AbortController();
      const { signal } = abortController;

      // Mock pgrep output
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`12345${EOL}54321${EOL}`);

      const promise = invocation.execute(signal);
      resolveShellExecution({
        pid: 12345,
        output: '',
        exitCode: 0,
      });

      await promise;

      // Set up mock to throw error when killing process
      mockProcessKill.mockImplementation(() => {
        throw new Error('ESRCH: No such process');
      });

      // Trigger abort - should not throw even if process.kill fails
      expect(() => abortController.abort()).not.toThrow();

      // Verify it tried to kill the process even though it failed
      expect(mockProcessKill).toHaveBeenCalledWith(-54321, 'SIGTERM');
    });

    it('should only cleanup once per AbortSignal', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');

      const shellTool = new ShellTool(mockConfig);
      const invocation = shellTool.build({ command: 'sleep 100 &' });

      const abortController = new AbortController();
      const { signal } = abortController;

      // Mock pgrep output
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`12345${EOL}54321${EOL}`);

      const promise = invocation.execute(signal);
      resolveShellExecution({
        pid: 12345,
        output: '',
        exitCode: 0,
      });

      await promise;

      // First abort should kill processes
      abortController.abort();
      expect(mockProcessKill).toHaveBeenCalledWith(-54321, 'SIGTERM');

      const callCount = mockProcessKill.mock.calls.length;

      // Trying to abort again should do nothing (signal already aborted)
      // The event listener uses { once: true } so it won't fire again
      abortController.abort();

      // Should not have any additional calls
      expect(mockProcessKill).toHaveBeenCalledTimes(callCount);
    });

    it('should send SIGKILL after timeout for stubborn processes', async () => {
      vi.mocked(os.platform).mockReturnValue('linux');
      vi.useFakeTimers();

      const shellTool = new ShellTool(mockConfig);
      const invocation = shellTool.build({ command: 'sleep 100 &' });

      const abortController = new AbortController();
      const { signal } = abortController;

      // Mock pgrep output
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(`12345${EOL}54321${EOL}`);

      const promise = invocation.execute(signal);
      resolveShellExecution({
        pid: 12345,
        output: '',
        exitCode: 0,
      });

      await promise;

      // Trigger abort to kill background processes
      abortController.abort();

      // Should send SIGTERM first
      expect(mockProcessKill).toHaveBeenCalledWith(-54321, 'SIGTERM');

      // Advance timers to trigger SIGKILL
      await vi.advanceTimersByTimeAsync(250);

      // Should send SIGKILL after timeout
      expect(mockProcessKill).toHaveBeenCalledWith(-54321, 'SIGKILL');

      vi.useRealTimers();
    });
  });
});
beforeAll(async () => {
  await initializeShellParsers();
});
