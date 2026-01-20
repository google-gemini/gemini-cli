/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubagentToolWrapper } from './subagent-tool-wrapper.js';
import { LocalSubagentInvocation } from './local-invocation.js';
import { convertInputConfigToJsonSchema } from './schema-utils.js';
import { makeFakeConfig } from '../test-utils/config.js';
import type { LocalAgentDefinition, AgentInputs } from './types.js';
import type { Config } from '../config/config.js';
import { Kind } from '../tools/tools.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

// Mock dependencies to isolate the SubagentToolWrapper class
vi.mock('./local-invocation.js');
vi.mock('./schema-utils.js');

const MockedLocalSubagentInvocation = vi.mocked(LocalSubagentInvocation);
const mockConvertInputConfigToJsonSchema = vi.mocked(
  convertInputConfigToJsonSchema,
);

// Define reusable test data
let mockConfig: Config;
let mockMessageBus: MessageBus;

const mockDefinition: LocalAgentDefinition = {
  kind: 'local',
  name: 'TestAgent',
  displayName: 'Test Agent Display Name',
  description: 'An agent for testing.',
  inputConfig: {
    inputs: {
      goal: { type: 'string', required: true, description: 'The goal.' },
      priority: {
        type: 'number',
        required: false,
        description: 'The priority.',
      },
    },
  },
  modelConfig: {
    model: 'gemini-test-model',
    generateContentConfig: {
      temperature: 0,
      topP: 1,
    },
  },
  runConfig: { maxTimeMinutes: 5 },
  promptConfig: { systemPrompt: 'You are a test agent.' },
};

const mockSchema = {
  type: 'object',
  properties: {
    goal: { type: 'string', description: 'The goal.' },
    priority: { type: 'number', description: 'The priority.' },
  },
  required: ['goal'],
};

describe('SubagentToolWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = makeFakeConfig();
    mockMessageBus = createMockMessageBus();
    // Provide a mock implementation for the schema conversion utility
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockConvertInputConfigToJsonSchema.mockReturnValue(mockSchema as any);
  });

  describe('constructor', () => {
    it('should call convertInputConfigToJsonSchema with the correct agent inputConfig', () => {
      new SubagentToolWrapper(mockDefinition, mockConfig, mockMessageBus);

      expect(convertInputConfigToJsonSchema).toHaveBeenCalledExactlyOnceWith(
        mockDefinition.inputConfig,
      );
    });

    it('should correctly configure the tool properties from the agent definition', () => {
      const wrapper = new SubagentToolWrapper(
        mockDefinition,
        mockConfig,
        mockMessageBus,
      );

      expect(wrapper.name).toBe(mockDefinition.name);
      expect(wrapper.displayName).toBe(mockDefinition.displayName);
      expect(wrapper.description).toBe(mockDefinition.description);
      expect(wrapper.kind).toBe(Kind.Think);
      expect(wrapper.isOutputMarkdown).toBe(true);
      expect(wrapper.canUpdateOutput).toBe(true);
    });

    it('should fall back to the agent name for displayName if it is not provided', () => {
      const definitionWithoutDisplayName = {
        ...mockDefinition,
        displayName: undefined,
      };
      const wrapper = new SubagentToolWrapper(
        definitionWithoutDisplayName,
        mockConfig,
        mockMessageBus,
      );
      expect(wrapper.displayName).toBe(definitionWithoutDisplayName.name);
    });

    it('should generate a valid tool schema using the definition and converted schema', () => {
      const wrapper = new SubagentToolWrapper(
        mockDefinition,
        mockConfig,
        mockMessageBus,
      );
      const schema = wrapper.schema;

      expect(schema.name).toBe(mockDefinition.name);
      expect(schema.description).toBe(mockDefinition.description);
      expect(schema.parametersJsonSchema).toEqual(mockSchema);
    });
  });

  describe('createInvocation', () => {
    it('should create a LocalSubagentInvocation with the correct parameters', () => {
      const wrapper = new SubagentToolWrapper(
        mockDefinition,
        mockConfig,
        mockMessageBus,
      );
      const params: AgentInputs = { goal: 'Test the invocation', priority: 1 };

      // The public `build` method calls the protected `createInvocation` after validation
      const invocation = wrapper.build(params);

      expect(invocation).toBeInstanceOf(LocalSubagentInvocation);
      expect(MockedLocalSubagentInvocation).toHaveBeenCalledExactlyOnceWith(
        mockDefinition,
        mockConfig,
        params,
        mockMessageBus,
        mockDefinition.name,
        mockDefinition.displayName,
      );
    });

    it('should pass the messageBus to the LocalSubagentInvocation constructor', () => {
      const specificMessageBus = {
        publish: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      } as unknown as MessageBus;
      const wrapper = new SubagentToolWrapper(
        mockDefinition,
        mockConfig,
        specificMessageBus,
      );
      const params: AgentInputs = { goal: 'Test the invocation', priority: 1 };

      wrapper.build(params);

      expect(MockedLocalSubagentInvocation).toHaveBeenCalledWith(
        mockDefinition,
        mockConfig,
        params,
        specificMessageBus,
        mockDefinition.name,
        mockDefinition.displayName,
      );
    });

    it('should throw a validation error for invalid parameters before creating an invocation', () => {
      const wrapper = new SubagentToolWrapper(
        mockDefinition,
        mockConfig,
        mockMessageBus,
      );
      // Missing the required 'goal' parameter
      const invalidParams = { priority: 1 };

      // The `build` method in the base class performs JSON schema validation
      // before calling the protected `createInvocation` method.
      expect(() => wrapper.build(invalidParams)).toThrow(
        "params must have required property 'goal'",
      );
      expect(MockedLocalSubagentInvocation).not.toHaveBeenCalled();
    });
  });
});
