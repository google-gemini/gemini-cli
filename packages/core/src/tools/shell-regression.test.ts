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

const mockShellExecutionService = vi.hoisted(() => vi.fn());

vi.mock('../services/shellExecutionService.js', () => ({
  ShellExecutionService: {
    execute: mockShellExecutionService,
    background: vi.fn(),
  },
}));

import {
  type ShellExecutionResult,
  type ShellOutputEvent,
} from '../services/shellExecutionService.js';

describe('ShellTool Regression - Output Truncation Threshold', () => {
  beforeAll(async () => {
    await initializeShellParsers();
  });

  let shellTool: ShellTool;
  let mockConfig: Config;
  let tempRootDir: string;
  let mockShellOutputCallback: (event: ShellOutputEvent) => void;
  let resolveExecutionPromise: (result: ShellExecutionResult) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    tempRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-reg-test-'));

    mockConfig = {
      getTargetDir: vi.fn().mockReturnValue(tempRootDir),
      getWorkspaceContext: vi
        .fn()
        .mockReturnValue(new WorkspaceContext(tempRootDir)),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
      },
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

  it('should NOT return fullOutputFilePath for small output (less than 40KB)', async () => {
    const invocation = shellTool.build({ command: 'echo hello' });
    const promise = invocation.execute(new AbortController().signal);

    // Send small output
    mockShellOutputCallback({ type: 'raw_data', chunk: 'hello world' });

    resolveExecutionPromise({
      output: 'hello world',
      rawOutput: Buffer.from('hello world'),
      exitCode: 0,
      signal: null,
      error: null,
      aborted: false,
      pid: 12345,
      executionMethod: 'child_process',
    });

    const result = await promise;
    // We need to wait a bit for the stream to flush in the background if we were using real FS,
    // but here we are using the real FS (via tempRootDir).
    // The ShellTool doesn't wait for 'finish' event before returning toolResult.

    expect(result.fullOutputFilePath).toBeUndefined();
  });

  it('should return fullOutputFilePath for large output (at least 40KB)', async () => {
    const invocation = shellTool.build({ command: 'large-output' });
    const promise = invocation.execute(new AbortController().signal);

    // Send large output (exactly 40KB)
    const threshold = DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD;
    const largeChunk = 'A'.repeat(threshold);
    mockShellOutputCallback({ type: 'raw_data', chunk: largeChunk });

    resolveExecutionPromise({
      output: 'large output',
      rawOutput: Buffer.from(largeChunk),
      exitCode: 0,
      signal: null,
      error: null,
      aborted: false,
      pid: 12345,
      executionMethod: 'child_process',
    });

    const result = await promise;

    expect(result.fullOutputFilePath).toBeDefined();
    expect(fs.existsSync(result.fullOutputFilePath!)).toBe(true);

    // Cleanup
    if (result.fullOutputFilePath) {
      fs.unlinkSync(result.fullOutputFilePath);
    }
  });

  it('should return fullOutputFilePath and keep full content when 1 char above threshold', async () => {
    const invocation = shellTool.build({ command: 'boundary-plus-one' });
    const promise = invocation.execute(new AbortController().signal);

    // 40KB + 1 byte
    const thresholdPlusOne = DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD + 1;
    const largeChunk = 'B'.repeat(thresholdPlusOne);
    mockShellOutputCallback({ type: 'raw_data', chunk: largeChunk });

    resolveExecutionPromise({
      output: largeChunk, // Verify this is still passed through to llmContent
      rawOutput: Buffer.from(largeChunk),
      exitCode: 0,
      signal: null,
      error: null,
      aborted: false,
      pid: 12345,
      executionMethod: 'node-pty',
    });

    const result = await promise;

    expect(result.fullOutputFilePath).toBeDefined();
    expect(result.llmContent).toContain(largeChunk);

    // Cleanup
    if (result.fullOutputFilePath) {
      fs.unlinkSync(result.fullOutputFilePath);
    }
  });
});
