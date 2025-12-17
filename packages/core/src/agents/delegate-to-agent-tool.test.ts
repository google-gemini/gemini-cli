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
import { SubagentInvocation } from './invocation.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import { DELEGATE_TO_AGENT_TOOL_NAME } from '../tools/tool-names.js';

vi.mock('./invocation.js', () => ({
  SubagentInvocation: vi.fn().mockImplementation(() => ({
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
      agents: {},
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
    expect(SubagentInvocation).toHaveBeenCalledWith(
      { arg1: 'valid' },
      mockAgentDef,
      config,
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

  it('should skip agent and warn if an agent has an input named "agent_name"', () => {
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

    // Should not throw
    const newTool = new DelegateToAgentTool(registry, config, messageBus);

    expect(newTool).toBeDefined();
    // Access the parameters schema which defines valid inputs
    const paramSchema = newTool.schema.parametersJsonSchema;
    expect(paramSchema).toBeDefined();

    const schemaString = JSON.stringify(paramSchema);
    // invalid_agent should be skipped and thus not in the parameters schema
    expect(schemaString).not.toContain('invalid_agent');
    // test_agent should be present
    expect(schemaString).toContain('test_agent');
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

  it('should generate a "oneOf" schema when multiple agents are enabled', () => {
    const secondAgent: AgentDefinition = {
      ...mockAgentDef,
      name: 'second_agent',
      description: 'A second test agent',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (registry as any).agents.set(secondAgent.name, secondAgent);

    const multiAgentTool = new DelegateToAgentTool(
      registry,
      config,
      messageBus,
    );
    const paramSchema = multiAgentTool.schema.parametersJsonSchema;

    // With 2+ agents, we expect a 'oneOf' structure or at least both agents to be valid
    const schemaString = JSON.stringify(paramSchema);
    expect(schemaString).toContain('test_agent');
    expect(schemaString).toContain('second_agent');

    // Ideally check structure if implementation uses oneOf
    // Based on implementation: if (agentSchemas.length === 1) ... else { oneOf: ... }
    if (
      typeof paramSchema === 'object' &&
      paramSchema !== null &&
      'oneOf' in paramSchema
    ) {
      expect(paramSchema.oneOf).toHaveLength(2);
    } else {
      // Just in case implementation changes, at least assert both are present
      expect(schemaString).toContain('test_agent');
      expect(schemaString).toContain('second_agent');
    }
  });

  /*
   * Testing strategy for disabled agents exclusion
   *
   * partition on agent enabled status:
   *    all agents enabled (baseline - covered by other tests)
   *    single agent disabled
   *    all agents disabled
   *
   * partition on number of agents:
   *    single agent (disabled)
   *    multiple agents (one disabled, one enabled)
   */
  describe('disabled agents exclusion from schema', () => {
    it('should exclude disabled agents from the tool schema', () => {
      const disabledAgentDef: AgentDefinition = {
        ...mockAgentDef,
        name: 'disabled_agent',
        description: 'A disabled agent',
      };

      // Register second agent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (registry as any).agents.set(disabledAgentDef.name, disabledAgentDef);

      // Configure disabled_agent as disabled via config
      const configWithDisabled = {
        ...config,
        agents: {
          disabled_agent: { enabled: false },
        },
      } as unknown as Config;

      // Create new registry with the config that disables the agent
      const registryWithDisabled = new AgentRegistry(configWithDisabled);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (registryWithDisabled as any).agents.set(mockAgentDef.name, mockAgentDef);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (registryWithDisabled as any).agents.set(
        disabledAgentDef.name,
        disabledAgentDef,
      );

      const toolWithDisabled = new DelegateToAgentTool(
        registryWithDisabled,
        configWithDisabled,
      );

      const paramSchema = toolWithDisabled.schema.parametersJsonSchema;
      const schemaString = JSON.stringify(paramSchema);

      // disabled_agent should NOT appear in schema
      expect(schemaString).not.toContain('disabled_agent');
      // test_agent should still be present
      expect(schemaString).toContain('test_agent');
    });

    it('should show fallback schema when all agents are disabled', () => {
      // Configure the only agent as disabled
      const configAllDisabled = {
        ...config,
        agents: {
          test_agent: { enabled: false },
        },
      } as unknown as Config;

      const registryAllDisabled = new AgentRegistry(configAllDisabled);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (registryAllDisabled as any).agents.set(mockAgentDef.name, mockAgentDef);

      const toolAllDisabled = new DelegateToAgentTool(
        registryAllDisabled,
        configAllDisabled,
      );

      const paramSchema = toolAllDisabled.schema.parametersJsonSchema;
      const schemaString = JSON.stringify(paramSchema);

      // Should not contain the disabled agent
      expect(schemaString).not.toContain('test_agent');
      // Should contain fallback message
      expect(schemaString).toContain('No agents are currently available');
    });

    it('should throw error when invoking a disabled agent at runtime', async () => {
      // Agent is in registry but disabled via config
      const configWithDisabled = {
        ...config,
        agents: {
          test_agent: { enabled: false },
        },
      } as unknown as Config;

      // Create registry where agent exists but is disabled
      const registryWithDisabled = new AgentRegistry(configWithDisabled);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (registryWithDisabled as any).agents.set(mockAgentDef.name, mockAgentDef);

      // The tool won't include test_agent in schema, but if somehow invoked...
      // We test the runtime check in DelegateInvocation.execute
      const toolWithDisabled = new DelegateToAgentTool(
        registryWithDisabled,
        configWithDisabled,
      );

      // Force building with the disabled agent (bypassing schema validation)
      // This simulates what happens if an agent becomes disabled after tool creation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invocation = (toolWithDisabled as any).createInvocation({
        agent_name: 'test_agent',
        arg1: 'test',
      });

      await expect(
        invocation.execute(new AbortController().signal),
      ).rejects.toThrow('is not available or has been disabled');
    });
  });
});
