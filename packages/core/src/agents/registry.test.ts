/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRegistry, getModelConfigAlias } from './registry.js';
import { makeFakeConfig } from '../test-utils/config.js';
import type { AgentDefinition, LocalAgentDefinition } from './types.js';
import type { Config, GeminiCLIExtension } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';
import { coreEvents, CoreEvent } from '../utils/events.js';
import { A2AClientManager } from './a2a-client-manager.js';
import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  GEMINI_MODEL_ALIAS_AUTO,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
} from '../config/models.js';
import * as tomlLoader from './agentLoader.js';
import { SimpleExtensionLoader } from '../utils/extensionLoader.js';

vi.mock('./agentLoader.js', () => ({
  loadAgentsFromDirectory: vi
    .fn()
    .mockResolvedValue({ agents: [], errors: [] }),
}));

vi.mock('./a2a-client-manager.js', () => ({
  A2AClientManager: {
    getInstance: vi.fn(),
  },
}));

// A test-only subclass to expose the protected `registerAgent` method.
class TestableAgentRegistry extends AgentRegistry {
  async testRegisterAgent(definition: AgentDefinition): Promise<void> {
    await this.registerAgent(definition);
  }
}

// Define mock agent structures for testing registration logic
const MOCK_AGENT_V1: AgentDefinition = {
  kind: 'local',
  name: 'MockAgent',
  description: 'Mock Description V1',
  inputConfig: { inputs: {} },
  modelConfig: {
    model: 'test',
    generateContentConfig: {
      temperature: 0,
      topP: 1,
      thinkingConfig: {
        includeThoughts: true,
        thinkingBudget: -1,
      },
    },
  },
  runConfig: { maxTimeMinutes: 1 },
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
        `[AgentRegistry] Loaded with ${agentCount} agents.`,
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
        cliHelpAgentSettings: { enabled: false },
      });
      const disabledRegistry = new TestableAgentRegistry(disabledConfig);

      await disabledRegistry.initialize();

      expect(disabledRegistry.getAllDefinitions()).toHaveLength(0);
      expect(
        vi.mocked(tomlLoader.loadAgentsFromDirectory),
      ).not.toHaveBeenCalled();
    });

    it('should register CLI help agent by default', async () => {
      const config = makeFakeConfig();
      const registry = new TestableAgentRegistry(config);

      await registry.initialize();

      expect(registry.getDefinition('cli_help')).toBeDefined();
    });

    it('should register CLI help agent if disabled', async () => {
      const config = makeFakeConfig({
        cliHelpAgentSettings: { enabled: false },
      });
      const registry = new TestableAgentRegistry(config);

      await registry.initialize();

      expect(registry.getDefinition('cli_help')).toBeUndefined();
    });

    it('should load agents from active extensions', async () => {
      const extensionAgent = {
        ...MOCK_AGENT_V1,
        name: 'extension-agent',
      };
      const extensions: GeminiCLIExtension[] = [
        {
          name: 'test-extension',
          isActive: true,
          agents: [extensionAgent],
          version: '1.0.0',
          path: '/path/to/extension',
          contextFiles: [],
          id: 'test-extension-id',
        },
      ];
      const mockConfig = makeFakeConfig({
        extensionLoader: new SimpleExtensionLoader(extensions),
        enableAgents: true,
      });
      const registry = new TestableAgentRegistry(mockConfig);

      await registry.initialize();

      expect(registry.getDefinition('extension-agent')).toEqual(extensionAgent);
    });

    it('should NOT load agents from inactive extensions', async () => {
      const extensionAgent = {
        ...MOCK_AGENT_V1,
        name: 'extension-agent',
      };
      const extensions: GeminiCLIExtension[] = [
        {
          name: 'test-extension',
          isActive: false,
          agents: [extensionAgent],
          version: '1.0.0',
          path: '/path/to/extension',
          contextFiles: [],
          id: 'test-extension-id',
        },
      ];
      const mockConfig = makeFakeConfig({
        extensionLoader: new SimpleExtensionLoader(extensions),
      });
      const registry = new TestableAgentRegistry(mockConfig);

      await registry.initialize();

      expect(registry.getDefinition('extension-agent')).toBeUndefined();
    });
  });

  describe('registration logic', () => {
    it('should register runtime overrides when the model is "auto"', async () => {
      const autoAgent: LocalAgentDefinition = {
        ...MOCK_AGENT_V1,
        name: 'AutoAgent',
        modelConfig: { ...MOCK_AGENT_V1.modelConfig, model: 'auto' },
      };

      const registerOverrideSpy = vi.spyOn(
        mockConfig.modelConfigService,
        'registerRuntimeModelOverride',
      );

      await registry.testRegisterAgent(autoAgent);

      // Should register one alias for the custom model config.
      expect(
        mockConfig.modelConfigService.getResolvedConfig({
          model: getModelConfigAlias(autoAgent),
        }),
      ).toStrictEqual({
        model: 'auto',
        generateContentConfig: {
          temperature: autoAgent.modelConfig.generateContentConfig?.temperature,
          topP: autoAgent.modelConfig.generateContentConfig?.topP,
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: -1,
          },
        },
      });

      // Should register one override for the agent name (scope)
      expect(registerOverrideSpy).toHaveBeenCalledTimes(1);

      // Check scope override
      expect(registerOverrideSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          match: { overrideScope: autoAgent.name },
          modelConfig: expect.objectContaining({
            generateContentConfig: expect.any(Object),
          }),
        }),
      );
    });

    it('should register a valid agent definition', async () => {
      await registry.testRegisterAgent(MOCK_AGENT_V1);
      expect(registry.getDefinition('MockAgent')).toEqual(MOCK_AGENT_V1);
      expect(
        mockConfig.modelConfigService.getResolvedConfig({
          model: getModelConfigAlias(MOCK_AGENT_V1),
        }),
      ).toStrictEqual({
        model: MOCK_AGENT_V1.modelConfig.model,
        generateContentConfig: {
          temperature:
            MOCK_AGENT_V1.modelConfig.generateContentConfig?.temperature,
          topP: MOCK_AGENT_V1.modelConfig.generateContentConfig?.topP,
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: -1,
          },
        },
      });
    });

    it('should register a remote agent definition', async () => {
      const remoteAgent: AgentDefinition = {
        kind: 'remote',
        name: 'RemoteAgent',
        description: 'A remote agent',
        agentCardUrl: 'https://example.com/card',
        inputConfig: { inputs: {} },
      };

      vi.mocked(A2AClientManager.getInstance).mockReturnValue({
        loadAgent: vi.fn().mockResolvedValue({ name: 'RemoteAgent' }),
      } as unknown as A2AClientManager);

      await registry.testRegisterAgent(remoteAgent);
      expect(registry.getDefinition('RemoteAgent')).toEqual(remoteAgent);
    });

    it('should log remote agent registration in debug mode', async () => {
      const debugConfig = makeFakeConfig({ debugMode: true });
      const debugRegistry = new TestableAgentRegistry(debugConfig);
      const debugLogSpy = vi
        .spyOn(debugLogger, 'log')
        .mockImplementation(() => {});

      const remoteAgent: AgentDefinition = {
        kind: 'remote',
        name: 'RemoteAgent',
        description: 'A remote agent',
        agentCardUrl: 'https://example.com/card',
        inputConfig: { inputs: {} },
      };

      vi.mocked(A2AClientManager.getInstance).mockReturnValue({
        loadAgent: vi.fn().mockResolvedValue({ name: 'RemoteAgent' }),
      } as unknown as A2AClientManager);

      await debugRegistry.testRegisterAgent(remoteAgent);

      expect(debugLogSpy).toHaveBeenCalledWith(
        `[AgentRegistry] Registered remote agent 'RemoteAgent' with card: https://example.com/card`,
      );
    });

    it('should handle special characters in agent names', async () => {
      const specialAgent = {
        ...MOCK_AGENT_V1,
        name: 'Agent-123_$pecial.v2',
      };
      await registry.testRegisterAgent(specialAgent);
      expect(registry.getDefinition('Agent-123_$pecial.v2')).toEqual(
        specialAgent,
      );
    });

    it('should reject an agent definition missing a name', async () => {
      const invalidAgent = { ...MOCK_AGENT_V1, name: '' };
      const debugWarnSpy = vi
        .spyOn(debugLogger, 'warn')
        .mockImplementation(() => {});

      await registry.testRegisterAgent(invalidAgent);

      expect(registry.getDefinition('MockAgent')).toBeUndefined();
      expect(debugWarnSpy).toHaveBeenCalledWith(
        '[AgentRegistry] Skipping invalid agent definition. Missing name or description.',
      );
    });

    it('should reject an agent definition missing a description', async () => {
      const invalidAgent = { ...MOCK_AGENT_V1, description: '' };
      const debugWarnSpy = vi
        .spyOn(debugLogger, 'warn')
        .mockImplementation(() => {});

      await registry.testRegisterAgent(invalidAgent as AgentDefinition);

      expect(registry.getDefinition('MockAgent')).toBeUndefined();
      expect(debugWarnSpy).toHaveBeenCalledWith(
        '[AgentRegistry] Skipping invalid agent definition. Missing name or description.',
      );
    });

    it('should overwrite an existing agent definition', async () => {
      await registry.testRegisterAgent(MOCK_AGENT_V1);
      expect(registry.getDefinition('MockAgent')?.description).toBe(
        'Mock Description V1',
      );

      await registry.testRegisterAgent(MOCK_AGENT_V2);
      expect(registry.getDefinition('MockAgent')?.description).toBe(
        'Mock Description V2 (Updated)',
      );
      expect(registry.getAllDefinitions()).toHaveLength(1);
    });

    it('should log overwrites when in debug mode', async () => {
      const debugConfig = makeFakeConfig({ debugMode: true });
      const debugRegistry = new TestableAgentRegistry(debugConfig);
      const debugLogSpy = vi
        .spyOn(debugLogger, 'log')
        .mockImplementation(() => {});

      await debugRegistry.testRegisterAgent(MOCK_AGENT_V1);
      await debugRegistry.testRegisterAgent(MOCK_AGENT_V2);

      expect(debugLogSpy).toHaveBeenCalledWith(
        `[AgentRegistry] Overriding agent 'MockAgent'`,
      );
    });

    it('should not log overwrites when not in debug mode', async () => {
      const debugLogSpy = vi
        .spyOn(debugLogger, 'log')
        .mockImplementation(() => {});

      await registry.testRegisterAgent(MOCK_AGENT_V1);
      await registry.testRegisterAgent(MOCK_AGENT_V2);

      expect(debugLogSpy).not.toHaveBeenCalledWith(
        `[AgentRegistry] Overriding agent 'MockAgent'`,
      );
    });

    it('should handle bulk registrations correctly', async () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        registry.testRegisterAgent({
          ...MOCK_AGENT_V1,
          name: `Agent${i}`,
        }),
      );

      await Promise.all(promises);
      expect(registry.getAllDefinitions()).toHaveLength(100);
    });
  });

  describe('reload', () => {
    it('should clear existing agents and reload from directories', async () => {
      const config = makeFakeConfig({ enableAgents: true });
      const registry = new TestableAgentRegistry(config);

      const initialAgent = { ...MOCK_AGENT_V1, name: 'InitialAgent' };
      await registry.testRegisterAgent(initialAgent);
      expect(registry.getDefinition('InitialAgent')).toBeDefined();

      const newAgent = { ...MOCK_AGENT_V1, name: 'NewAgent' };
      vi.mocked(tomlLoader.loadAgentsFromDirectory).mockResolvedValue({
        agents: [newAgent],
        errors: [],
      });

      const clearCacheSpy = vi.fn();
      vi.mocked(A2AClientManager.getInstance).mockReturnValue({
        clearCache: clearCacheSpy,
      } as unknown as A2AClientManager);

      const emitSpy = vi.spyOn(coreEvents, 'emitAgentsRefreshed');

      await registry.reload();

      expect(clearCacheSpy).toHaveBeenCalled();
      expect(registry.getDefinition('InitialAgent')).toBeUndefined();
      expect(registry.getDefinition('NewAgent')).toBeDefined();
      expect(emitSpy).toHaveBeenCalled();
    });
  });

  describe('inheritance and refresh', () => {
    it('should resolve "inherit" to the current model from configuration', async () => {
      const config = makeFakeConfig({ model: 'current-model' });
      const registry = new TestableAgentRegistry(config);

      const agent: AgentDefinition = {
        ...MOCK_AGENT_V1,
        modelConfig: { ...MOCK_AGENT_V1.modelConfig, model: 'inherit' },
      };

      await registry.testRegisterAgent(agent);

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

      await registry.testRegisterAgent(agent);

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

      // Since the listener is async but not awaited by emit, we should manually
      // trigger refresh or wait.
      await vi.waitFor(() => {
        const resolved = config.modelConfigService.getResolvedConfig({
          model: getModelConfigAlias(agent),
        });
        if (resolved.model !== 'new-model') {
          throw new Error('Model not updated yet');
        }
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

    beforeEach(async () => {
      await registry.testRegisterAgent(MOCK_AGENT_V1);
      await registry.testRegisterAgent(ANOTHER_AGENT);
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

  describe('overrides', () => {
    it('should skip registration if agent is disabled in settings', async () => {
      const config = makeFakeConfig({
        agents: {
          overrides: {
            MockAgent: { disabled: true },
          },
        },
      });
      const registry = new TestableAgentRegistry(config);

      await registry.testRegisterAgent(MOCK_AGENT_V1);

      expect(registry.getDefinition('MockAgent')).toBeUndefined();
    });

    it('should skip remote agent registration if disabled in settings', async () => {
      const config = makeFakeConfig({
        agents: {
          overrides: {
            RemoteAgent: { disabled: true },
          },
        },
      });
      const registry = new TestableAgentRegistry(config);

      const remoteAgent: AgentDefinition = {
        kind: 'remote',
        name: 'RemoteAgent',
        description: 'A remote agent',
        agentCardUrl: 'https://example.com/card',
        inputConfig: { inputs: {} },
      };

      await registry.testRegisterAgent(remoteAgent);

      expect(registry.getDefinition('RemoteAgent')).toBeUndefined();
    });

    it('should merge runConfig overrides', async () => {
      const config = makeFakeConfig({
        agents: {
          overrides: {
            MockAgent: {
              runConfig: { maxTurns: 50 },
            },
          },
        },
      });
      const registry = new TestableAgentRegistry(config);

      await registry.testRegisterAgent(MOCK_AGENT_V1);

      const def = registry.getDefinition('MockAgent') as LocalAgentDefinition;
      expect(def.runConfig.maxTurns).toBe(50);
      expect(def.runConfig.maxTimeMinutes).toBe(
        MOCK_AGENT_V1.runConfig.maxTimeMinutes,
      );
    });

    it('should apply modelConfig overrides', async () => {
      const config = makeFakeConfig({
        agents: {
          overrides: {
            MockAgent: {
              modelConfig: {
                model: 'overridden-model',
                generateContentConfig: {
                  temperature: 0.5,
                },
              },
            },
          },
        },
      });
      const registry = new TestableAgentRegistry(config);

      await registry.testRegisterAgent(MOCK_AGENT_V1);

      const resolved = config.modelConfigService.getResolvedConfig({
        model: getModelConfigAlias(MOCK_AGENT_V1),
      });

      expect(resolved.model).toBe('overridden-model');
      expect(resolved.generateContentConfig.temperature).toBe(0.5);
      // topP should still be MOCK_AGENT_V1.modelConfig.top_p (1) because we merged
      expect(resolved.generateContentConfig.topP).toBe(1);
    });

    it('should deep merge generateContentConfig (e.g. thinkingConfig)', async () => {
      const config = makeFakeConfig({
        agents: {
          overrides: {
            MockAgent: {
              modelConfig: {
                generateContentConfig: {
                  thinkingConfig: {
                    thinkingBudget: 16384,
                  },
                },
              },
            },
          },
        },
      });
      const registry = new TestableAgentRegistry(config);

      await registry.testRegisterAgent(MOCK_AGENT_V1);

      const resolved = config.modelConfigService.getResolvedConfig({
        model: getModelConfigAlias(MOCK_AGENT_V1),
      });

      expect(resolved.generateContentConfig.thinkingConfig).toEqual({
        includeThoughts: true, // Preserved from default
        thinkingBudget: 16384, // Overridden
      });
    });
  });

  describe('getToolDescription', () => {
    it('should return default message when no agents are registered', () => {
      expect(registry.getToolDescription()).toContain(
        'No agents are currently available',
      );
    });

    it('should return formatted list of agents when agents are available', async () => {
      await registry.testRegisterAgent(MOCK_AGENT_V1);
      await registry.testRegisterAgent({
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
