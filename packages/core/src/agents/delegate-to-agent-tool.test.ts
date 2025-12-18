/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DelegateToAgentTool } from './delegate-to-agent-tool.js';
import { AgentRegistry } from './registry.js';
import type { Config } from '../config/config.js';
import type { AgentDefinition } from './types.js';
import { LocalSubagentInvocation } from './local-invocation.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import { DELEGATE_TO_AGENT_TOOL_NAME } from '../tools/tool-names.js';

vi.mock('./local-invocation.js', () => ({
  LocalSubagentInvocation: vi.fn().mockImplementation(() => ({
    execute: vi
      .fn()
      .mockResolvedValue({ content: [{ type: 'text', text: 'Success' }] }),
  })),
}));

describe('DelegateToAgentTool', () => {
  let registry: AgentRegistry;
  let config: Config;
  let tool: DelegateToAgentTool;
  let messageBus: MessageBus;

  const mockAgentDef: AgentDefinition = {
    kind: 'local',
    name: 'test_agent',
    description: 'A test agent',
    promptConfig: {},
    modelConfig: { model: 'test-model', temp: 0, top_p: 0 },
    inputConfig: {
      inputs: {
        arg1: { type: 'string', description: 'Argument 1', required: true },
        arg2: { type: 'number', description: 'Argument 2', required: false },
      },
    },
    runConfig: { max_turns: 1, max_time_minutes: 1 },
    toolConfig: { tools: [] },
  };

  beforeEach(() => {
    config = {
      getDebugMode: () => false,
      modelConfigService: {
        registerRuntimeModelConfig: vi.fn(),
      },
    } as unknown as Config;

    registry = new AgentRegistry(config);
    // Manually register the mock agent (bypassing protected method for testing)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (registry as any).agents.set(mockAgentDef.name, mockAgentDef);

    messageBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;

    tool = new DelegateToAgentTool(registry, config, messageBus);
  });

  it('should use dynamic description from registry', () => {
    // registry has mockAgentDef registered in beforeEach
    expect(tool.description).toContain(
      'Delegates a task to a specialized sub-agent',
    );
    expect(tool.description).toContain(
      `- **${mockAgentDef.name}**: ${mockAgentDef.description}`,
    );
  });

  it('should validate agent_name exists in registry', async () => {
    // Zod validation happens at build time now (or rather, build validates the schema)
    // Since we use discriminated union, an invalid agent_name won't match any option.
    expect(() =>
      tool.build({
        agent_name: 'non_existent_agent',
      }),
    ).toThrow();
  });

  it('should validate correct arguments', async () => {
    const invocation = tool.build({
      agent_name: 'test_agent',
      arg1: 'valid',
    });

    const result = await invocation.execute(new AbortController().signal);
    expect(result).toEqual({ content: [{ type: 'text', text: 'Success' }] });
    expect(LocalSubagentInvocation).toHaveBeenCalledWith(
      mockAgentDef,
      config,
      { arg1: 'valid' },
      messageBus,
    );
  });

  it('should throw error for missing required argument', async () => {
    // Missing arg1 should fail Zod validation
    expect(() =>
      tool.build({
        agent_name: 'test_agent',
        arg2: 123,
      }),
    ).toThrow();
  });

  it('should throw error for invalid argument type', async () => {
    // arg1 should be string, passing number
    expect(() =>
      tool.build({
        agent_name: 'test_agent',
        arg1: 123,
      }),
    ).toThrow();
  });

  it('should allow optional arguments to be omitted', async () => {
    const invocation = tool.build({
      agent_name: 'test_agent',
      arg1: 'valid',
      // arg2 is optional
    });

    await expect(
      invocation.execute(new AbortController().signal),
    ).resolves.toBeDefined();
  });

  it('should throw error if an agent has an input named "agent_name"', () => {
    const invalidAgentDef: AgentDefinition = {
      ...mockAgentDef,
      name: 'invalid_agent',
      inputConfig: {
        inputs: {
          agent_name: {
            type: 'string',
            description: 'Conflict',
            required: true,
          },
        },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (registry as any).agents.set(invalidAgentDef.name, invalidAgentDef);

    expect(() => new DelegateToAgentTool(registry, config)).toThrow(
      "Agent 'invalid_agent' cannot have an input parameter named 'agent_name' as it is a reserved parameter for delegation.",
    );
  });

  it('should use correct tool name "delegate_to_agent" when requesting confirmation', async () => {
    const invocation = tool.build({
      agent_name: 'test_agent',
      arg1: 'valid',
    });

    // Trigger confirmation check
    const p = invocation.shouldConfirmExecute(new AbortController().signal);
    void p;

    expect(messageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.TOOL_CONFIRMATION_REQUEST,
        toolCall: expect.objectContaining({
          name: DELEGATE_TO_AGENT_TOOL_NAME,
        }),
      }),
    );
  });
});
