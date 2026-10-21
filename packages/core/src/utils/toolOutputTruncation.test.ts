/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CallableTool } from '@google/genai';
import { truncateToolOutputIfNeeded } from './toolOutputTruncation.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import { SHELL_TOOL_NAME } from '../tools/tool-names.js';
import { MAX_STORED_TOOL_OUTPUT_BYTES } from './constants.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import type { Config } from '../config/config.js';
import * as fileUtils from './fileUtils.js';
import { logToolOutputTruncated } from '../telemetry/loggers.js';

vi.mock('./fileUtils.js', () => ({
  saveTruncatedToolOutput: vi.fn(),
  formatTruncatedToolOutput: vi.fn(),
}));

vi.mock('../telemetry/loggers.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    logToolOutputTruncated: vi.fn(),
  };
});

describe('truncateToolOutputIfNeeded', () => {
  let config: Config;
  let context: AgentLoopContext;

  beforeEach(() => {
    config = makeFakeConfig();
    context = {
      config,
      promptId: 'prompt-1',
      geminiClient: {},
    } as unknown as AgentLoopContext;

    vi.mocked(fileUtils.saveTruncatedToolOutput).mockResolvedValue({
      outputFile: '/tmp/truncated_output.txt',
    });
    vi.mocked(fileUtils.formatTruncatedToolOutput).mockReturnValue(
      'TruncatedContent...',
    );
    vi.spyOn(config, 'isContextManagementEnabled').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('truncates shell output over the configured threshold and saves the full output', async () => {
    vi.spyOn(config, 'getTruncateToolOutputThreshold').mockReturnValue(10);
    vi.spyOn(config.storage, 'getProjectTempDir').mockReturnValue('/tmp');
    const output = 'This is a very long shell output that should be truncated.';

    const result = await truncateToolOutputIfNeeded({
      context,
      toolName: SHELL_TOOL_NAME,
      callId: 'call-1',
      content: output,
    });

    expect(fileUtils.saveTruncatedToolOutput).toHaveBeenCalledWith(
      output,
      SHELL_TOOL_NAME,
      'call-1',
      '/tmp',
      'prompt-1',
    );
    expect(fileUtils.formatTruncatedToolOutput).toHaveBeenCalledWith(
      output,
      '/tmp/truncated_output.txt',
      10,
    );
    expect(logToolOutputTruncated).toHaveBeenCalled();
    expect(result).toEqual({
      truncatedContent: 'TruncatedContent...',
      outputFile: '/tmp/truncated_output.txt',
    });
  });

  it('leaves shell output at or under the threshold untouched', async () => {
    vi.spyOn(config, 'getTruncateToolOutputThreshold').mockReturnValue(100);

    const result = await truncateToolOutputIfNeeded({
      context,
      toolName: SHELL_TOOL_NAME,
      callId: 'call-2',
      content: 'short output',
    });

    expect(fileUtils.saveTruncatedToolOutput).not.toHaveBeenCalled();
    expect(result).toEqual({
      truncatedContent: 'short output',
      outputFile: undefined,
    });
  });

  it('truncates a single text part from an MCP tool and keeps the part shape', async () => {
    vi.spyOn(config, 'getTruncateToolOutputThreshold').mockReturnValue(10);
    vi.spyOn(config.storage, 'getProjectTempDir').mockReturnValue('/tmp');
    const mcpTool = new DiscoveredMCPTool(
      {} as CallableTool,
      'my-server',
      'get_big_text',
      'A test MCP tool',
      {},
      createMockMessageBus(),
    );
    const output = 'This is a very long MCP output that should be truncated.';

    const result = await truncateToolOutputIfNeeded({
      context,
      toolName: 'get_big_text',
      callId: 'call-3',
      tool: mcpTool,
      content: [{ text: output }],
    });

    expect(fileUtils.saveTruncatedToolOutput).toHaveBeenCalledWith(
      output,
      'get_big_text',
      'call-3',
      '/tmp',
      'prompt-1',
    );
    expect(result).toEqual({
      truncatedContent: [{ text: 'TruncatedContent...' }],
      outputFile: '/tmp/truncated_output.txt',
    });
  });

  it('caps other tool output at the stored-output byte limit', async () => {
    vi.spyOn(config, 'getTruncateToolOutputThreshold').mockReturnValue(0);
    vi.spyOn(config.storage, 'getProjectTempDir').mockReturnValue('/tmp');
    const output = 'x'.repeat(MAX_STORED_TOOL_OUTPUT_BYTES + 100);

    const result = await truncateToolOutputIfNeeded({
      context,
      toolName: 'read_file',
      callId: 'call-4',
      content: output,
    });

    const truncated = result.truncatedContent as string;
    expect(truncated.length).toBeLessThan(output.length);
    expect(truncated).toContain(
      'For full output see: /tmp/truncated_output.txt',
    );
    expect(result.outputFile).toBe('/tmp/truncated_output.txt');
  });

  it('leaves small tool output untouched', async () => {
    vi.spyOn(config, 'getTruncateToolOutputThreshold').mockReturnValue(0);

    const result = await truncateToolOutputIfNeeded({
      context,
      toolName: 'read_file',
      callId: 'call-5',
      content: [{ text: 'small output' }],
    });

    expect(fileUtils.saveTruncatedToolOutput).not.toHaveBeenCalled();
    expect(result).toEqual({
      truncatedContent: [{ text: 'small output' }],
      outputFile: undefined,
    });
  });
});
