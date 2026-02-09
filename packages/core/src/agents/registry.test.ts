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
  DEFAULT_GEMINI_MODEL,
  DEFAULT_THINKING_MODE,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
} from '../config/models.js';
import * as tomlLoader from './agentLoader.js';
import { SimpleExtensionLoader } from '../utils/extensionLoader.js';
import type { ConfigParameters } from '../config/config.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { ThinkingLevel } from '@google/genai';
import type { AcknowledgedAgentsService } from './acknowledgedAgents.js';
import { PolicyDecision } from '../policy/types.js';

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

function makeMockedConfig(params?: Partial<ConfigParameters>): Config {
  const config = makeFakeConfig(params);
  vi.spyOn(config, 'getToolRegistry').mockReturnValue({
    getAllToolNames: () => ['tool1', 'tool2'],
  } as unknown as ToolRegistry);
  vi.spyOn(config, 'getAgentRegistry').mockReturnValue({
    getDirectoryContext: () => 'mock directory context',
  } as unknown as AgentRegistry);
  return config;
}

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
  inputConfig: { inputSchema: { type: 'object' } },
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
    mockConfig = makeMockedConfig();
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
      const debugConfig = makeMockedConfig({
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

    it('should use default model for codebase investigator for non-preview models', async () => {
      const previewConfig = makeMockedConfig({ model: DEFAULT_GEMINI_MODEL });
      const previewRegistry = new TestableAgentRegistry(previewConfig);

      await previewRegistry.initialize();

      const investigatorDef = previewRegistry.getDefinition(
        'codebase_investigator',
      ) as LocalAgentDefinition;
      expect(investigatorDef).toBeDefined();
      expect(investigatorDef?.modelConfig.model).toBe(DEFAULT_GEMINI_MODEL);
      expect(
        investigatorDef?.modelConfig.generateContentConfig?.thinkingConfig,
      ).toStrictEqual({
        includeThoughts: true,
        thinkingBudget: DEFAULT_THINKING_MODE,
      });
    });

    it('should use preview flash model for codebase investigator if main model is preview pro', async () => {
      const previewConfig = makeMockedConfig({ model: PREVIEW_GEMINI_MODEL });
      const previewRegistry = new TestableAgentRegistry(previewConfig);

      await previewRegistry.initialize();

      const investigatorDef = previewRegistry.getDefinition(
        'codebase_investigator',
      ) as LocalAgentDefinition;
      expect(investigatorDef).toBeDefined();
      expect(investigatorDef?.modelConfig.model).toBe(
        PREVIEW_GEMINI_FLASH_MODEL,
      );
      expect(
        investigatorDef?.modelConfig.generateContentConfig?.thinkingConfig,
      ).toStrictEqual({
        includeThoughts: true,
        thinkingLevel: ThinkingLevel.HIGH,
      });
    });

    it('should use preview flash model for codebase investigator if main model is preview auto', async () => {
      const previewConfig = makeMockedConfig({
        model: PREVIEW_GEMINI_MODEL_AUTO,
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
      const previewConfig = makeMockedConfig({
        model: PREVIEW_GEMINI_MODEL,
        agents: {
          overrides: {
            codebase_investigator: {
              enabled: true,
              modelConfig: { model: DEFAULT_GEMINI_FLASH_LITE_MODEL },
            },
          },
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
      mockConfig = makeMockedConfig({ enableAgents: true });
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
      const disabledConfig = makeMockedConfig({
        enableAgents: false,
        agents: {
          overrides: {
            codebase_investigator: { enabled: false },
            cli_help: { enabled: false },
          },
        },
      });
      const disabledRegistry = new TestableAgentRegistry(disabledConfig);

      await disabledRegistry.initialize();

      expect(disabledRegistry.getAllDefinitions()).toHaveLength(0);
      expect(
        vi.mocked(tomlLoader.loadAgentsFromDirectory),
      ).not.toHaveBeenCalled();
    });

    it('should register CLI help agent by default', async () => {
      const config = makeMockedConfig();
      const registry = new TestableAgentRegistry(config);

      await registry.initialize();

      expect(registry.getDefinition('cli_help')).toBeDefined();
    });

    it('should NOT register CLI help agent if disabled', async () => {
      const config = makeMockedConfig({
        agents: {
          overrides: {
            cli_help: { enabled: false },
          },
        },
      });
      const registry = new TestableAgentRegistry(config);

      await registry.initialize();

      expect(registry.getDefinition('cli_help')).toBeUndefined();
    });

    it('should NOT register generalist agent by default (because it is experimental)', async () => {
      const config = makeMockedConfig();
      const registry = new TestableAgentRegistry(config);

      await registry.initialize();

      expect(registry.getDefinition('generalist')).toBeUndefined();
    });

    it('should register generalist agent if explicitly enabled via override', async () => {
      const config = makeMockedConfig({
        agents: {
          overrides: {
            generalist: { enabled: true },
          },
        },
      });
      const registry = new TestableAgentRegistry(config);

      await registry.initialize();

      expect(registry.getDefinition('generalist')).toBeDefined();
    });

    it('should NOT register a non-experimental agent if enabled is false', async () => {
      // CLI help is NOT experimental, but we explicitly disable it via enabled: false
      const config = makeMockedConfig({
        agents: {
          overrides: {
            cli_help: { enabled: false },
          },
        },
      });
      const registry = new TestableAgentRegistry(config);

      await registry.initialize();

      expect(registry.getDefinition('cli_help')).toBeUndefined();
    });

    it('should respect disabled override over enabled override', async () => {
      const config = makeMockedConfig({
        agents: {
          overrides: {
            generalist: { enabled: false },
          },
        },
      });
      const registry = new TestableAgentRegistry(config);

      await registry.initialize();

      expect(registry.getDefinition('generalist')).toBeUndefined();
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
      const mockConfig = makeMockedConfig({
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
      const mockConfig = makeMockedConfig({
        extensionLoader: new SimpleExtensionLoader(extensions),
      });
      const registry = new TestableAgentRegistry(mockConfig);

      await registry.initialize();

      expect(registry.getDefinition('extension-agent')).toBeUndefined();
    });

    it('should use agentCardUrl as hash for acknowledgement of remote agents', async () => {
      mockConfig = makeMockedConfig({ enableAgents: true });
      // Trust the folder so it attempts to load project agents
      vi.spyOn(mockConfig, 'isTrustedFolder').mockReturnValue(true);
      vi.spyOn(mockConfig, 'getFolderTrust').mockReturnValue(true);

      const registry = new TestableAgentRegistry(mockConfig);

      const remoteAgent: AgentDefinition = {
        kind: 'remote',
        name: 'RemoteAgent',
        description: 'A remote agent',
        agentCardUrl: 'https://example.com/card',
        inputConfig: { inputSchema: { type: 'object' } },
        metadata: { hash: 'file-hash', filePath: 'path/to/file.md' },
      };

      vi.mocked(tomlLoader.loadAgentsFromDirectory).mockResolvedValue({
        agents: [remoteAgent],
        errors: [],
      });

      const ackService = {
        isAcknowledged: vi.fn().mockResolvedValue(true),
        acknowledge: vi.fn(),
      };
      vi.spyOn(mockConfig, 'getAcknowledgedAgentsService').mockReturnValue(
        ackService as unknown as AcknowledgedAgentsService,
      );

      // Mock A2AClientManager to avoid network calls
      vi.mocked(A2AClientManager.getInstance).mockReturnValue({
        loadAgent: vi.fn().mockResolvedValue({ name: 'RemoteAgent' }),
        clearCache: vi.fn(),
      } as unknown as A2AClientManager);

      await registry.initialize();

      // Verify ackService was called with the URL, not the file hash
      expect(ackService.isAcknowledged).toHaveBeenCalledWith(
        expect.anything(),
        'RemoteAgent',
        'https://example.com/card',
      );

      // Also verify that the agent's metadata was updated to use the URL as hash
      // Use getDefinition because registerAgent might have been called
      expect(registry.getDefinition('RemoteAgent')?.metadata?.hash).toBe(
        'https://example.com/card',
      );
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
        inputConfig: { inputSchema: { type: 'object' } },
      };

      vi.mocked(A2AClientManager.getInstance).mockReturnValue({
        loadAgent: vi.fn().mockResolvedValue({ name: 'RemoteAgent' }),
      } as unknown as A2AClientManager);

      await registry.testRegisterAgent(remoteAgent);
      expect(registry.getDefinition('RemoteAgent')).toEqual(remoteAgent);
    });

    it('should log remote agent registration in debug mode', async () => {
      const debugConfig = makeMockedConfig({ debugMode: true });
      const debugRegistry = new TestableAgentRegistry(debugConfig);
      const debugLogSpy = vi
        .spyOn(debugLogger, 'log')
        .mockImplementation(() => {});

      const remoteAgent: AgentDefinition = {
        kind: 'remote',
        name: 'RemoteAgent',
        description: 'A remote agent',
        agentCardUrl: 'https://example.com/card',
        inputConfig: { inputSchema: { type: 'object' } },
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
      const debugConfig = makeMockedConfig({ debugMode: true });
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

    it('should dynamically register an ALLOW policy for local agents', async () => {
      const agent: AgentDefinition = {
        ...MOCK_AGENT_V1,
        name: 'PolicyTestAgent',
      };
      const policyEngine = mockConfig.getPolicyEngine();
      const addRuleSpy = vi.spyOn(policyEngine, 'addRule');

      await registry.testRegisterAgent(agent);

      expect(addRuleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'PolicyTestAgent',
          decision: PolicyDecision.ALLOW,
          priority: 1.05,
        }),
      );
    });

    it('should dynamically register an ASK_USER policy for remote agents', async () => {
      const remoteAgent: AgentDefinition = {
        kind: 'remote',
        name: 'RemotePolicyAgent',
        description: 'A remote agent',
        agentCardUrl: 'https://example.com/card',
        inputConfig: { inputSchema: { type: 'object' } },
      };

      vi.mocked(A2AClientManager.getInstance).mockReturnValue({
        loadAgent: vi.fn().mockResolvedValue({ name: 'RemotePolicyAgent' }),
      } as unknown as A2AClientManager);

      const policyEngine = mockConfig.getPolicyEngine();
      const addRuleSpy = vi.spyOn(policyEngine, 'addRule');

      await registry.testRegisterAgent(remoteAgent);

      expect(addRuleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'RemotePolicyAgent',
          decision: PolicyDecision.ASK_USER,
          priority: 1.05,
        }),
      );
    });

    it('should not register a policy if a USER policy already exists', async () => {
      const agent: AgentDefinition = {
        ...MOCK_AGENT_V1,
        name: 'ExistingUserPolicyAgent',
      };
      const policyEngine = mockConfig.getPolicyEngine();
      // Mock hasRuleForTool to return true when ignoreDynamic=true (simulating a user policy)
      vi.spyOn(policyEngine, 'hasRuleForTool').mockImplementation(
        (toolName, ignoreDynamic) =>
          toolName === 'ExistingUserPolicyAgent' && ignoreDynamic === true,
      );
      const addRuleSpy = vi.spyOn(policyEngine, 'addRule');

      await registry.testRegisterAgent(agent);

      expect(addRuleSpy).not.toHaveBeenCalled();
    });

    it('should replace an existing dynamic policy when an agent is overwritten', async () => {
      const localAgent: AgentDefinition = {
        ...MOCK_AGENT_V1,
        name: 'OverwrittenAgent',
      };
      const remoteAgent: AgentDefinition = {
        kind: 'remote',
        name: 'OverwrittenAgent',
        description: 'A remote agent',
        agentCardUrl: 'https://example.com/card',
        inputConfig: { inputSchema: { type: 'object' } },
      };

      vi.mocked(A2AClientManager.getInstance).mockReturnValue({
        loadAgent: vi.fn().mockResolvedValue({ name: 'OverwrittenAgent' }),
      } as unknown as A2AClientManager);

      const policyEngine = mockConfig.getPolicyEngine();
      const removeRuleSpy = vi.spyOn(policyEngine, 'removeRulesForTool');
      const addRuleSpy = vi.spyOn(policyEngine, 'addRule');

      // 1. Register local
      await registry.testRegisterAgent(localAgent);
      expect(addRuleSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ decision: PolicyDecision.ALLOW }),
      );

      // 2. Overwrite with remote
      await registry.testRegisterAgent(remoteAgent);

      // Verify old dynamic rule was removed
      expect(removeRuleSpy).toHaveBeenCalledWith(
        'OverwrittenAgent',
        'AgentRegistry (Dynamic)',
      );
      // Verify new dynamic rule (remote -> ASK_USER) was added
      expect(addRuleSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          toolName: 'OverwrittenAgent',
          decision: PolicyDecision.ASK_USER,
        }),
      );
    });
  });

  describe('reload', () => {
    it('should clear existing agents and reload from directories', async () => {
      const config = makeMockedConfig({ enableAgents: true });
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
      expect(registry.getDiscoveredDefinition('InitialAgent')).toBeUndefined();
      expect(registry.getDefinition('NewAgent')).toBeDefined();
      expect(registry.getDiscoveredDefinition('NewAgent')).toBeDefined();
      expect(emitSpy).toHaveBeenCalled();
    });
  });

  describe('inheritance and refresh', () => {
    it('should resolve "inherit" to the current model from configuration', async () => {
      const config = makeMockedConfig({ model: 'current-model' });
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
      const config = makeMockedConfig({ model: 'initial-model' });
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

    it('getAllDiscoveredAgentNames should return all names including disabled ones', async () => {
      const configWithDisabled = makeMockedConfig({
        agents: {
          overrides: {
            DisabledAgent: { enabled: false },
          },
        },
      });
      const registryWithDisabled = new TestableAgentRegistry(
        configWithDisabled,
      );

      const enabledAgent = { ...MOCK_AGENT_V1, name: 'EnabledAgent' };
      const disabledAgent = { ...MOCK_AGENT_V1, name: 'DisabledAgent' };

      await registryWithDisabled.testRegisterAgent(enabledAgent);
      await registryWithDisabled.testRegisterAgent(disabledAgent);

      const discoveredNames = registryWithDisabled.getAllDiscoveredAgentNames();
      expect(discoveredNames).toContain('EnabledAgent');
      expect(discoveredNames).toContain('DisabledAgent');
      expect(discoveredNames).toHaveLength(2);

      const activeNames = registryWithDisabled.getAllAgentNames();
      expect(activeNames).toContain('EnabledAgent');
      expect(activeNames).not.toContain('DisabledAgent');
      expect(activeNames).toHaveLength(1);
    });

    it('getDiscoveredDefinition should return the definition for a disabled agent', async () => {
      const configWithDisabled = makeMockedConfig({
        agents: {
          overrides: {
            DisabledAgent: { enabled: false },
          },
        },
      });
      const registryWithDisabled = new TestableAgentRegistry(
        configWithDisabled,
      );

      const disabledAgent = {
        ...MOCK_AGENT_V1,
        name: 'DisabledAgent',
        description: 'I am disabled',
      };

      await registryWithDisabled.testRegisterAgent(disabledAgent);

      expect(
        registryWithDisabled.getDefinition('DisabledAgent'),
      ).toBeUndefined();

      const discovered =
        registryWithDisabled.getDiscoveredDefinition('DisabledAgent');
      expect(discovered).toBeDefined();
      expect(discovered?.description).toBe('I am disabled');
    });
  });

  describe('overrides', () => {
    it('should skip registration if agent is disabled in settings', async () => {
      const config = makeMockedConfig({
        agents: {
          overrides: {
            MockAgent: { enabled: false },
          },
        },
      });
      const registry = new TestableAgentRegistry(config);

      await registry.testRegisterAgent(MOCK_AGENT_V1);

      expect(registry.getDefinition('MockAgent')).toBeUndefined();
    });

    it('should skip remote agent registration if disabled in settings', async () => {
      const config = makeMockedConfig({
        agents: {
          overrides: {
            RemoteAgent: { enabled: false },
          },
        },
      });
      const registry = new TestableAgentRegistry(config);

      const remoteAgent: AgentDefinition = {
        kind: 'remote',
        name: 'RemoteAgent',
        description: 'A remote agent',
        agentCardUrl: 'https://example.com/card',
        inputConfig: { inputSchema: { type: 'object' } },
      };

      await registry.testRegisterAgent(remoteAgent);

      expect(registry.getDefinition('RemoteAgent')).toBeUndefined();
    });

    it('should merge runConfig overrides', async () => {
      const config = makeMockedConfig({
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
      const config = makeMockedConfig({
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
      const config = makeMockedConfig({
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

    it('should preserve lazy getters when applying overrides', async () => {
      let getterCalled = false;
      const agentWithGetter: LocalAgentDefinition = {
        ...MOCK_AGENT_V1,
        name: 'GetterAgent',
        get toolConfig() {
          getterCalled = true;
          return { tools: ['lazy-tool'] };
        },
      };

      const config = makeMockedConfig({
        agents: {
          overrides: {
            GetterAgent: {
              runConfig: { maxTurns: 100 },
            },
          },
        },
      });
      const registry = new TestableAgentRegistry(config);

      await registry.testRegisterAgent(agentWithGetter);

      const registeredDef = registry.getDefinition(
        'GetterAgent',
      ) as LocalAgentDefinition;

      expect(registeredDef.runConfig.maxTurns).toBe(100);
      expect(getterCalled).toBe(false); // Getter should not have been called yet
      expect(registeredDef.toolConfig?.tools).toEqual(['lazy-tool']);
      expect(getterCalled).toBe(true); // Getter should have been called now
    });
  });
});
