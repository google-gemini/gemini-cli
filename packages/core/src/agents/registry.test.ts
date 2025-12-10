/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRegistry, getModelConfigAlias } from './registry.js';
import { makeFakeConfig } from '../test-utils/config.js';
import type { AgentDefinition } from './types.js';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';
import { coreEvents } from '../utils/events.js';

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
    it('should log the count of loaded agents in debug mode', async () => {
      const debugConfig = makeFakeConfig({ debugMode: true });
      const debugRegistry = new TestableAgentRegistry(debugConfig);
      const debugLogSpy = vi
        .spyOn(debugLogger, 'log')
        .mockImplementation(() => {});

      await debugRegistry.initialize();

      const agentCount = debugRegistry.getAllDefinitions().length;
      expect(debugLogSpy).toHaveBeenCalledWith(
        `[AgentRegistry] Initialized with ${agentCount} agents.`,
      );
    });

    it('should use preview model for codebase investigator if main model is preview', async () => {
      const previewConfig = makeFakeConfig({
        model: 'gemini-3-pro-preview',
        codebaseInvestigatorSettings: {
          enabled: true,
          model: 'pro',
        },
      });
      const previewRegistry = new TestableAgentRegistry(previewConfig);

      await previewRegistry.initialize();

      const investigatorDef = previewRegistry.getDefinition(
        'codebase_investigator',
      );
      expect(investigatorDef).toBeDefined();
      expect(investigatorDef?.modelConfig.model).toBe('gemini-3-pro-preview');
    });

    it('should respect legacy codebase_investigator settings', async () => {
      const legacyConfig = makeFakeConfig({
        codebaseInvestigatorSettings: {
          enabled: true,
          model: 'legacy-model',
          maxTimeMinutes: 10,
          maxNumTurns: 20,
          thinkingBudget: 1000,
        },
        agents: {}, // Empty new settings
      });
      const legacyRegistry = new TestableAgentRegistry(legacyConfig);
      await legacyRegistry.initialize();

      const investigatorDef = legacyRegistry.getDefinition(
        'codebase_investigator',
      );
      expect(investigatorDef).toBeDefined();
      expect(investigatorDef?.modelConfig.model).toBe('legacy-model');
      expect(investigatorDef?.runConfig.max_time_minutes).toBe(10);
      expect(investigatorDef?.runConfig.max_turns).toBe(20);
      expect(investigatorDef?.modelConfig.thinkingBudget).toBe(1000);
    });

    it('should use new agents config exclusively when present (not merge with legacy)', async () => {
      const mixedConfig = makeFakeConfig({
        codebaseInvestigatorSettings: {
          enabled: true,
          model: 'legacy-model',
          maxTimeMinutes: 10,
          maxNumTurns: 20,
        },
        agents: {
          codebase_investigator: {
            enabled: true,
            model: 'new-model',
            // Note: maxTimeMinutes and maxTurns NOT specified
          },
        },
      });
      const mixedRegistry = new TestableAgentRegistry(mixedConfig);
      await mixedRegistry.initialize();

      const investigatorDef = mixedRegistry.getDefinition(
        'codebase_investigator',
      );
      expect(investigatorDef).toBeDefined();

      // New config values should be used
      expect(investigatorDef?.modelConfig.model).toBe('new-model');

      // Unspecified values should fall back to HARDCODED DEFAULTS, not legacy settings
      // CodebaseInvestigatorAgent defaults: max_time_minutes = 5, max_turns = 15
      expect(investigatorDef?.runConfig.max_time_minutes).toBe(5); // NOT 10 from legacy
      expect(investigatorDef?.runConfig.max_turns).toBe(15); // NOT 20 from legacy
    });

    it('should use legacy settings when new agents config is not present', async () => {
      const legacyOnlyConfig = makeFakeConfig({
        codebaseInvestigatorSettings: {
          enabled: true,
          model: 'legacy-model',
          maxTimeMinutes: 10,
          maxNumTurns: 20,
          thinkingBudget: 1000,
        },
        // agents NOT specified or empty
      });
      const legacyRegistry = new TestableAgentRegistry(legacyOnlyConfig);
      await legacyRegistry.initialize();

      const investigatorDef = legacyRegistry.getDefinition(
        'codebase_investigator',
      );
      expect(investigatorDef).toBeDefined();
      expect(investigatorDef?.modelConfig.model).toBe('legacy-model');
      expect(investigatorDef?.runConfig.max_time_minutes).toBe(10);
      expect(investigatorDef?.runConfig.max_turns).toBe(20);
      expect(investigatorDef?.modelConfig.thinkingBudget).toBe(1000);
    });

    it('should emit deprecation warning when legacy settings are used without new settings', async () => {
      const legacyOnlyConfig = makeFakeConfig({
        codebaseInvestigatorSettings: {
          enabled: true,
          model: 'legacy-model',
        },
      });
      const legacyRegistry = new TestableAgentRegistry(legacyOnlyConfig);
      const emitFeedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');

      await legacyRegistry.initialize();

      expect(emitFeedbackSpy).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining(
          'The `experimental.codebaseInvestigatorSettings` configuration is deprecated',
        ),
      );
    });

    it('should not emit deprecation warning when new settings are used', async () => {
      const newConfig = makeFakeConfig({
        agents: {
          codebase_investigator: {
            enabled: true,
            model: 'new-model',
          },
        },
        codebaseInvestigatorSettings: {
          enabled: true,
          model: 'legacy-model',
        },
      });
      const newRegistry = new TestableAgentRegistry(newConfig);
      const emitFeedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');

      await newRegistry.initialize();

      expect(emitFeedbackSpy).not.toHaveBeenCalledWith(
        'warning',
        expect.stringContaining(
          'The `experimental.codebaseInvestigatorSettings` configuration is deprecated',
        ),
      );
    });

    it('should not emit deprecation warning when no settings are configured', async () => {
      const defaultConfig = makeFakeConfig({
        // Neither agents nor codebaseInvestigatorSettings explicitly set
      });
      const defaultRegistry = new TestableAgentRegistry(defaultConfig);
      const emitFeedbackSpy = vi.spyOn(coreEvents, 'emitFeedback');

      await defaultRegistry.initialize();

      expect(emitFeedbackSpy).not.toHaveBeenCalledWith(
        'warning',
        expect.stringContaining('deprecated'),
      );
    });

    it('should not register agent when disabled in config', async () => {
      const disabledConfig = makeFakeConfig({
        agents: {
          codebase_investigator: { enabled: false },
        },
      });
      const disabledRegistry = new TestableAgentRegistry(disabledConfig);
      await disabledRegistry.initialize();

      expect(
        disabledRegistry.getDefinition('codebase_investigator'),
      ).toBeUndefined();
    });

    it('should not register agent when disabled in legacy settings', async () => {
      const legacyDisabledConfig = makeFakeConfig({
        codebaseInvestigatorSettings: { enabled: false },
        agents: {},
      });
      const legacyRegistry = new TestableAgentRegistry(legacyDisabledConfig);
      await legacyRegistry.initialize();

      expect(
        legacyRegistry.getDefinition('codebase_investigator'),
      ).toBeUndefined();
    });
  });

  describe('registration logic', () => {
    it('should register a valid agent definition', () => {
      registry.testRegisterAgent(MOCK_AGENT_V1);
      expect(registry.getDefinition('MockAgent')).toEqual(MOCK_AGENT_V1);
      expect(
        mockConfig.modelConfigService.getResolvedConfig({
          model: getModelConfigAlias(MOCK_AGENT_V1),
        }),
      ).toStrictEqual({
        model: MOCK_AGENT_V1.modelConfig.model,
        generateContentConfig: {
          temperature: MOCK_AGENT_V1.modelConfig.temp,
          topP: MOCK_AGENT_V1.modelConfig.top_p,
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: -1,
          },
        },
      });
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
      const debugWarnSpy = vi
        .spyOn(debugLogger, 'warn')
        .mockImplementation(() => {});

      registry.testRegisterAgent(invalidAgent);

      expect(registry.getDefinition('MockAgent')).toBeUndefined();
      expect(debugWarnSpy).toHaveBeenCalledWith(
        '[AgentRegistry] Skipping invalid agent definition. Missing name or description.',
      );
    });

    it('should reject an agent definition missing a description', () => {
      const invalidAgent = { ...MOCK_AGENT_V1, description: '' };
      const debugWarnSpy = vi
        .spyOn(debugLogger, 'warn')
        .mockImplementation(() => {});

      registry.testRegisterAgent(invalidAgent as AgentDefinition);

      expect(registry.getDefinition('MockAgent')).toBeUndefined();
      expect(debugWarnSpy).toHaveBeenCalledWith(
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
      const debugLogSpy = vi
        .spyOn(debugLogger, 'log')
        .mockImplementation(() => {});

      debugRegistry.testRegisterAgent(MOCK_AGENT_V1);
      debugRegistry.testRegisterAgent(MOCK_AGENT_V2);

      expect(debugLogSpy).toHaveBeenCalledWith(
        `[AgentRegistry] Overriding agent 'MockAgent'`,
      );
    });

    it('should not log overwrites when not in debug mode', () => {
      const debugLogSpy = vi
        .spyOn(debugLogger, 'log')
        .mockImplementation(() => {});

      registry.testRegisterAgent(MOCK_AGENT_V1);
      registry.testRegisterAgent(MOCK_AGENT_V2);

      expect(debugLogSpy).not.toHaveBeenCalledWith(
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
  describe('getToolDescription', () => {
    it('should return default message when no agents are registered', () => {
      expect(registry.getToolDescription()).toContain(
        'No agents are currently available',
      );
    });

    it('should return formatted list of agents when agents are available', () => {
      registry.testRegisterAgent(MOCK_AGENT_V1);
      registry.testRegisterAgent({
        ...MOCK_AGENT_V2,
        name: 'AnotherAgent',
        description: 'Another agent description',
      });

      const description = registry.getToolDescription();

      expect(description).toContain(
        'Delegates a task to a specialized sub-agent',
      );
      expect(description).toContain('Available agents:');
      expect(description).toContain(
        `- **${MOCK_AGENT_V1.name}**: ${MOCK_AGENT_V1.description}`,
      );
      expect(description).toContain(
        `- **AnotherAgent**: Another agent description`,
      );
    });

    it('should exclude disabled agents from directory context', async () => {
      const configWithDisabled = makeFakeConfig({
        codebaseInvestigatorSettings: { enabled: true },
        agents: {
          codebase_investigator: { enabled: false },
        },
      });
      const registryWithDisabled = new TestableAgentRegistry(
        configWithDisabled,
      );
      await registryWithDisabled.initialize();

      const context = registryWithDisabled.getDirectoryContext();
      expect(context).toContain('No sub-agents are currently available');
    });

    it('should exclude disabled agents from tool description', async () => {
      const configWithDisabled = makeFakeConfig({
        agents: {
          codebase_investigator: { enabled: false },
        },
      });
      const registryWithDisabled = new TestableAgentRegistry(
        configWithDisabled,
      );
      await registryWithDisabled.initialize();

      const description = registryWithDisabled.getToolDescription();
      expect(description).toContain('No agents are currently available');
      expect(description).not.toContain('codebase_investigator');
    });
  });
});
