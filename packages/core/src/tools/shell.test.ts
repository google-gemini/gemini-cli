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
const mockHomedir = vi.hoisted(() => vi.fn());

const mockShellExecutionService = vi.hoisted(() => vi.fn());
const mockShellBackground = vi.hoisted(() => vi.fn());

vi.mock('../services/shellExecutionService.js', () => ({
  ShellExecutionService: {
    execute: mockShellExecutionService,
    background: mockShellBackground,
  },
}));

vi.mock('node:os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    default: {
      ...actualOs,
      platform: mockPlatform,
      homedir: mockHomedir,
    },
    platform: mockPlatform,
    homedir: mockHomedir,
  };
});
vi.mock('crypto');
vi.mock('../utils/summarizer.js');

import { initializeShellParsers } from '../utils/shell-utils.js';
import { ShellTool, OUTPUT_UPDATE_INTERVAL_MS } from './shell.js';
import { debugLogger } from '../index.js';
import { type Config } from '../config/config.js';
import { NoopSandboxManager } from '../services/sandboxManager.js';
import {
  type ShellExecutionResult,
  type ShellOutputEvent,
} from '../services/shellExecutionService.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { isSubpath } from '../utils/paths.js';
import * as crypto from 'node:crypto';
import * as summarizer from '../utils/summarizer.js';
import { ToolErrorType } from './tool-error.js';
import {
  ToolConfirmationOutcome,
  type ToolSandboxExpansionConfirmationDetails,
  type ToolExecuteConfirmationDetails,
} from './tools.js';
import { SHELL_TOOL_NAME } from './tool-names.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
import {
  createMockMessageBus,
  getMockMessageBusInstance,
} from '../test-utils/mock-message-bus.js';
import {
  MessageBusType,
  type UpdatePolicy,
} from '../confirmation-bus/types.js';
import { type MessageBus } from '../confirmation-bus/message-bus.js';
import { type SandboxManager } from '../services/sandboxManager.js';

interface TestableMockMessageBus extends MessageBus {
  defaultToolDecision: 'allow' | 'deny' | 'ask_user';
}

const originalComSpec = process.env['ComSpec'];
const itWindowsOnly = process.platform === 'win32' ? it : it.skip;

describe('ShellTool', () => {
  beforeAll(async () => {
    await initializeShellParsers();
  });

  let shellTool: ShellTool;
  let mockConfig: Config;
  let mockSandboxManager: SandboxManager;
  let mockShellOutputCallback: (event: ShellOutputEvent) => void;
  let resolveExecutionPromise: (result: ShellExecutionResult) => void;
  let tempRootDir: string;
  let extractedTmpFile: string;

  beforeEach(() => {
    vi.clearAllMocks();

    tempRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-test-'));
    fs.mkdirSync(path.join(tempRootDir, 'subdir'));

    mockSandboxManager = new NoopSandboxManager();
    mockConfig = {
      get config() {
        return this;
      },
      geminiClient: {
        stripThoughtsFromHistory: vi.fn(),
      },

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
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
      },
      isPathAllowed(this: Config, absolutePath: string): boolean {
        const workspaceContext = this.getWorkspaceContext();
        if (workspaceContext.isPathWithinWorkspace(absolutePath)) {
          return true;
        }

        const projectTempDir = this.storage.getProjectTempDir();
        return isSubpath(path.resolve(projectTempDir), absolutePath);
      },
      validatePathAccess(this: Config, absolutePath: string): string | null {
        if (this.isPathAllowed(absolutePath)) {
          return null;
        }

        const workspaceDirs = this.getWorkspaceContext().getDirectories();
        const projectTempDir = this.storage.getProjectTempDir();
        return `Path not in workspace: Attempted path "${absolutePath}" resolves outside the allowed workspace directories: ${workspaceDirs.join(', ')} or the project temp directory: ${projectTempDir}`;
      },
      getGeminiClient: vi.fn().mockReturnValue({}),
      getShellToolInactivityTimeout: vi.fn().mockReturnValue(1000),
      getEnableInteractiveShell: vi.fn().mockReturnValue(false),
      getShellBackgroundCompletionBehavior: vi.fn().mockReturnValue('silent'),
      getEnableShellOutputEfficiency: vi.fn().mockReturnValue(true),
      getSandboxEnabled: vi.fn().mockReturnValue(false),
      sanitizationConfig: {},
      get sandboxManager() {
        return mockSandboxManager;
      },
      sandboxPolicyManager: {
        getCommandPermissions: vi.fn().mockReturnValue({
          fileSystem: { read: [], write: [] },
          network: false,
        }),

        getModeConfig: vi.fn().mockReturnValue({ readonly: false }),
        addPersistentApproval: vi.fn(),
        addSessionApproval: vi.fn(),
      },
    } as unknown as Config;

    const bus = createMockMessageBus();
    const mockBus = getMockMessageBusInstance(
      bus,
    ) as unknown as TestableMockMessageBus;
    mockBus.defaultToolDecision = 'ask_user';

    // Simulate policy update
    bus.subscribe(MessageBusType.UPDATE_POLICY, (msg: UpdatePolicy) => {
      if (msg.commandPrefix) {
        const prefixes = Array.isArray(msg.commandPrefix)
          ? msg.commandPrefix
          : [msg.commandPrefix];
        const current = mockConfig.getAllowedTools() || [];
        (mockConfig.getAllowedTools as Mock).mockReturnValue([
          ...current,
          ...prefixes,
        ]);
        // Simulate Policy Engine allowing the tool after update
        mockBus.defaultToolDecision = 'allow';
      }
    });

    shellTool = new ShellTool(mockConfig, bus);

    mockPlatform.mockReturnValue('linux');
    mockHomedir.mockReturnValue('/home/user');
    (vi.mocked(crypto.randomBytes) as Mock).mockReturnValue(
      Buffer.from('abcdef', 'hex'),
    );
    process.env['ComSpec'] =
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

    extractedTmpFile = '';

    // Capture the output callback to simulate streaming events from the service
    mockShellExecutionService.mockImplementation(
      (
        cmd: string,
        _cwd: string,
        callback: (event: ShellOutputEvent) => void,
      ) => {
        mockShellOutputCallback = callback;
        const match = cmd.match(/pgrep -g 0 >([^ ]+)/);
        if (match) {
          extractedTmpFile = match[1].replace(/['"]/g, '');
        }
        return {
          pid: 12345,
          result: new Promise((resolve) => {
            resolveExecutionPromise = resolve;
          }),
        };
      },
    );

    mockShellBackground.mockImplementation(() => {
      resolveExecutionPromise({
        output: '',
        rawOutput: Buffer.from(''),
        exitCode: null,
        signal: null,
        error: null,
        aborted: false,
        pid: 12345,
        executionMethod: 'child_process',
        backgrounded: true,
      });
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
      ).toThrow(/Path not in workspace/);
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
      const promise = invocation.execute({ abortSignal: mockAbortSignal });

      // Simulate pgrep output file creation by the shell command
      fs.writeFileSync(extractedTmpFile, `54321${os.EOL}54322${os.EOL}`);

      resolveShellExecution({ pid: 54321 });

      const result = await promise;

      expect(mockShellExecutionService).toHaveBeenCalledWith(
        expect.stringMatching(/pgrep -g 0 >.*gemini-shell-.*[/\\]pgrep\.tmp/),
        tempRootDir,
        expect.any(Function),
        expect.any(AbortSignal),
        false,
        expect.objectContaining({
          pager: 'cat',
          sanitizationConfig: {},
          sandboxManager: expect.any(Object),
        }),
      );
      expect(result.llmContent).toContain('Background PIDs: 54322');
      // The file should be deleted by the tool
      expect(fs.existsSync(extractedTmpFile)).toBe(false);
    });

    it('should add a space when command ends with a backslash to prevent escaping newline', async () => {
      const invocation = shellTool.build({ command: 'ls\\' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution();
      await promise;

      expect(mockShellExecutionService).toHaveBeenCalledWith(
        expect.stringMatching(/pgrep -g 0 >.*gemini-shell-.*[/\\]pgrep\.tmp/),
        tempRootDir,
        expect.any(Function),
        expect.any(AbortSignal),
        false,
        expect.any(Object),
      );
    });

    it('should handle trailing comments correctly by placing them on their own line', async () => {
      const invocation = shellTool.build({ command: 'ls # comment' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution();
      await promise;

      expect(mockShellExecutionService).toHaveBeenCalledWith(
        expect.stringMatching(/pgrep -g 0 >.*gemini-shell-.*[/\\]pgrep\.tmp/),
        tempRootDir,
        expect.any(Function),
        expect.any(AbortSignal),
        false,
        expect.any(Object),
      );
    });

    it('should use the provided absolute directory as cwd', async () => {
      const subdir = path.join(tempRootDir, 'subdir');
      const invocation = shellTool.build({
        command: 'ls',
        dir_path: subdir,
      });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution();
      await promise;

      expect(mockShellExecutionService).toHaveBeenCalledWith(
        expect.stringMatching(/pgrep -g 0 >.*gemini-shell-.*[/\\]pgrep\.tmp/),
        subdir,
        expect.any(Function),
        expect.any(AbortSignal),
        false,
        expect.objectContaining({
          pager: 'cat',
          sanitizationConfig: {},
          sandboxManager: expect.any(Object),
        }),
      );
    });

    it('should use the provided relative directory as cwd', async () => {
      const invocation = shellTool.build({
        command: 'ls',
        dir_path: 'subdir',
      });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution();
      await promise;

      expect(mockShellExecutionService).toHaveBeenCalledWith(
        expect.stringMatching(/pgrep -g 0 >.*gemini-shell-.*[/\\]pgrep\.tmp/),
        path.join(tempRootDir, 'subdir'),
        expect.any(Function),
        expect.any(AbortSignal),
        false,
        expect.objectContaining({
          pager: 'cat',
          sanitizationConfig: {},
          sandboxManager: expect.any(Object),
        }),
      );
    });

    it('should handle is_background parameter by calling ShellExecutionService.background', async () => {
      vi.useFakeTimers();
      const invocation = shellTool.build({
        command: 'sleep 10',
        is_background: true,
      });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });

      // We need to provide a PID for the background logic to trigger
      resolveShellExecution({ pid: 12345 });

      // Advance time to trigger the background timeout
      await vi.advanceTimersByTimeAsync(250);

      expect(mockShellBackground).toHaveBeenCalledWith(
        12345,
        'default',
        'sleep 10',
      );

      await promise;
    });

    itWindowsOnly(
      'should not wrap command on windows',
      async () => {
        mockPlatform.mockReturnValue('win32');
        const invocation = shellTool.build({ command: 'dir' });
        const promise = invocation.execute({ abortSignal: mockAbortSignal });
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
          expect.any(AbortSignal),
          false,
          expect.objectContaining({
            pager: 'cat',
            sanitizationConfig: {},
            sandboxManager: expect.any(NoopSandboxManager),
          }),
        );
      },
      20000,
    );

    it('should correctly wrap heredoc commands', async () => {
      const command = `cat << 'EOF'
hello world
EOF`;
      const invocation = shellTool.build({ command });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution();
      await promise;

      expect(mockShellExecutionService).toHaveBeenCalledWith(
        expect.stringMatching(/pgrep -g 0 >.*gemini-shell-.*[/\\]pgrep\.tmp/),
        tempRootDir,
        expect.any(Function),
        expect.any(AbortSignal),
        false,
        expect.any(Object),
      );
      expect(mockShellExecutionService.mock.calls[0][0]).toMatch(/\nEOF\n\)\n/);
    });

    it('should format error messages correctly', async () => {
      const error = new Error('wrapped command failed');
      const invocation = shellTool.build({ command: 'user-command' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
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
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
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
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
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
        mockConfig,
        { model: 'summarizer-shell' },
        expect.any(String),
        mockConfig.geminiClient,
        mockAbortSignal,
      );
      expect(result.llmContent).toBe('summarized output');
      expect(result.returnDisplay).toBe('long output');
    });

    it('should NOT start a timeout if timeoutMs is <= 0', async () => {
      // Mock the timeout config to be 0
      (mockConfig.getShellToolInactivityTimeout as Mock).mockReturnValue(0);

      vi.useFakeTimers();

      const invocation = shellTool.build({ command: 'sleep 10' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });

      // Verify no timeout logic is triggered even after a long time
      resolveShellExecution({
        output: 'finished',
        exitCode: 0,
      });

      await promise;
      // If we got here without aborting/timing out logic interfering, we're good.
      // We can also verify that setTimeout was NOT called for the inactivity timeout.
      // However, since we don't have direct access to the internal `resetTimeout`,
      // we can infer success by the fact it didn't abort.
    });

    it('should clean up the temp file on synchronous execution error', async () => {
      const error = new Error('sync spawn error');
      mockShellExecutionService.mockImplementation((cmd: string) => {
        const match = cmd.match(/pgrep -g 0 >([^ ]+)/);
        if (match) {
          extractedTmpFile = match[1].replace(/['"]/g, ''); // remove any quotes if present
          // Create the temp file before throwing to simulate it being left behind
          fs.writeFileSync(extractedTmpFile, '');
        }
        throw error;
      });

      const invocation = shellTool.build({ command: 'a-command' });
      await expect(
        invocation.execute({ abortSignal: mockAbortSignal }),
      ).rejects.toThrow(error);

      expect(fs.existsSync(extractedTmpFile)).toBe(false);
    });

    it('should not log "missing pgrep output" when process is backgrounded', async () => {
      vi.useFakeTimers();
      const debugErrorSpy = vi.spyOn(debugLogger, 'error');

      const invocation = shellTool.build({
        command: 'sleep 10',
        is_background: true,
      });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });

      // Advance time to trigger backgrounding
      await vi.advanceTimersByTimeAsync(200);

      await promise;

      expect(debugErrorSpy).not.toHaveBeenCalledWith('missing pgrep output');
    });

    describe('Streaming to `updateOutput`', () => {
      let updateOutputMock: Mock;
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
        updateOutputMock = vi.fn();
      });
      afterEach(() => {
        vi.useRealTimers();
      });

      it('should immediately show binary detection message and throttle progress', async () => {
        const invocation = shellTool.build({ command: 'cat img' });
        const promise = invocation.execute({
          abortSignal: mockAbortSignal,
          updateOutput: updateOutputMock,
        });

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

      it('should NOT call updateOutput if the command is backgrounded', async () => {
        const invocation = shellTool.build({
          command: 'sleep 10',
          is_background: true,
        });
        const promise = invocation.execute({
          abortSignal: mockAbortSignal,
          updateOutput: updateOutputMock,
        });

        mockShellOutputCallback({ type: 'data', chunk: 'some output' });
        expect(updateOutputMock).not.toHaveBeenCalled();

        // We need to provide a PID for the background logic to trigger
        resolveShellExecution({ pid: 12345 });

        // Advance time to trigger the background timeout
        await vi.advanceTimersByTimeAsync(250);

        expect(mockShellBackground).toHaveBeenCalledWith(
          12345,
          'default',
          'sleep 10',
        );

        await promise;
      });
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should request confirmation for a new command and allowlist it on "Always"', async () => {
      const params = { command: 'ls -la' };
      const invocation = shellTool.build(params);

      // Accessing protected messageBus for testing purposes
      const bus = (shellTool as unknown as { messageBus: MessageBus })
        .messageBus;
      const mockBus = getMockMessageBusInstance(
        bus,
      ) as unknown as TestableMockMessageBus;

      // Initially needs confirmation
      mockBus.defaultToolDecision = 'ask_user';
      const confirmation = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(confirmation).not.toBe(false);
      expect(confirmation && confirmation.type).toBe('exec');

      if (confirmation && confirmation.type === 'exec') {
        await confirmation.onConfirm(ToolConfirmationOutcome.ProceedAlways);
      }

      // After "Always", it should be allowlisted in the mock engine
      mockBus.defaultToolDecision = 'allow';
      const secondInvocation = shellTool.build({ command: 'npm test' });
      const secondConfirmation = await secondInvocation.shouldConfirmExecute(
        new AbortController().signal,
      );
      expect(secondConfirmation).toBe(false);
    });

    it('should throw an error if validation fails', () => {
      expect(() => shellTool.build({ command: '' })).toThrow();
    });

    it('should NOT return a sandbox expansion prompt for npm install when sandboxing is disabled', async () => {
      const bus = (shellTool as unknown as { messageBus: MessageBus })
        .messageBus;
      const mockBus = getMockMessageBusInstance(
        bus,
      ) as unknown as TestableMockMessageBus;
      mockBus.defaultToolDecision = 'allow';

      vi.mocked(mockConfig.getSandboxEnabled).mockReturnValue(false);
      const params = { command: 'npm install' };
      const invocation = shellTool.build(params);

      const confirmation = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      // Should be false because standard confirm mode is 'allow'
      expect(confirmation).toBe(false);
    });

    it('should return a sandbox expansion prompt for npm install when sandboxing is enabled', async () => {
      vi.mocked(mockConfig.getSandboxEnabled).mockReturnValue(true);
      const params = { command: 'npm install' };
      const invocation = shellTool.build(params);

      const confirmation = await invocation.shouldConfirmExecute(
        new AbortController().signal,
      );

      expect(confirmation).not.toBe(false);
      expect(confirmation && confirmation.type).toBe('sandbox_expansion');
    });
  });

  describe('getDescription', () => {
    it('should return the windows description when on windows', () => {
      mockPlatform.mockReturnValue('win32');
      const shellTool = new ShellTool(mockConfig, createMockMessageBus());
      expect(shellTool.description).toMatchSnapshot();
    });

    it('should return the non-windows description when not on windows', () => {
      mockPlatform.mockReturnValue('linux');
      const shellTool = new ShellTool(mockConfig, createMockMessageBus());
      expect(shellTool.description).toMatchSnapshot();
    });

    it('should not include efficiency guidelines when disabled', () => {
      mockPlatform.mockReturnValue('linux');
      vi.mocked(mockConfig.getEnableShellOutputEfficiency).mockReturnValue(
        false,
      );
      const shellTool = new ShellTool(mockConfig, createMockMessageBus());
      expect(shellTool.description).not.toContain('Efficiency Guidelines:');
    });

    it('should return the command if description is not provided', () => {
      const invocation = shellTool.build({
        command: 'echo "hello"',
      });
      expect(invocation.getDescription()).toBe('echo "hello"');
    });

    it('should return the command if it is short (<= 150 chars), even if description is provided', () => {
      const invocation = shellTool.build({
        command: 'echo "hello"',
        description: 'Prints a friendly greeting.',
      });
      expect(invocation.getDescription()).toBe('echo "hello"');
    });

    it('should return the description if the command is long (> 150 chars)', () => {
      const longCommand = 'echo "hello" && '.repeat(15) + 'echo "world"'; // Length > 150
      const invocation = shellTool.build({
        command: longCommand,
        description: 'Prints multiple greetings.',
      });
      expect(invocation.getDescription()).toBe('Prints multiple greetings.');
    });

    it('should return the raw command if description is an empty string', () => {
      const invocation = shellTool.build({
        command: 'echo hello',
        description: '',
      });
      expect(invocation.getDescription()).toBe('echo hello');
    });

    it('should return the raw command if description is just whitespace', () => {
      const invocation = shellTool.build({
        command: 'echo hello',
        description: '   ',
      });
      expect(invocation.getDescription()).toBe('echo hello');
    });
  });

  describe('getDisplayTitle and getExplanation', () => {
    it('should return only the command for getDisplayTitle', () => {
      const invocation = shellTool.build({
        command: 'echo hello',
        description: 'prints hello',
        dir_path: 'foo/bar',
        is_background: true,
      });
      expect(invocation.getDisplayTitle?.()).toBe('echo hello');
    });

    it('should return the context for getExplanation', () => {
      const invocation = shellTool.build({
        command: 'echo hello',
        description: 'prints hello',
        dir_path: 'foo/bar',
        is_background: true,
      });
      expect(invocation.getExplanation?.()).toBe(
        '[in foo/bar] (prints hello) [background]',
      );
    });

    it('should construct explanation without optional parameters', () => {
      const invocation = shellTool.build({
        command: 'echo hello',
      });
      expect(invocation.getExplanation?.()).toBe(
        `[current working directory ${process.cwd()}]`,
      );
    });
  });

  describe('llmContent output format', () => {
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

    it('should not include Command in output', async () => {
      const invocation = shellTool.build({ command: 'echo hello' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution({ output: 'hello', exitCode: 0 });

      const result = await promise;
      expect(result.llmContent).not.toContain('Command:');
    });

    it('should not include Directory in output', async () => {
      const invocation = shellTool.build({ command: 'ls', dir_path: 'subdir' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution({ output: 'file.txt', exitCode: 0 });

      const result = await promise;
      expect(result.llmContent).not.toContain('Directory:');
    });

    it('should not include Exit Code when command succeeds (exit code 0)', async () => {
      const invocation = shellTool.build({ command: 'echo hello' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution({ output: 'hello', exitCode: 0 });

      const result = await promise;
      expect(result.llmContent).not.toContain('Exit Code:');
    });

    it('should include Exit Code when command fails (non-zero exit code)', async () => {
      const invocation = shellTool.build({ command: 'false' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution({ output: '', exitCode: 1 });

      const result = await promise;
      expect(result.llmContent).toContain('Exit Code: 1');
    });

    it('should not include Error when there is no process error', async () => {
      const invocation = shellTool.build({ command: 'echo hello' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution({ output: 'hello', exitCode: 0, error: null });

      const result = await promise;
      expect(result.llmContent).not.toContain('Error:');
    });

    it('should include Error when there is a process error', async () => {
      const invocation = shellTool.build({ command: 'bad-command' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution({
        output: '',
        exitCode: 1,
        error: new Error('spawn ENOENT'),
      });

      const result = await promise;
      expect(result.llmContent).toContain('Error: spawn ENOENT');
    });

    it('should not include Signal when there is no signal', async () => {
      const invocation = shellTool.build({ command: 'echo hello' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution({ output: 'hello', exitCode: 0, signal: null });

      const result = await promise;
      expect(result.llmContent).not.toContain('Signal:');
    });

    it('should include Signal when process was killed by signal', async () => {
      const invocation = shellTool.build({ command: 'sleep 100' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution({
        output: '',
        exitCode: null,
        signal: 9, // SIGKILL
      });

      const result = await promise;
      expect(result.llmContent).toContain('Signal: 9');
    });

    it('should not include Background PIDs when there are none', async () => {
      const invocation = shellTool.build({ command: 'echo hello' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution({ output: 'hello', exitCode: 0 });

      const result = await promise;
      expect(result.llmContent).not.toContain('Background PIDs:');
    });

    it('should not include Process Group PGID when pid is not set', async () => {
      const invocation = shellTool.build({ command: 'echo hello' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution({ output: 'hello', exitCode: 0, pid: undefined });

      const result = await promise;
      expect(result.llmContent).not.toContain('Process Group PGID:');
    });
    it('should have minimal output for successful command', async () => {
      const invocation = shellTool.build({ command: 'echo hello' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });
      resolveShellExecution({ output: 'hello', exitCode: 0, pid: undefined });

      const result = await promise;
      // Should only contain Output field
      expect(result.llmContent).toBe('Output: hello');
    });
  });

  describe('getConfirmationDetails', () => {
    it('should annotate sub-commands with redirection correctly', async () => {
      const shellTool = new ShellTool(mockConfig, createMockMessageBus());
      const command = 'mkdir -p baz && echo "hello" > baz/test.md && ls';
      const invocation = shellTool.build({ command });

      // @ts-expect-error - getConfirmationDetails is protected
      const details = await invocation.getConfirmationDetails(
        new AbortController().signal,
      );

      expect(details).not.toBe(false);
      if (details && details.type === 'exec') {
        expect(details.rootCommand).toBe('mkdir, echo, redirection (>), ls');
      }
    });

    it('should annotate all redirected sub-commands', async () => {
      const shellTool = new ShellTool(mockConfig, createMockMessageBus());
      const command = 'cat < input.txt && grep "foo" > output.txt';
      const invocation = shellTool.build({ command });

      // @ts-expect-error - getConfirmationDetails is protected
      const details = await invocation.getConfirmationDetails(
        new AbortController().signal,
      );

      expect(details).not.toBe(false);
      if (details && details.type === 'exec') {
        expect(details.rootCommand).toBe(
          'cat, redirection (<), grep, redirection (>)',
        );
      }
    });

    it('should annotate sub-commands with pipes correctly', async () => {
      const shellTool = new ShellTool(mockConfig, createMockMessageBus());
      const command = 'ls | grep "baz"';
      const invocation = shellTool.build({ command });

      // @ts-expect-error - getConfirmationDetails is protected
      const details = await invocation.getConfirmationDetails(
        new AbortController().signal,
      );

      expect(details).not.toBe(false);
      if (details && details.type === 'exec') {
        expect(details.rootCommand).toBe('ls, grep');
      }
    });
  });

  describe('sandbox heuristics', () => {
    const mockAbortSignal = new AbortController().signal;

    beforeEach(() => {
      vi.mocked(mockConfig.getSandboxEnabled).mockReturnValue(true);
    });

    it('should suggest proactive permissions for npm commands', async () => {
      const homeDir = path.join(tempRootDir, 'home');
      fs.mkdirSync(homeDir);
      fs.mkdirSync(path.join(homeDir, '.npm'));
      fs.mkdirSync(path.join(homeDir, '.cache'));

      mockHomedir.mockReturnValue(homeDir);

      const sandboxManager = {
        parseDenials: vi.fn().mockReturnValue({
          network: true,
          filePaths: [path.join(homeDir, '.npm/_logs/test.log')],
        }),
        prepareCommand: vi.fn(),
        isKnownSafeCommand: vi.fn(),
        isDangerousCommand: vi.fn(),
      } as unknown as SandboxManager;
      mockSandboxManager = sandboxManager;

      const invocation = shellTool.build({ command: 'npm install' });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });

      resolveExecutionPromise({
        exitCode: 1,
        output: 'npm error code EPERM',
        executionMethod: 'child_process',
        signal: null,
        error: null,
        aborted: false,
        pid: 12345,
        rawOutput: Buffer.from('npm error code EPERM'),
      });

      const result = await promise;

      expect(result.error?.type).toBe(ToolErrorType.SANDBOX_EXPANSION_REQUIRED);
      const details = JSON.parse(result.error!.message);
      expect(details.additionalPermissions.network).toBe(true);
      expect(details.additionalPermissions.fileSystem.read).toContain(
        path.join(homeDir, '.npm'),
      );
      expect(details.additionalPermissions.fileSystem.read).toContain(
        path.join(homeDir, '.cache'),
      );
      expect(details.additionalPermissions.fileSystem.write).toContain(
        path.join(homeDir, '.npm'),
      );
    });

    it('should NOT consolidate paths into sensitive directories', async () => {
      const rootDir = path.join(tempRootDir, 'fake_root');
      const homeDir = path.join(rootDir, 'home');
      const user1Dir = path.join(homeDir, 'user1');
      const user2Dir = path.join(homeDir, 'user2');
      const user3Dir = path.join(homeDir, 'user3');
      fs.mkdirSync(homeDir, { recursive: true });
      fs.mkdirSync(user1Dir);
      fs.mkdirSync(user2Dir);
      fs.mkdirSync(user3Dir);

      mockHomedir.mockReturnValue(path.join(homeDir, 'user'));

      vi.spyOn(mockConfig, 'isPathAllowed').mockImplementation((p) => {
        if (p.includes('fake_root')) return false;
        return true;
      });

      const sandboxManager = {
        parseDenials: vi.fn().mockReturnValue({
          network: false,
          filePaths: [
            path.join(user1Dir, 'file1'),
            path.join(user2Dir, 'file2'),
            path.join(user3Dir, 'file3'),
          ],
        }),
        prepareCommand: vi.fn(),
        isKnownSafeCommand: vi.fn(),
        isDangerousCommand: vi.fn(),
      } as unknown as SandboxManager;
      mockSandboxManager = sandboxManager;

      const invocation = shellTool.build({ command: `ls ${homeDir}` });
      const promise = invocation.execute({ abortSignal: mockAbortSignal });

      resolveExecutionPromise({
        exitCode: 1,
        output: 'Permission denied',
        executionMethod: 'child_process',
        signal: null,
        error: null,
        aborted: false,
        pid: 12345,
        rawOutput: Buffer.from('Permission denied'),
      });

      const result = await promise;

      expect(result.error?.type).toBe(ToolErrorType.SANDBOX_EXPANSION_REQUIRED);
      const details = JSON.parse(result.error!.message);

      // Should NOT contain homeDir as it is a parent of homedir and thus sensitive
      expect(details.additionalPermissions.fileSystem.read).not.toContain(
        homeDir,
      );
      // Should contain individual paths instead
      expect(details.additionalPermissions.fileSystem.read).toContain(user1Dir);
      expect(details.additionalPermissions.fileSystem.read).toContain(user2Dir);
      expect(details.additionalPermissions.fileSystem.read).toContain(user3Dir);
    });

    it('should proactively suggest expansion for npm install in confirmation', async () => {
      const homeDir = path.join(tempRootDir, 'home');
      fs.mkdirSync(homeDir);
      mockHomedir.mockReturnValue(homeDir);

      const invocation = shellTool.build({ command: 'npm install' });
      const details = (await invocation.shouldConfirmExecute(
        new AbortController().signal,
        'ask_user',
      )) as ToolSandboxExpansionConfirmationDetails;

      expect(details.type).toBe('sandbox_expansion');
      expect(details.title).toContain('Recommended');
      expect(details.additionalPermissions.network).toBe(true);
    });

    it('should NOT proactively suggest expansion for npm test', async () => {
      const homeDir = path.join(tempRootDir, 'home');
      fs.mkdirSync(homeDir);
      mockHomedir.mockReturnValue(homeDir);

      const invocation = shellTool.build({ command: 'npm test' });
      const details = (await invocation.shouldConfirmExecute(
        new AbortController().signal,
        'ask_user',
      )) as ToolExecuteConfirmationDetails;

      // Should be regular exec confirmation, not expansion
      expect(details.type).toBe('exec');
    });
  });

  describe('getSchema', () => {
    it('should return the base schema when no modelId is provided', () => {
      const schema = shellTool.getSchema();
      expect(schema.name).toBe(SHELL_TOOL_NAME);
      expect(schema.description).toMatchSnapshot();
    });

    it('should return the schema from the resolver when modelId is provided', () => {
      const modelId = 'gemini-2.0-flash';
      const schema = shellTool.getSchema(modelId);
      expect(schema.name).toBe(SHELL_TOOL_NAME);
      expect(schema.description).toMatchSnapshot();
    });
  });

  describe('command injection detection', () => {
    it('should block $() command substitution', async () => {
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo $(whoami)' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).toContain('Blocked');
    });

    it('should block backtick command substitution', async () => {
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo `whoami`' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).toContain('Blocked');
    });

    it('should allow normal commands without substitution', async () => {
      mockShellExecutionService.mockImplementation((_cmd, _cwd, _callback) => ({
        pid: 12345,
        result: Promise.resolve({
          output: 'hello',
          rawOutput: Buffer.from('hello'),
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
          executionMethod: 'child_process',
          backgrounded: false,
        }),
      }));
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo hello' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).not.toContain('Blocked');
    });

    it('should allow single quoted strings with special chars', async () => {
      mockShellExecutionService.mockImplementation((_cmd, _cwd, _callback) => ({
        pid: 12345,
        result: Promise.resolve({
          output: '$(not substituted)',
          rawOutput: Buffer.from('$(not substituted)'),
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
          executionMethod: 'child_process',
          backgrounded: false,
        }),
      }));
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({
        command: "echo '$(not substituted)'",
      });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).not.toContain('Blocked');
    });

    it('should allow escaped backtick outside double quotes', async () => {
      mockShellExecutionService.mockImplementation((_cmd, _cwd, _callback) => ({
        pid: 12345,
        result: Promise.resolve({
          output: 'hello',
          rawOutput: Buffer.from('hello'),
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
          executionMethod: 'child_process',
          backgrounded: false,
        }),
      }));
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo \\`hello\\`' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).not.toContain('Blocked');
    });

    it('should block $() inside double quotes', async () => {
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo "$(whoami)"' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).toContain('Blocked');
    });

    it('should block >() process substitution', async () => {
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo >(whoami)' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).toContain('Blocked');
    });

    it('should allow $() inside single quotes', async () => {
      mockShellExecutionService.mockImplementation((_cmd, _cwd, _callback) => ({
        pid: 12345,
        result: Promise.resolve({
          output: '$(whoami)',
          rawOutput: Buffer.from('$(whoami)'),
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
          executionMethod: 'child_process',
          backgrounded: false,
        }),
      }));
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({
        command: "echo '$(whoami)'",
      });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).not.toContain('Blocked');
    });
    it('should block PowerShell @() array subexpression', async () => {
      mockPlatform.mockReturnValue('win32');
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo @(whoami)' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).toContain('Blocked');
    });

    it('should block PowerShell $() subexpression', async () => {
      mockPlatform.mockReturnValue('win32');
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo $(whoami)' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).toContain('Blocked');
    });

    it('should allow PowerShell single quoted strings', async () => {
      mockPlatform.mockReturnValue('win32');
      mockShellExecutionService.mockImplementation((_cmd, _cwd, _callback) => ({
        pid: 12345,
        result: Promise.resolve({
          output: '$(whoami)',
          rawOutput: Buffer.from('$(whoami)'),
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
          executionMethod: 'child_process',
          backgrounded: false,
        }),
      }));
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({
        command: "echo '$(whoami)'",
      });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).not.toContain('Blocked');
    });
    it('should allow escaped substitution outside quotes', async () => {
      mockShellExecutionService.mockImplementation((_cmd, _cwd, _callback) => ({
        pid: 12345,
        result: Promise.resolve({
          output: '$(whoami)',
          rawOutput: Buffer.from('$(whoami)'),
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
          executionMethod: 'child_process',
          backgrounded: false,
        }),
      }));
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo \\$(whoami)' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).not.toContain('Blocked');
    });

    it('should allow process substitution inside double quotes', async () => {
      mockShellExecutionService.mockImplementation((_cmd, _cwd, _callback) => ({
        pid: 12345,
        result: Promise.resolve({
          output: '<(whoami)',
          rawOutput: Buffer.from('<(whoami)'),
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
          executionMethod: 'child_process',
          backgrounded: false,
        }),
      }));
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo "<(whoami)"' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).not.toContain('Blocked');
    });

    it('should block process substitution without quotes', async () => {
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo <(whoami)' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).toContain('Blocked');
    });

    it('should allow escaped $() outside double quotes', async () => {
      mockShellExecutionService.mockImplementation((_cmd, _cwd, _callback) => ({
        pid: 12345,
        result: Promise.resolve({
          output: '$(whoami)',
          rawOutput: Buffer.from('$(whoami)'),
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
          executionMethod: 'child_process',
          backgrounded: false,
        }),
      }));
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo \\$(whoami)' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).not.toContain('Blocked');
    });

    it('should allow output process substitution inside double quotes', async () => {
      mockShellExecutionService.mockImplementation((_cmd, _cwd, _callback) => ({
        pid: 12345,
        result: Promise.resolve({
          output: '<(whoami)',
          rawOutput: Buffer.from('<(whoami)'),
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
          executionMethod: 'child_process',
          backgrounded: false,
        }),
      }));
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo "<(whoami)"' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).not.toContain('Blocked');
    });

    it('should block <() process substitution without quotes', async () => {
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo <(whoami)' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).toContain('Blocked');
    });
    it('should block PowerShell bare () grouping operator', async () => {
      mockPlatform.mockReturnValue('win32');
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo (whoami)' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).toContain('Blocked');
    });

    it('should allow escaped $() inside double quotes', async () => {
      mockShellExecutionService.mockImplementation((_cmd, _cwd, _callback) => ({
        pid: 12345,
        result: Promise.resolve({
          output: '$(whoami)',
          rawOutput: Buffer.from('$(whoami)'),
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
          executionMethod: 'child_process',
          backgrounded: false,
        }),
      }));
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo "\\$(whoami)"' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).not.toContain('Blocked');
    });

    it('should allow escaped substitution inside double quotes', async () => {
      mockShellExecutionService.mockImplementation((_cmd, _cwd, _callback) => ({
        pid: 12345,
        result: Promise.resolve({
          output: '$(whoami)',
          rawOutput: Buffer.from('$(whoami)'),
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
          executionMethod: 'child_process',
          backgrounded: false,
        }),
      }));
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({ command: 'echo "\\$(whoami)"' });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).not.toContain('Blocked');
    });

    it('should allow PowerShell keyword with flag e.g. switch -regex ($x)', async () => {
      mockPlatform.mockReturnValue('win32');
      mockShellExecutionService.mockImplementation((_cmd, _cwd, _callback) => ({
        pid: 12345,
        result: Promise.resolve({
          output: 'result',
          rawOutput: Buffer.from('result'),
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
          executionMethod: 'child_process',
          backgrounded: false,
        }),
      }));
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({
        command: 'switch -regex ($x) { "a" { 1 } }',
      });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).not.toContain('Blocked');
    });

    it('should allow PowerShell nested parentheses e.g. if ((condition))', async () => {
      mockPlatform.mockReturnValue('win32');
      mockShellExecutionService.mockImplementation((_cmd, _cwd, _callback) => ({
        pid: 12345,
        result: Promise.resolve({
          output: 'result',
          rawOutput: Buffer.from('result'),
          exitCode: 0,
          signal: null,
          error: null,
          aborted: false,
          pid: 12345,
          executionMethod: 'child_process',
          backgrounded: false,
        }),
      }));
      const tool = new ShellTool(mockConfig, createMockMessageBus());
      const invocation = tool.build({
        command: 'if ((condition)) { Write-Host ok }',
      });
      const result = await invocation.execute({
        abortSignal: new AbortController().signal,
      });
      expect(result.returnDisplay).not.toContain('Blocked');
    });
  });
});
