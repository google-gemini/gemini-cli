/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRegistry } from './registry.js';
import { makeFakeConfig } from '../test-utils/config.js';
import type { AgentDefinition } from './types.js';
import type { Config } from '../config/config.js';

// A test-only subclass to expose the protected `registerAgent` method.
class TestableAgentRegistry extends AgentRegistry {
  testRegisterAgent(definition: AgentDefinition): void {
    this.registerAgent(definition);
  }
}

// Define mock agent structures for testing registration logic
const MOCK_AGENT_V1: AgentDefinition = {
  name: 'MockAgent',
  description: 'Mock Description V1',
  inputConfig: { inputs: {} },
  modelConfig: { model: 'test', temp: 0, top_p: 1 },
  runConfig: { max_time_minutes: 1 },
  promptConfig: { systemPrompt: 'test' },
};

const MOCK_AGENT_V2: AgentDefinition = {
  ...MOCK_AGENT_V1,
  description: 'Mock Description V2 (Updated)',
};

describe('AgentRegistry', () => {
  let mockConfig: Config;
  let registry: TestableAgentRegistry;

  beforeEach(() => {
    // Default configuration (debugMode: false)
    mockConfig = makeFakeConfig();
    registry = new TestableAgentRegistry(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Restore spies after each test
  });

  describe('initialize', () => {
    // TODO: Add this test once we actually have a built-in agent configured.
    // it('should load built-in agents upon initialization', async () => {
    //   expect(registry.getAllDefinitions()).toHaveLength(0);

    //   await registry.initialize();

    //   // There are currently no built-in agents.
    //   expect(registry.getAllDefinitions()).toEqual([]);
    // });

    it('should log the count of loaded agents in debug mode', async () => {
      const debugConfig = makeFakeConfig({ debugMode: true });
      const debugRegistry = new TestableAgentRegistry(debugConfig);
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      await debugRegistry.initialize();

      const agentCount = debugRegistry.getAllDefinitions().length;
      expect(consoleLogSpy).toHaveBeenCalledWith(
        `[AgentRegistry] Initialized with ${agentCount} agents.`,
      );
    });
  });

  describe('registration logic', () => {
    it('should register a valid agent definition', () => {
      registry.testRegisterAgent(MOCK_AGENT_V1);
      expect(registry.getDefinition('MockAgent')).toEqual(MOCK_AGENT_V1);
    });

    it('should handle special characters in agent names', () => {
      const specialAgent = {
        ...MOCK_AGENT_V1,
        name: 'Agent-123_$pecial.v2',
      };
      registry.testRegisterAgent(specialAgent);
      expect(registry.getDefinition('Agent-123_$pecial.v2')).toEqual(
        specialAgent,
      );
    });

    it('should reject an agent definition missing a name', () => {
      const invalidAgent = { ...MOCK_AGENT_V1, name: '' };
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      registry.testRegisterAgent(invalidAgent);

      expect(registry.getDefinition('MockAgent')).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[AgentRegistry] Skipping invalid agent definition. Missing name or description.',
      );
    });

    it('should reject an agent definition missing a description', () => {
      const invalidAgent = { ...MOCK_AGENT_V1, description: '' };
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      registry.testRegisterAgent(invalidAgent as AgentDefinition);

      expect(registry.getDefinition('MockAgent')).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[AgentRegistry] Skipping invalid agent definition. Missing name or description.',
      );
    });

    it('should overwrite an existing agent definition', () => {
      registry.testRegisterAgent(MOCK_AGENT_V1);
      expect(registry.getDefinition('MockAgent')?.description).toBe(
        'Mock Description V1',
      );

      registry.testRegisterAgent(MOCK_AGENT_V2);
      expect(registry.getDefinition('MockAgent')?.description).toBe(
        'Mock Description V2 (Updated)',
      );
      expect(registry.getAllDefinitions()).toHaveLength(1);
    });

    it('should log overwrites when in debug mode', () => {
      const debugConfig = makeFakeConfig({ debugMode: true });
      const debugRegistry = new TestableAgentRegistry(debugConfig);
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      debugRegistry.testRegisterAgent(MOCK_AGENT_V1);
      debugRegistry.testRegisterAgent(MOCK_AGENT_V2);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        `[AgentRegistry] Overriding agent 'MockAgent'`,
      );
    });

    it('should not log overwrites when not in debug mode', () => {
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});

      registry.testRegisterAgent(MOCK_AGENT_V1);
      registry.testRegisterAgent(MOCK_AGENT_V2);

      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        `[AgentRegistry] Overriding agent 'MockAgent'`,
      );
    });

    it('should handle bulk registrations correctly', async () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve(
          registry.testRegisterAgent({
            ...MOCK_AGENT_V1,
            name: `Agent${i}`,
          }),
        ),
      );

      await Promise.all(promises);
      expect(registry.getAllDefinitions()).toHaveLength(100);
    });
  });

  describe('accessors', () => {
    const ANOTHER_AGENT: AgentDefinition = {
      ...MOCK_AGENT_V1,
      name: 'AnotherAgent',
    };

    beforeEach(() => {
      registry.testRegisterAgent(MOCK_AGENT_V1);
      registry.testRegisterAgent(ANOTHER_AGENT);
    });

    it('getDefinition should return the correct definition', () => {
      expect(registry.getDefinition('MockAgent')).toEqual(MOCK_AGENT_V1);
      expect(registry.getDefinition('AnotherAgent')).toEqual(ANOTHER_AGENT);
    });

    it('getDefinition should return undefined for unknown agents', () => {
      expect(registry.getDefinition('NonExistentAgent')).toBeUndefined();
    });

    it('getAllDefinitions should return all registered definitions', () => {
      const all = registry.getAllDefinitions();
      expect(all).toHaveLength(2);
      expect(all).toEqual(
        expect.arrayContaining([MOCK_AGENT_V1, ANOTHER_AGENT]),
      );
    });
  });
});
