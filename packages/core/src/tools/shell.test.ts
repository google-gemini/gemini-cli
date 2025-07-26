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
import {
  type ShellExecutionResult,
  type ShellOutputEvent,
} from '../services/shellExecutionService.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import * as summarizer from '../utils/summarizer.js';
import { ToolConfirmationOutcome } from './tools.js';
import { OUTPUT_UPDATE_INTERVAL_MS } from './shell.js';

describe('ShellTool', () => {
  let shellTool: ShellTool;
  let mockConfig: Config;
  let mockShellOutputCallback: (event: ShellOutputEvent) => void;
  let resolveExecutionPromise: (result: ShellExecutionResult) => void;

  beforeEach(() => {
    vi.clearAllMocks();

    mockConfig = {
      getCoreTools: vi.fn().mockReturnValue([]),
      getExcludeTools: vi.fn().mockReturnValue([]),
      getDebugMode: vi.fn().mockReturnValue(false),
      getTargetDir: vi.fn().mockReturnValue('/test/dir'),
      getSummarizeToolOutputConfig: vi.fn().mockReturnValue(undefined),
      getGeminiClient: vi.fn(),
    } as unknown as Config;

    shellTool = new ShellTool(mockConfig);

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

  describe('validateToolParams', () => {
    it('should return null for a valid command', () => {
      expect(shellTool.validateToolParams({ command: 'ls -l' })).toBeNull();
    });

    it('should return an error for an empty command', () => {
      expect(shellTool.validateToolParams({ command: ' ' })).toBe(
        'Command cannot be empty.',
      );
    });

    it('should return an error for a non-existent directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(
        shellTool.validateToolParams({ command: 'ls', directory: 'rel/path' }),
      ).toBe('Directory must exist.');
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
        stdout: 'Success',
        stderr: '',
        exitCode: 0,
        signal: null,
        error: null,
        aborted: false,
        pid: 12345,
        ...result,
      };
      resolveExecutionPromise(fullResult);
    };

    it('should wrap command on linux and parse pgrep output', async () => {
      const promise = shellTool.execute(
        { command: 'my-command &' },
        mockAbortSignal,
      );
      resolveShellExecution({ pid: 54321 });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('54321\n54322\n'); // Service PID and background PID

      const result = await promise;

      const tmpFile = path.join(os.tmpdir(), 'shell_pgrep_abcdef.tmp');
      const wrappedCommand = `{ my-command & }; __code=$?; pgrep -g 0 >${tmpFile} 2>&1; exit $__code;`;
      expect(mockShellExecutionService).toHaveBeenCalledWith(
        wrappedCommand,
        expect.any(String),
        expect.any(Function),
        mockAbortSignal,
      );
      expect(result.llmContent).toContain('Background PIDs: 54322');
      expect(vi.mocked(fs.unlinkSync)).toHaveBeenCalledWith(tmpFile);
    });

    it('should not wrap command on windows', async () => {
      vi.mocked(os.platform).mockReturnValue('win32');
      const promise = shellTool.execute({ command: 'dir' }, mockAbortSignal);
      resolveExecutionPromise({
        rawOutput: Buffer.from(''),
        output: '',
        stdout: '',
        stderr: '',
        exitCode: 0,
        signal: null,
        error: null,
        aborted: false,
        pid: 12345,
      });
      await promise;
      expect(mockShellExecutionService).toHaveBeenCalledWith(
        'dir',
        expect.any(String),
        expect.any(Function),
        mockAbortSignal,
      );
    });

    it('should format error messages correctly', async () => {
      const error = new Error('wrapped command failed');
      const promise = shellTool.execute(
        { command: 'user-command' },
        mockAbortSignal,
      );
      resolveShellExecution({
        error,
        exitCode: 1,
        output: 'err',
        stderr: 'err',
        rawOutput: Buffer.from('err'),
        stdout: '',
        signal: null,
        aborted: false,
        pid: 12345,
      });

      const result = await promise;
      // The final llmContent should contain the user's command, not the wrapper
      expect(result.llmContent).toContain('Error: wrapped command failed');
      expect(result.llmContent).not.toContain('pgrep');
    });

    it('should summarize output when configured', async () => {
      (mockConfig.getSummarizeToolOutputConfig as Mock).mockReturnValue({
        [shellTool.name]: { tokenBudget: 1000 },
      });
      vi.mocked(summarizer.summarizeToolOutput).mockResolvedValue(
        'summarized output',
      );

      const promise = shellTool.execute({ command: 'ls' }, mockAbortSignal);
      resolveExecutionPromise({
        output: 'long output',
        rawOutput: Buffer.from('long output'),
        stdout: 'long output',
        stderr: '',
        exitCode: 0,
        signal: null,
        error: null,
        aborted: false,
        pid: 12345,
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

      await expect(
        shellTool.execute({ command: 'a-command' }, mockAbortSignal),
      ).rejects.toThrow(error);

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
        const promise = shellTool.execute(
          { command: 'stream' },
          mockAbortSignal,
          updateOutputMock,
        );

        // First chunk, should be throttled.
        mockShellOutputCallback({
          type: 'data',
          stream: 'stdout',
          chunk: 'hello ',
        });
        expect(updateOutputMock).not.toHaveBeenCalled();

        // Advance time past the throttle interval.
        await vi.advanceTimersByTimeAsync(OUTPUT_UPDATE_INTERVAL_MS + 1);

        // Send a second chunk. THIS event triggers the update with the CUMULATIVE content.
        mockShellOutputCallback({
          type: 'data',
          stream: 'stderr',
          chunk: 'world',
        });

        // It should have been called once now with the combined output.
        expect(updateOutputMock).toHaveBeenCalledOnce();
        expect(updateOutputMock).toHaveBeenCalledWith('hello \nworld');

        resolveExecutionPromise({
          rawOutput: Buffer.from(''),
          output: '',
          stdout: '',
          stderr: '',
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
        });
        await promise;
      });

      it('should immediately show binary detection message and throttle progress', async () => {
        const promise = shellTool.execute(
          { command: 'cat img' },
          mockAbortSignal,
          updateOutputMock,
        );

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
          stdout: '',
          stderr: '',
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
        });
        await promise;
      });
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should request confirmation for a new command and whitelist it on "Always"', async () => {
      const params = { command: 'npm install' };
      const confirmation = await shellTool.shouldConfirmExecute(
        params,
        new AbortController().signal,
      );

      expect(confirmation).not.toBe(false);
      expect(confirmation && confirmation.type).toBe('exec');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (confirmation as any).onConfirm(
        ToolConfirmationOutcome.ProceedAlways,
      );

      // Should now be whitelisted
      const secondConfirmation = await shellTool.shouldConfirmExecute(
        { command: 'npm test' },
        new AbortController().signal,
      );
      expect(secondConfirmation).toBe(false);
    });

    it('should skip confirmation if validation fails', async () => {
      const confirmation = await shellTool.shouldConfirmExecute(
        { command: '' },
        new AbortController().signal,
      );
      expect(confirmation).toBe(false);
    });
  });
});
