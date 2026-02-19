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
} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ShellTool } from './shell.js';
import { type Config } from '../config/config.js';
import { DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD } from '../utils/constants.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { initializeShellParsers } from '../utils/shell-utils.js';
import { ToolExecutor } from '../scheduler/tool-executor.js';
import { type ToolCall } from '../scheduler/types.js';
import { CoreToolCallStatus } from '../index.js';

import { type ShellOutputEvent } from '../services/shellExecutionService.js';

const mockShellExecutionService = vi.hoisted(() => vi.fn());

vi.mock('../services/shellExecutionService.js', () => ({
  ShellExecutionService: {
    execute: mockShellExecutionService,
    background: vi.fn(),
  },
}));

vi.mock('../core/coreToolHookTriggers.js', () => ({
  executeToolWithHooks: vi.fn(),
}));

import { executeToolWithHooks } from '../core/coreToolHookTriggers.js';

describe('ShellTool + ToolExecutor Truncation Regression', () => {
  beforeAll(async () => {
    await initializeShellParsers();
  });

  let shellTool: ShellTool;
  let mockConfig: Config;
  let tempRootDir: string;
  let mockShellOutputCallback: (event: ShellOutputEvent) => void;
  let resolveExecutionPromise: (result: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    tempRootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'shell-executor-reg-test-'),
    );

    mockConfig = {
      getTargetDir: vi.fn().mockReturnValue(tempRootDir),
      getWorkspaceContext: vi
        .fn()
        .mockReturnValue(new WorkspaceContext(tempRootDir)),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue(tempRootDir),
      },
      getSessionId: vi.fn().mockReturnValue('test-session'),
      isPathAllowed: vi.fn().mockReturnValue(true),
      validatePathAccess: vi.fn().mockReturnValue(null),
      getShellToolInactivityTimeout: vi.fn().mockReturnValue(1000),
      getEnableInteractiveShell: vi.fn().mockReturnValue(false),
      getEnableShellOutputEfficiency: vi.fn().mockReturnValue(true),
      getSummarizeToolOutputConfig: vi.fn().mockReturnValue(undefined),
      getDebugMode: vi.fn().mockReturnValue(false),
      getTruncateToolOutputThreshold: vi
        .fn()
        .mockReturnValue(DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD),
      getActiveModel: vi.fn().mockReturnValue('gemini-1.5-pro'),
      getShellExecutionConfig: vi.fn().mockReturnValue({}),
      getUsageStatisticsEnabled: vi.fn().mockReturnValue(false),
      sanitizationConfig: {},
    } as unknown as Config;

    shellTool = new ShellTool(mockConfig, createMockMessageBus());

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
  });

  it('should verify when full content stops being available to LLM', async () => {
    const threshold = DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD;
    const oversizedContent = 'A'.repeat(threshold + 1);

    const invocation = shellTool.build({ command: 'oversized' });
    const executePromise = invocation.execute(new AbortController().signal);

    mockShellOutputCallback({ type: 'raw_data', chunk: oversizedContent });

    resolveExecutionPromise({
      output: oversizedContent,
      rawOutput: Buffer.from(oversizedContent),
      exitCode: 0,
      signal: null,
      error: null,
      aborted: false,
      pid: 12345,
      executionMethod: 'child_process',
    });

    const toolResult = await executePromise;

    // Now simulate ToolExecutor processing this result
    const toolExecutor = new ToolExecutor(mockConfig);
    const mockToolCall: ToolCall = {
      status: CoreToolCallStatus.Executing,
      request: {
        callId: 'call-1',
        name: 'run_shell_command',
        args: { command: 'oversized' },
        prompt_id: 'prompt-1',
        isClientInitiated: true,
      },
      tool: shellTool,
      invocation,
      startTime: Date.now(),
    };

    vi.mocked(executeToolWithHooks).mockResolvedValue(toolResult);

    const finalResult = await toolExecutor.execute({
      call: mockToolCall,
      signal: new AbortController().signal,
      onUpdateToolCall: vi.fn(),
    });

    if (finalResult.status !== CoreToolCallStatus.Success) {
      let errorMsg = `Tool execution failed with status ${finalResult.status}`;
      if ('response' in finalResult && finalResult.response.error) {
        errorMsg += `: ${finalResult.response.error.message}`;
      }
      expect.fail(errorMsg);
    }

    if (finalResult.status === CoreToolCallStatus.Success) {
      const response = finalResult.response.responseParts[0];
      if (
        response &&
        'functionResponse' in response &&
        response.functionResponse
      ) {
        const content = (
          response.functionResponse.response as Record<string, unknown>
        )['output'];
        expect(content).not.toBe(oversizedContent);
        expect(content).toContain('Output too large');
        expect(finalResult.response.outputFile).toBeDefined();
      } else {
        expect.fail('Response part is not a functionResponse');
      }
    } else {
      throw new Error('Tool execution failed');
    }
  });
});
