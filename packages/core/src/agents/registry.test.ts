/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRegistry, getModelConfigAlias } from './registry.js';
import { makeFakeConfig } from '../test-utils/config.js';
import type { AgentDefinition, LocalAgentDefinition } from './types.js';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';
import { coreEvents, CoreEvent } from '../utils/events.js';
import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  GEMINI_MODEL_ALIAS_AUTO,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
} from '../config/models.js';
import * as tomlLoader from './toml-loader.js';

vi.mock('./toml-loader.js', () => ({
  loadAgentsFromDirectory: vi
    .fn()
    .mockResolvedValue({ agents: [], errors: [] }),
}));

// A test-only subclass to expose the protected `registerAgent` method.
class TestableAgentRegistry extends AgentRegistry {
  testRegisterAgent(definition: AgentDefinition): void {
    this.registerAgent(definition);
  }
}

// Define mock agent structures for testing registration logic
const MOCK_AGENT_V1: AgentDefinition = {
  kind: 'local',
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
    vi.mocked(tomlLoader.loadAgentsFromDirectory).mockResolvedValue({
      agents: [],
      errors: [],
    });
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
      const debugConfig = makeFakeConfig({
        debugMode: true,
        enableAgents: true,
      });
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

    it('should use preview flash model for codebase investigator if main model is preview pro', async () => {
      const previewConfig = makeFakeConfig({
        model: PREVIEW_GEMINI_MODEL,
        codebaseInvestigatorSettings: {
          enabled: true,
          model: GEMINI_MODEL_ALIAS_AUTO,
        },
      });
      const previewRegistry = new TestableAgentRegistry(previewConfig);

      await previewRegistry.initialize();

      const investigatorDef = previewRegistry.getDefinition(
        'codebase_investigator',
      ) as LocalAgentDefinition;
      expect(investigatorDef).toBeDefined();
      expect(investigatorDef?.modelConfig.model).toBe(
        PREVIEW_GEMINI_FLASH_MODEL,
      );
    });

    it('should use preview flash model for codebase investigator if main model is preview auto', async () => {
      const previewConfig = makeFakeConfig({
        model: PREVIEW_GEMINI_MODEL_AUTO,
        codebaseInvestigatorSettings: {
          enabled: true,
          model: GEMINI_MODEL_ALIAS_AUTO,
        },
      });
      const previewRegistry = new TestableAgentRegistry(previewConfig);

      await previewRegistry.initialize();

      const investigatorDef = previewRegistry.getDefinition(
        'codebase_investigator',
      ) as LocalAgentDefinition;
      expect(investigatorDef).toBeDefined();
      expect(investigatorDef?.modelConfig.model).toBe(
        PREVIEW_GEMINI_FLASH_MODEL,
      );
    });

    it('should use the model from the investigator settings', async () => {
      const previewConfig = makeFakeConfig({
        model: PREVIEW_GEMINI_MODEL,
        codebaseInvestigatorSettings: {
          enabled: true,
          model: DEFAULT_GEMINI_FLASH_LITE_MODEL,
        },
      });
      const previewRegistry = new TestableAgentRegistry(previewConfig);

      await previewRegistry.initialize();

      const investigatorDef = previewRegistry.getDefinition(
        'codebase_investigator',
      ) as LocalAgentDefinition;
      expect(investigatorDef).toBeDefined();
      expect(investigatorDef?.modelConfig.model).toBe(
        DEFAULT_GEMINI_FLASH_LITE_MODEL,
      );
    });

    it('should load agents from user and project directories with correct precedence', async () => {
      mockConfig = makeFakeConfig({ enableAgents: true });
      registry = new TestableAgentRegistry(mockConfig);

      const userAgent = {
        ...MOCK_AGENT_V1,
        name: 'common-agent',
        description: 'User version',
      };
      const projectAgent = {
        ...MOCK_AGENT_V1,
        name: 'common-agent',
        description: 'Project version',
      };
      const uniqueProjectAgent = {
        ...MOCK_AGENT_V1,
        name: 'project-only',
        description: 'Project only',
      };

      vi.mocked(tomlLoader.loadAgentsFromDirectory)
        .mockResolvedValueOnce({ agents: [userAgent], errors: [] }) // User dir
        .mockResolvedValueOnce({
          agents: [projectAgent, uniqueProjectAgent],
          errors: [],
        }); // Project dir

      await registry.initialize();

      // Project agent should override user agent
      expect(registry.getDefinition('common-agent')?.description).toBe(
        'Project version',
      );
      expect(registry.getDefinition('project-only')).toBeDefined();
      expect(
        vi.mocked(tomlLoader.loadAgentsFromDirectory),
      ).toHaveBeenCalledTimes(2);
    });

    it('should NOT load TOML agents when enableAgents is false', async () => {
      const disabledConfig = makeFakeConfig({
        enableAgents: false,
        codebaseInvestigatorSettings: { enabled: false },
      });
      const disabledRegistry = new TestableAgentRegistry(disabledConfig);

      await disabledRegistry.initialize();

      expect(disabledRegistry.getAllDefinitions()).toHaveLength(0);
      expect(
        vi.mocked(tomlLoader.loadAgentsFromDirectory),
      ).not.toHaveBeenCalled();
    });

    it('should register introspection agent if enabled', async () => {
      const config = makeFakeConfig({
        introspectionAgentSettings: { enabled: true },
      });
      const registry = new TestableAgentRegistry(config);

      await registry.initialize();

      expect(registry.getDefinition('introspection_agent')).toBeDefined();
    });

    it('should NOT register introspection agent if disabled', async () => {
      const config = makeFakeConfig({
        introspectionAgentSettings: { enabled: false },
      });
      const registry = new TestableAgentRegistry(config);

      await registry.initialize();

      expect(registry.getDefinition('introspection_agent')).toBeUndefined();
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

  describe('inheritance and refresh', () => {
    it('should resolve "inherit" to the current model from configuration', () => {
      const config = makeFakeConfig({ model: 'current-model' });
      const registry = new TestableAgentRegistry(config);

      const agent: AgentDefinition = {
        ...MOCK_AGENT_V1,
        modelConfig: { ...MOCK_AGENT_V1.modelConfig, model: 'inherit' },
      };

      registry.testRegisterAgent(agent);

      const resolved = config.modelConfigService.getResolvedConfig({
        model: getModelConfigAlias(agent),
      });
      expect(resolved.model).toBe('current-model');
    });

    it('should update inherited models when the main model changes', async () => {
      const config = makeFakeConfig({ model: 'initial-model' });
      const registry = new TestableAgentRegistry(config);
      await registry.initialize();

      const agent: AgentDefinition = {
        ...MOCK_AGENT_V1,
        name: 'InheritingAgent',
        modelConfig: { ...MOCK_AGENT_V1.modelConfig, model: 'inherit' },
      };

      registry.testRegisterAgent(agent);

      // Verify initial state
      let resolved = config.modelConfigService.getResolvedConfig({
        model: getModelConfigAlias(agent),
      });
      expect(resolved.model).toBe('initial-model');

      // Change model and emit event
      vi.spyOn(config, 'getModel').mockReturnValue('new-model');
      coreEvents.emit(CoreEvent.ModelChanged, {
        model: 'new-model',
      });

      // Verify refreshed state
      resolved = config.modelConfigService.getResolvedConfig({
        model: getModelConfigAlias(agent),
      });
      expect(resolved.model).toBe('new-model');
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
  });
});
