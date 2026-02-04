/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubagentTool } from './subagent-tool.js';
import { SubagentToolWrapper } from './subagent-tool-wrapper.js';
import type {
  LocalAgentDefinition,
  RemoteAgentDefinition,
  AgentInputs,
} from './types.js';
import { makeFakeConfig } from '../test-utils/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type {
  ToolCallConfirmationDetails,
  ToolInvocation,
  ToolResult,
} from '../tools/tools.js';

vi.mock('./subagent-tool-wrapper.js');

const MockSubagentToolWrapper = vi.mocked(SubagentToolWrapper);

const testDefinition: LocalAgentDefinition = {
  kind: 'local',
  name: 'LocalAgent',
  description: 'A local agent.',
  inputConfig: { inputSchema: { type: 'object', properties: {} } },
  modelConfig: { model: 'test', generateContentConfig: {} },
  runConfig: { maxTimeMinutes: 1 },
  promptConfig: { systemPrompt: 'test' },
};

const testRemoteDefinition: RemoteAgentDefinition = {
  kind: 'remote',
  name: 'RemoteAgent',
  description: 'A remote agent.',
  inputConfig: {
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  },
  agentCardUrl: 'http://example.com/agent',
};

describe('SubAgentInvocation', () => {
  let mockConfig: Config;
  let mockMessageBus: MessageBus;
  let mockInnerInvocation: ToolInvocation<AgentInputs, ToolResult>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = makeFakeConfig();
    mockMessageBus = createMockMessageBus();
    mockInnerInvocation = {
      shouldConfirmExecute: vi.fn(),
      execute: vi.fn(),
      params: {},
      getDescription: vi.fn(),
      toolLocations: vi.fn(),
    };

    MockSubagentToolWrapper.prototype.build = vi
      .fn()
      .mockReturnValue(mockInnerInvocation);
  });

  it('should delegate shouldConfirmExecute to the inner sub-invocation (local)', async () => {
    const tool = new SubagentTool(testDefinition, mockConfig, mockMessageBus);
    const params = {};
    // @ts-expect-error - accessing protected method for testing
    const invocation = tool.createInvocation(params, mockMessageBus);

    vi.mocked(mockInnerInvocation.shouldConfirmExecute).mockResolvedValue(
      false,
    );

    const abortSignal = new AbortController().signal;
    const result = await invocation.shouldConfirmExecute(abortSignal);

    expect(result).toBe(false);
    expect(mockInnerInvocation.shouldConfirmExecute).toHaveBeenCalledWith(
      abortSignal,
    );
    expect(MockSubagentToolWrapper).toHaveBeenCalledWith(
      testDefinition,
      mockConfig,
      mockMessageBus,
    );
  });

  it('should delegate shouldConfirmExecute to the inner sub-invocation (remote)', async () => {
    const tool = new SubagentTool(
      testRemoteDefinition,
      mockConfig,
      mockMessageBus,
    );
    const params = { query: 'test' };
    // @ts-expect-error - accessing protected method for testing
    const invocation = tool.createInvocation(params, mockMessageBus);

    const confirmationDetails = {
      type: 'info',
      title: 'Confirm',
      prompt: 'Prompt',
      onConfirm: vi.fn(),
    } as const;
    vi.mocked(mockInnerInvocation.shouldConfirmExecute).mockResolvedValue(
      confirmationDetails as unknown as ToolCallConfirmationDetails,
    );

    const abortSignal = new AbortController().signal;
    const result = await invocation.shouldConfirmExecute(abortSignal);

    expect(result).toBe(confirmationDetails);
    expect(mockInnerInvocation.shouldConfirmExecute).toHaveBeenCalledWith(
      abortSignal,
    );
    expect(MockSubagentToolWrapper).toHaveBeenCalledWith(
      testRemoteDefinition,
      mockConfig,
      mockMessageBus,
    );
  });

  it('should delegate execute to the inner sub-invocation', async () => {
    const tool = new SubagentTool(testDefinition, mockConfig, mockMessageBus);
    const params = {};
    // @ts-expect-error - accessing protected method for testing
    const invocation = tool.createInvocation(params, mockMessageBus);

    const mockResult: ToolResult = {
      llmContent: 'success',
      returnDisplay: 'success',
    };
    vi.mocked(mockInnerInvocation.execute).mockResolvedValue(mockResult);

    const abortSignal = new AbortController().signal;
    const updateOutput = vi.fn();
    const result = await invocation.execute(abortSignal, updateOutput);

    expect(result).toBe(mockResult);
    expect(mockInnerInvocation.execute).toHaveBeenCalledWith(
      abortSignal,
      updateOutput,
    );
  });
});
