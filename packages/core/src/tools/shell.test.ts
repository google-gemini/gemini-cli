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

const mockPlatform = vi.hoisted(() => vi.fn());

const mockShellExecutionService = vi.hoisted(() => vi.fn());
vi.mock('../services/shellExecutionService.js', () => ({
  ShellExecutionService: { execute: mockShellExecutionService },
}));

vi.mock('node:os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    default: {
      ...actualOs,
      platform: mockPlatform,
    },
    platform: mockPlatform,
  };
});
vi.mock('crypto');
vi.mock('../utils/summarizer.js');

import {
  initializeShellParsers,
  isCommandAllowed,
} from '../utils/shell-utils.js';
import { ShellTool } from './shell.js';
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
import * as summarizer from '../utils/summarizer.js';
import { ToolErrorType } from './tool-error.js';
import { ToolConfirmationOutcome } from './tools.js';
import { OUTPUT_UPDATE_INTERVAL_MS } from './shell.js';
import { SHELL_TOOL_NAME } from './tool-names.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';

const originalComSpec = process.env['ComSpec'];
const itWindowsOnly = process.platform === 'win32' ? it : it.skip;

describe('ShellTool', () => {
  beforeAll(async () => {
    await initializeShellParsers();
  });

  let shellTool: ShellTool;
  let mockConfig: Config;
  let mockShellOutputCallback: (event: ShellOutputEvent) => void;
  let resolveExecutionPromise: (result: ShellExecutionResult) => void;
  let tempRootDir: string;

  beforeEach(() => {
    vi.clearAllMocks();

    tempRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-test-'));
    fs.mkdirSync(path.join(tempRootDir, 'subdir'));

    mockConfig = {
      getAllowedTools: vi.fn().mockReturnValue([]),
      getApprovalMode: vi.fn().mockReturnValue('strict'),
      getCoreTools: vi.fn().mockReturnValue([]),
      getExcludeTools: vi.fn().mockReturnValue(new Set([])),
      getDebugMode: vi.fn().mockReturnValue(false),
      getTargetDir: vi.fn().mockReturnValue(tempRootDir),
      getSummarizeToolOutputConfig: vi.fn().mockReturnValue(undefined),
      getWorkspaceContext: vi
        .fn()
        .mockReturnValue(new WorkspaceContext(tempRootDir)),
      getGeminiClient: vi.fn(),
      getEnableInteractiveShell: vi.fn().mockReturnValue(false),
      isInteractive: vi.fn().mockReturnValue(true),
    } as unknown as Config;

    shellTool = new ShellTool(mockConfig);

    mockPlatform.mockReturnValue('linux');
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
    if (fs.existsSync(tempRootDir)) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
    }
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

    it('should return an invocation for a valid relative directory path', () => {
      const invocation = shellTool.build({
        command: 'ls',
        dir_path: 'subdir',
      });
      expect(invocation).toBeDefined();
    });

    it('should throw an error for a directory outside the workspace', () => {
      const outsidePath = path.resolve(tempRootDir, '../outside');
      expect(() =>
        shellTool.build({ command: 'ls', dir_path: outsidePath }),
      ).toThrow(
        `Directory '${outsidePath}' is not within any of the registered workspace directories.`,
      );
    });

    it('should return an invocation for a valid absolute directory path', () => {
      const invocation = shellTool.build({
        command: 'ls',
        dir_path: path.join(tempRootDir, 'subdir'),
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

      // Simulate pgrep output file creation by the shell command
      const tmpFile = path.join(os.tmpdir(), 'shell_pgrep_abcdef.tmp');
      fs.writeFileSync(tmpFile, `54321${EOL}54322${EOL}`);

      const result = await promise;

      const wrappedCommand = `{ my-command & }; __code=$?; pgrep -g 0 >${tmpFile} 2>&1; exit $__code;`;
      expect(mockShellExecutionService).toHaveBeenCalledWith(
        wrappedCommand,
        tempRootDir,
        expect.any(Function),
        mockAbortSignal,
        false,
        {},
      );
      expect(result.llmContent).toContain('Background PIDs: 54322');
      // The file should be deleted by the tool
      expect(fs.existsSync(tmpFile)).toBe(false);
    });

    it('should use the provided absolute directory as cwd', async () => {
      const subdir = path.join(tempRootDir, 'subdir');
      const invocation = shellTool.build({
        command: 'ls',
        dir_path: subdir,
      });
      const promise = invocation.execute(mockAbortSignal);
      resolveShellExecution();
      await promise;

      const tmpFile = path.join(os.tmpdir(), 'shell_pgrep_abcdef.tmp');
      const wrappedCommand = `{ ls; }; __code=$?; pgrep -g 0 >${tmpFile} 2>&1; exit $__code;`;
      expect(mockShellExecutionService).toHaveBeenCalledWith(
        wrappedCommand,
        subdir,
        expect.any(Function),
        mockAbortSignal,
        false,
        {},
      );
    });

    it('should use the provided relative directory as cwd', async () => {
      const invocation = shellTool.build({
        command: 'ls',
        dir_path: 'subdir',
      });
      const promise = invocation.execute(mockAbortSignal);
      resolveShellExecution();
      await promise;

      const tmpFile = path.join(os.tmpdir(), 'shell_pgrep_abcdef.tmp');
      const wrappedCommand = `{ ls; }; __code=$?; pgrep -g 0 >${tmpFile} 2>&1; exit $__code;`;
      expect(mockShellExecutionService).toHaveBeenCalledWith(
        wrappedCommand,
        path.join(tempRootDir, 'subdir'),
        expect.any(Function),
        mockAbortSignal,
        false,
        {},
      );
    });

    itWindowsOnly(
      'should not wrap command on windows',
      async () => {
        mockPlatform.mockReturnValue('win32');
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
          tempRootDir,
          expect.any(Function),
          mockAbortSignal,
          false,
          {},
        );
      },
      20000,
    );

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
        // Create the temp file before throwing to simulate it being left behind
        const tmpFile = path.join(os.tmpdir(), 'shell_pgrep_abcdef.tmp');
        fs.writeFileSync(tmpFile, '');
        throw error;
      });

      const invocation = shellTool.build({ command: 'a-command' });
      await expect(invocation.execute(mockAbortSignal)).rejects.toThrow(error);

      const tmpFile = path.join(os.tmpdir(), 'shell_pgrep_abcdef.tmp');
      expect(fs.existsSync(tmpFile)).toBe(false);
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

      it('should require all segments of a chained command to be allowlisted', async () => {
        (mockConfig.getAllowedTools as Mock).mockReturnValue([
          'ShellTool(echo)',
        ]);
        const invocation = shellTool.build({ command: 'echo "foo" && ls -l' });
        await expect(
          invocation.shouldConfirmExecute(new AbortController().signal),
        ).rejects.toThrow(
          'Command "echo "foo" && ls -l" is not in the list of allowed tools for non-interactive mode.',
        );
      });
    });
  });

  describe('getDescription', () => {
    it('should return the windows description when on windows', () => {
      mockPlatform.mockReturnValue('win32');
      const shellTool = new ShellTool(mockConfig);
      expect(shellTool.description).toMatchSnapshot();
    });

    it('should return the non-windows description when not on windows', () => {
      mockPlatform.mockReturnValue('linux');
      const shellTool = new ShellTool(mockConfig);
      expect(shellTool.description).toMatchSnapshot();
    });
  });
});
