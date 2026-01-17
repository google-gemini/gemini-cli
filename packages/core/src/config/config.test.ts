/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import type { ConfigParameters, SandboxConfig } from './config.js';
import { Config, DEFAULT_FILE_FILTERING_OPTIONS } from './config.js';
import { ExperimentFlags } from '../code_assist/experiments/flagNames.js';
import { debugLogger } from '../utils/debugLogger.js';
import { ApprovalMode } from '../policy/types.js';
import type { HookDefinition } from '../hooks/types.js';
import { HookType, HookEventName } from '../hooks/types.js';
import * as path from 'node:path';
import { setGeminiMdFilename as mockSetGeminiMdFilename } from '../tools/memoryTool.js';
import {
  DEFAULT_TELEMETRY_TARGET,
  DEFAULT_OTLP_ENDPOINT,
} from '../telemetry/index.js';
import type { ContentGeneratorConfig } from '../core/contentGenerator.js';
import {
  AuthType,
  createContentGeneratorConfig,
} from '../core/contentGenerator.js';
import { GeminiClient } from '../core/client.js';
import { GitService } from '../services/gitService.js';
import { ShellTool } from '../tools/shell.js';
import { ReadFileTool } from '../tools/read-file.js';
import { GrepTool } from '../tools/grep.js';
import { RipGrepTool, canUseRipgrep } from '../tools/ripGrep.js';
import { logRipgrepFallback } from '../telemetry/loggers.js';
import { RipgrepFallbackEvent } from '../telemetry/types.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { ACTIVATE_SKILL_TOOL_NAME } from '../tools/tool-names.js';
import type { SkillDefinition } from '../skills/skillLoader.js';
import { DEFAULT_MODEL_CONFIGS } from './defaultModelConfigs.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
} from './models.js';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    statSync: vi.fn().mockReturnValue({
      isDirectory: vi.fn().mockReturnValue(true),
    }),
    realpathSync: vi.fn((path) => path),
  };
});

// Mock dependencies that might be called during Config construction or createServerConfig
vi.mock('../tools/tool-registry', () => {
  const ToolRegistryMock = vi.fn();
  ToolRegistryMock.prototype.registerTool = vi.fn();
  ToolRegistryMock.prototype.unregisterTool = vi.fn();
  ToolRegistryMock.prototype.discoverAllTools = vi.fn();
  ToolRegistryMock.prototype.sortTools = vi.fn();
  ToolRegistryMock.prototype.getAllTools = vi.fn(() => []); // Mock methods if needed
  ToolRegistryMock.prototype.getTool = vi.fn();
  ToolRegistryMock.prototype.getFunctionDeclarations = vi.fn(() => []);
  return { ToolRegistry: ToolRegistryMock };
});

vi.mock('../tools/mcp-client-manager.js', () => ({
  McpClientManager: vi.fn().mockImplementation(() => ({
    startConfiguredMcpServers: vi.fn(),
    getMcpInstructions: vi.fn().mockReturnValue('MCP Instructions'),
  })),
}));

vi.mock('../utils/memoryDiscovery.js', () => ({
  loadServerHierarchicalMemory: vi.fn(),
}));

// Mock individual tools if their constructors are complex or have side effects
vi.mock('../tools/ls');
vi.mock('../tools/read-file');
vi.mock('../tools/grep.js');
vi.mock('../tools/ripGrep.js', () => ({
  canUseRipgrep: vi.fn(),
  RipGrepTool: class MockRipGrepTool {},
}));
vi.mock('../tools/glob');
vi.mock('../tools/edit');
vi.mock('../tools/shell');
vi.mock('../tools/write-file');
vi.mock('../tools/web-fetch');
vi.mock('../tools/read-many-files');
vi.mock('../tools/memoryTool', () => ({
  MemoryTool: vi.fn(),
  setGeminiMdFilename: vi.fn(),
  getCurrentGeminiMdFilename: vi.fn(() => 'GEMINI.md'), // Mock the original filename
  DEFAULT_CONTEXT_FILENAME: 'GEMINI.md',
  GEMINI_DIR: '.gemini',
}));

vi.mock('../core/contentGenerator.js');

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    stripThoughtsFromHistory: vi.fn(),
    isInitialized: vi.fn().mockReturnValue(false),
  })),
}));

vi.mock('../telemetry/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../telemetry/index.js')>();
  return {
    ...actual,
    initializeTelemetry: vi.fn(),
    uiTelemetryService: {
      getLastPromptTokenCount: vi.fn(),
    },
  };
});

vi.mock('../telemetry/loggers.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../telemetry/loggers.js')>();
  return {
    ...actual,
    logRipgrepFallback: vi.fn(),
  };
});

vi.mock('../services/gitService.js', () => {
  const GitServiceMock = vi.fn();
  GitServiceMock.prototype.initialize = vi.fn();
  return { GitService: GitServiceMock };
});

vi.mock('../ide/ide-client.js', () => ({
  IdeClient: {
    getInstance: vi.fn().mockResolvedValue({
      getConnectionStatus: vi.fn(),
      initialize: vi.fn(),
      shutdown: vi.fn(),
    }),
  },
}));

vi.mock('../agents/registry.js', () => {
  const AgentRegistryMock = vi.fn();
  AgentRegistryMock.prototype.initialize = vi.fn();
  AgentRegistryMock.prototype.getAllDefinitions = vi.fn(() => []);
  AgentRegistryMock.prototype.getDefinition = vi.fn();
  return { AgentRegistry: AgentRegistryMock };
});

vi.mock('../agents/delegate-to-agent-tool.js', () => ({
  DelegateToAgentTool: vi.fn(),
}));

vi.mock('../resources/resource-registry.js', () => ({
  ResourceRegistry: vi.fn(),
}));

const mockCoreEvents = vi.hoisted(() => ({
  emitFeedback: vi.fn(),
  emitModelChanged: vi.fn(),
  emitConsoleLog: vi.fn(),
  on: vi.fn(),
}));

const mockSetGlobalProxy = vi.hoisted(() => vi.fn());

vi.mock('../utils/events.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/events.js')>();
  return {
    ...actual,
    coreEvents: mockCoreEvents,
  };
});

vi.mock('../utils/fetch.js', () => ({
  setGlobalProxy: mockSetGlobalProxy,
}));

vi.mock('../services/contextManager.js');

import { BaseLlmClient } from '../core/baseLlmClient.js';
import { tokenLimit } from '../core/tokenLimits.js';
import { uiTelemetryService } from '../telemetry/index.js';
import { getCodeAssistServer } from '../code_assist/codeAssist.js';
import { getExperiments } from '../code_assist/experiments/experiments.js';
import type { CodeAssistServer } from '../code_assist/server.js';
import { ContextManager } from '../services/contextManager.js';

vi.mock('../core/baseLlmClient.js');
vi.mock('../core/tokenLimits.js', () => ({
  tokenLimit: vi.fn(),
}));
vi.mock('../code_assist/codeAssist.js');
vi.mock('../code_assist/experiments/experiments.js');

describe('Server Config (config.ts)', () => {
  const MODEL = DEFAULT_GEMINI_MODEL;
  const SANDBOX: SandboxConfig = {
    command: 'docker',
    image: 'gemini-cli-sandbox',
  };
  const TARGET_DIR = '/path/to/target';
  const DEBUG_MODE = false;
  const QUESTION = 'test question';
  const USER_MEMORY = 'Test User Memory';
  const TELEMETRY_SETTINGS = { enabled: false };
  const EMBEDDING_MODEL = 'gemini-embedding';
  const SESSION_ID = 'test-session-id';
  const baseParams: ConfigParameters = {
    cwd: '/tmp',
    embeddingModel: EMBEDDING_MODEL,
    sandbox: SANDBOX,
    targetDir: TARGET_DIR,
    debugMode: DEBUG_MODE,
    question: QUESTION,
    userMemory: USER_MEMORY,
    telemetry: TELEMETRY_SETTINGS,
    sessionId: SESSION_ID,
    model: MODEL,
    usageStatisticsEnabled: false,
  };

  beforeEach(() => {
    // Reset mocks if necessary
    vi.clearAllMocks();
    vi.mocked(getExperiments).mockResolvedValue({
      experimentIds: [],
      flags: {},
    });
  });

  describe('initialize', () => {
    it('should throw an error if checkpointing is enabled and GitService fails', async () => {
      const gitError = new Error('Git is not installed');
      (GitService.prototype.initialize as Mock).mockRejectedValue(gitError);

      const config = new Config({
        ...baseParams,
        checkpointing: true,
      });

      await expect(config.initialize()).rejects.toThrow(gitError);
    });

    it('should not throw an error if checkpointing is disabled and GitService fails', async () => {
      const gitError = new Error('Git is not installed');
      (GitService.prototype.initialize as Mock).mockRejectedValue(gitError);

      const config = new Config({
        ...baseParams,
        checkpointing: false,
      });

      await expect(config.initialize()).resolves.toBeUndefined();
    });

    it('should throw an error if initialized more than once', async () => {
      const config = new Config({
        ...baseParams,
        checkpointing: false,
      });

      await expect(config.initialize()).resolves.toBeUndefined();
      await expect(config.initialize()).rejects.toThrow(
        'Config was already initialized',
      );
    });

    it('should not await MCP initialization', async () => {
      const config = new Config({
        ...baseParams,
        checkpointing: false,
      });

      const { McpClientManager } = await import(
        '../tools/mcp-client-manager.js'
      );
      let mcpStarted = false;

      (McpClientManager as unknown as Mock).mockImplementation(() => ({
        startConfiguredMcpServers: vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          mcpStarted = true;
        }),
        getMcpInstructions: vi.fn(),
      }));

      await config.initialize();

      // Should return immediately, before MCP finishes (50ms delay)
      expect(mcpStarted).toBe(false);

      // Wait for it to eventually finish to avoid open handles
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(mcpStarted).toBe(true);
    });

    describe('getCompressionThreshold', () => {
      it('should return the local compression threshold if it is set', async () => {
        const config = new Config({
          ...baseParams,
          compressionThreshold: 0.5,
        });
        expect(await config.getCompressionThreshold()).toBe(0.5);
      });

      it('should return the remote experiment threshold if it is a positive number', async () => {
        const config = new Config({
          ...baseParams,
          experiments: {
            flags: {
              [ExperimentFlags.CONTEXT_COMPRESSION_THRESHOLD]: {
                floatValue: 0.8,
              },
            },
          },
        } as unknown as ConfigParameters);
        expect(await config.getCompressionThreshold()).toBe(0.8);
      });

      it('should return undefined if the remote experiment threshold is 0', async () => {
        const config = new Config({
          ...baseParams,
          experiments: {
            flags: {
              [ExperimentFlags.CONTEXT_COMPRESSION_THRESHOLD]: {
                floatValue: 0.0,
              },
            },
          },
        } as unknown as ConfigParameters);
        expect(await config.getCompressionThreshold()).toBeUndefined();
      });

      it('should return undefined if there are no experiments', async () => {
        const config = new Config(baseParams);
        expect(await config.getCompressionThreshold()).toBeUndefined();
      });
    });

    describe('getUserCaching', () => {
      it('should return the remote experiment flag when available', async () => {
        const config = new Config({
          ...baseParams,
          experiments: {
            flags: {
              [ExperimentFlags.USER_CACHING]: {
                boolValue: true,
              },
            },
            experimentIds: [],
          },
        });
        expect(await config.getUserCaching()).toBe(true);
      });

      it('should return false when the remote flag is false', async () => {
        const config = new Config({
          ...baseParams,
          experiments: {
            flags: {
              [ExperimentFlags.USER_CACHING]: {
                boolValue: false,
              },
            },
            experimentIds: [],
          },
        });
        expect(await config.getUserCaching()).toBe(false);
      });

      it('should return undefined if there are no experiments', async () => {
        const config = new Config(baseParams);
        expect(await config.getUserCaching()).toBeUndefined();
      });
    });
  });

  describe('refreshAuth', () => {
    it('should refresh auth and update config', async () => {
      const config = new Config(baseParams);
      const authType = AuthType.USE_GEMINI;
      const mockContentConfig = {
        apiKey: 'test-key',
      };

      vi.mocked(createContentGeneratorConfig).mockResolvedValue(
        mockContentConfig,
      );

      await config.refreshAuth(authType);

      expect(createContentGeneratorConfig).toHaveBeenCalledWith(
        config,
        authType,
      );
      // Verify that contentGeneratorConfig is updated
      expect(config.getContentGeneratorConfig()).toEqual(mockContentConfig);
      expect(GeminiClient).toHaveBeenCalledWith(config);
    });

    it('should reset model availability status', async () => {
      const config = new Config(baseParams);
      const service = config.getModelAvailabilityService();
      const spy = vi.spyOn(service, 'reset');

      vi.mocked(createContentGeneratorConfig).mockImplementation(
        async (_: Config, authType: AuthType | undefined) =>
          ({ authType }) as unknown as ContentGeneratorConfig,
      );

      await config.refreshAuth(AuthType.USE_GEMINI);

      expect(spy).toHaveBeenCalled();
    });

    it('should strip thoughts when switching from GenAI to Vertex', async () => {
      const config = new Config(baseParams);

      vi.mocked(createContentGeneratorConfig).mockImplementation(
        async (_: Config, authType: AuthType | undefined) =>
          ({ authType }) as unknown as ContentGeneratorConfig,
      );

      await config.refreshAuth(AuthType.USE_GEMINI);

      await config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);

      expect(
        config.getGeminiClient().stripThoughtsFromHistory,
      ).toHaveBeenCalledWith();
    });

    it('should strip thoughts when switching from GenAI to Vertex AI', async () => {
      const config = new Config(baseParams);

      vi.mocked(createContentGeneratorConfig).mockImplementation(
        async (_: Config, authType: AuthType | undefined) =>
          ({ authType }) as unknown as ContentGeneratorConfig,
      );

      await config.refreshAuth(AuthType.USE_GEMINI);

      await config.refreshAuth(AuthType.USE_VERTEX_AI);

      expect(
        config.getGeminiClient().stripThoughtsFromHistory,
      ).toHaveBeenCalledWith();
    });

    it('should not strip thoughts when switching from Vertex to GenAI', async () => {
      const config = new Config(baseParams);

      vi.mocked(createContentGeneratorConfig).mockImplementation(
        async (_: Config, authType: AuthType | undefined) =>
          ({ authType }) as unknown as ContentGeneratorConfig,
      );

      await config.refreshAuth(AuthType.USE_VERTEX_AI);

      await config.refreshAuth(AuthType.USE_GEMINI);

      expect(
        config.getGeminiClient().stripThoughtsFromHistory,
      ).not.toHaveBeenCalledWith();
    });
  });

  describe('Preview Features Logic in refreshAuth', () => {
    beforeEach(() => {
      // Set up default mock behavior for these functions before each test
      vi.mocked(getCodeAssistServer).mockReturnValue(undefined);
      vi.mocked(getExperiments).mockResolvedValue({
        flags: {},
        experimentIds: [],
      });
    });

    it('should enable preview features for Google auth when remote flag is true', async () => {
      // Override the default mock for this specific test
      vi.mocked(getCodeAssistServer).mockReturnValue({} as CodeAssistServer); // Simulate Google auth by returning a truthy value
      vi.mocked(getExperiments).mockResolvedValue({
        flags: {
          [ExperimentFlags.ENABLE_PREVIEW]: { boolValue: true },
        },
        experimentIds: [],
      });
      const config = new Config({ ...baseParams, previewFeatures: undefined });
      await config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);
      expect(config.getPreviewFeatures()).toBe(true);
    });

    it('should disable preview features for Google auth when remote flag is false', async () => {
      // Override the default mock
      vi.mocked(getCodeAssistServer).mockReturnValue({} as CodeAssistServer);
      vi.mocked(getExperiments).mockResolvedValue({
        flags: {
          [ExperimentFlags.ENABLE_PREVIEW]: { boolValue: false },
        },
        experimentIds: [],
      });
      const config = new Config({ ...baseParams, previewFeatures: undefined });
      await config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);
      expect(config.getPreviewFeatures()).toBe(undefined);
    });

    it('should disable preview features for Google auth when remote flag is missing', async () => {
      // Override the default mock for getCodeAssistServer, the getExperiments mock is already correct
      vi.mocked(getCodeAssistServer).mockReturnValue({} as CodeAssistServer);
      const config = new Config({ ...baseParams, previewFeatures: undefined });
      await config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);
      expect(config.getPreviewFeatures()).toBe(undefined);
    });

    it('should not change preview features or model if it is already set to true', async () => {
      const initialModel = 'some-other-model';
      const config = new Config({
        ...baseParams,
        previewFeatures: true,
        model: initialModel,
      });
      // It doesn't matter which auth method we use here, the logic should exit early
      await config.refreshAuth(AuthType.USE_GEMINI);
      expect(config.getPreviewFeatures()).toBe(true);
      expect(config.getModel()).toBe(initialModel);
    });

    it('should not change preview features or model if it is already set to false', async () => {
      const initialModel = 'some-other-model';
      const config = new Config({
        ...baseParams,
        previewFeatures: false,
        model: initialModel,
      });
      await config.refreshAuth(AuthType.USE_GEMINI);
      expect(config.getPreviewFeatures()).toBe(false);
      expect(config.getModel()).toBe(initialModel);
    });
  });

  it('Config constructor should store userMemory correctly', () => {
    const config = new Config(baseParams);

    expect(config.getUserMemory()).toBe(USER_MEMORY);
    // Verify other getters if needed
    expect(config.getTargetDir()).toBe(path.resolve(TARGET_DIR)); // Check resolved path
  });

  it('Config constructor should default userMemory to empty string if not provided', () => {
    const paramsWithoutMemory: ConfigParameters = { ...baseParams };
    delete paramsWithoutMemory.userMemory;
    const config = new Config(paramsWithoutMemory);

    expect(config.getUserMemory()).toBe('');
  });

  it('Config constructor should call setGeminiMdFilename with contextFileName if provided', () => {
    const contextFileName = 'CUSTOM_AGENTS.md';
    const paramsWithContextFile: ConfigParameters = {
      ...baseParams,
      contextFileName,
    };
    new Config(paramsWithContextFile);
    expect(mockSetGeminiMdFilename).toHaveBeenCalledWith(contextFileName);
  });

  it('Config constructor should not call setGeminiMdFilename if contextFileName is not provided', () => {
    new Config(baseParams); // baseParams does not have contextFileName
    expect(mockSetGeminiMdFilename).not.toHaveBeenCalled();
  });

  it('should set default file filtering settings when not provided', () => {
    const config = new Config(baseParams);
    expect(config.getFileFilteringRespectGitIgnore()).toBe(
      DEFAULT_FILE_FILTERING_OPTIONS.respectGitIgnore,
    );
  });

  it('should set custom file filtering settings when provided', () => {
    const paramsWithFileFiltering: ConfigParameters = {
      ...baseParams,
      fileFiltering: {
        respectGitIgnore: false,
      },
    };
    const config = new Config(paramsWithFileFiltering);
    expect(config.getFileFilteringRespectGitIgnore()).toBe(false);
  });

  it('should initialize WorkspaceContext with includeDirectories', () => {
    const includeDirectories = ['dir1', 'dir2'];
    const paramsWithIncludeDirs: ConfigParameters = {
      ...baseParams,
      includeDirectories,
    };
    const config = new Config(paramsWithIncludeDirs);
    const workspaceContext = config.getWorkspaceContext();
    const directories = workspaceContext.getDirectories();

    // Should include only the target directory initially
    expect(directories).toHaveLength(1);
    expect(directories).toContain(path.resolve(baseParams.targetDir));

    // The other directories should be in the pending list
    expect(config.getPendingIncludeDirectories()).toEqual(includeDirectories);
  });

  it('Config constructor should set telemetry to true when provided as true', () => {
    const paramsWithTelemetry: ConfigParameters = {
      ...baseParams,
      telemetry: { enabled: true },
    };
    const config = new Config(paramsWithTelemetry);
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('Config constructor should set telemetry to false when provided as false', () => {
    const paramsWithTelemetry: ConfigParameters = {
      ...baseParams,
      telemetry: { enabled: false },
    };
    const config = new Config(paramsWithTelemetry);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('Config constructor should default telemetry to default value if not provided', () => {
    const paramsWithoutTelemetry: ConfigParameters = { ...baseParams };
    delete paramsWithoutTelemetry.telemetry;
    const config = new Config(paramsWithoutTelemetry);
    expect(config.getTelemetryEnabled()).toBe(TELEMETRY_SETTINGS.enabled);
  });

  it('Config constructor should set telemetry useCollector to true when provided', () => {
    const paramsWithTelemetry: ConfigParameters = {
      ...baseParams,
      telemetry: { enabled: true, useCollector: true },
    };
    const config = new Config(paramsWithTelemetry);
    expect(config.getTelemetryUseCollector()).toBe(true);
  });

  it('Config constructor should set telemetry useCollector to false when provided', () => {
    const paramsWithTelemetry: ConfigParameters = {
      ...baseParams,
      telemetry: { enabled: true, useCollector: false },
    };
    const config = new Config(paramsWithTelemetry);
    expect(config.getTelemetryUseCollector()).toBe(false);
  });

  it('Config constructor should default telemetry useCollector to false if not provided', () => {
    const paramsWithTelemetry: ConfigParameters = {
      ...baseParams,
      telemetry: { enabled: true },
    };
    const config = new Config(paramsWithTelemetry);
    expect(config.getTelemetryUseCollector()).toBe(false);
  });

  it('should have a getFileService method that returns FileDiscoveryService', () => {
    const config = new Config(baseParams);
    const fileService = config.getFileService();
    expect(fileService).toBeDefined();
  });

  describe('Usage Statistics', () => {
    it('defaults usage statistics to enabled if not specified', () => {
      const config = new Config({
        ...baseParams,
        usageStatisticsEnabled: undefined,
      });

      expect(config.getUsageStatisticsEnabled()).toBe(true);
    });

    it.each([{ enabled: true }, { enabled: false }])(
      'sets usage statistics based on the provided value (enabled: $enabled)',
      ({ enabled }) => {
        const config = new Config({
          ...baseParams,
          usageStatisticsEnabled: enabled,
        });
        expect(config.getUsageStatisticsEnabled()).toBe(enabled);
      },
    );
  });

  describe('Telemetry Settings', () => {
    it('should return default telemetry target if not provided', () => {
      const params: ConfigParameters = {
        ...baseParams,
        telemetry: { enabled: true },
      };
      const config = new Config(params);
      expect(config.getTelemetryTarget()).toBe(DEFAULT_TELEMETRY_TARGET);
    });

    it('should return provided OTLP endpoint', () => {
      const endpoint = 'http://custom.otel.collector:4317';
      const params: ConfigParameters = {
        ...baseParams,
        telemetry: { enabled: true, otlpEndpoint: endpoint },
      };
      const config = new Config(params);
      expect(config.getTelemetryOtlpEndpoint()).toBe(endpoint);
    });

    it('should return default OTLP endpoint if not provided', () => {
      const params: ConfigParameters = {
        ...baseParams,
        telemetry: { enabled: true },
      };
      const config = new Config(params);
      expect(config.getTelemetryOtlpEndpoint()).toBe(DEFAULT_OTLP_ENDPOINT);
    });

    it('should return provided logPrompts setting', () => {
      const params: ConfigParameters = {
        ...baseParams,
        telemetry: { enabled: true, logPrompts: false },
      };
      const config = new Config(params);
      expect(config.getTelemetryLogPromptsEnabled()).toBe(false);
    });

    it('should return default logPrompts setting (true) if not provided', () => {
      const params: ConfigParameters = {
        ...baseParams,
        telemetry: { enabled: true },
      };
      const config = new Config(params);
      expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
    });

    it('should return default logPrompts setting (true) if telemetry object is not provided', () => {
      const paramsWithoutTelemetry: ConfigParameters = { ...baseParams };
      delete paramsWithoutTelemetry.telemetry;
      const config = new Config(paramsWithoutTelemetry);
      expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
    });

    it('should return default telemetry target if telemetry object is not provided', () => {
      const paramsWithoutTelemetry: ConfigParameters = { ...baseParams };
      delete paramsWithoutTelemetry.telemetry;
      const config = new Config(paramsWithoutTelemetry);
      expect(config.getTelemetryTarget()).toBe(DEFAULT_TELEMETRY_TARGET);
    });

    it('should return default OTLP endpoint if telemetry object is not provided', () => {
      const paramsWithoutTelemetry: ConfigParameters = { ...baseParams };
      delete paramsWithoutTelemetry.telemetry;
      const config = new Config(paramsWithoutTelemetry);
      expect(config.getTelemetryOtlpEndpoint()).toBe(DEFAULT_OTLP_ENDPOINT);
    });

    it('should return provided OTLP protocol', () => {
      const params: ConfigParameters = {
        ...baseParams,
        telemetry: { enabled: true, otlpProtocol: 'http' },
      };
      const config = new Config(params);
      expect(config.getTelemetryOtlpProtocol()).toBe('http');
    });

    it('should return default OTLP protocol if not provided', () => {
      const params: ConfigParameters = {
        ...baseParams,
        telemetry: { enabled: true },
      };
      const config = new Config(params);
      expect(config.getTelemetryOtlpProtocol()).toBe('grpc');
    });

    it('should return default OTLP protocol if telemetry object is not provided', () => {
      const paramsWithoutTelemetry: ConfigParameters = { ...baseParams };
      delete paramsWithoutTelemetry.telemetry;
      const config = new Config(paramsWithoutTelemetry);
      expect(config.getTelemetryOtlpProtocol()).toBe('grpc');
    });
  });

  describe('UseRipgrep Configuration', () => {
    it('should default useRipgrep to true when not provided', () => {
      const config = new Config(baseParams);
      expect(config.getUseRipgrep()).toBe(true);
    });

    it('should set useRipgrep to false when provided as false', () => {
      const paramsWithRipgrep: ConfigParameters = {
        ...baseParams,
        useRipgrep: false,
      };
      const config = new Config(paramsWithRipgrep);
      expect(config.getUseRipgrep()).toBe(false);
    });

    it('should set useRipgrep to true when explicitly provided as true', () => {
      const paramsWithRipgrep: ConfigParameters = {
        ...baseParams,
        useRipgrep: true,
      };
      const config = new Config(paramsWithRipgrep);
      expect(config.getUseRipgrep()).toBe(true);
    });

    it('should default useRipgrep to true when undefined', () => {
      const paramsWithUndefinedRipgrep: ConfigParameters = {
        ...baseParams,
        useRipgrep: undefined,
      };
      const config = new Config(paramsWithUndefinedRipgrep);
      expect(config.getUseRipgrep()).toBe(true);
    });
  });

  describe('UseWriteTodos Configuration', () => {
    it('should default useWriteTodos to true when not provided', () => {
      const config = new Config(baseParams);
      expect(config.getUseWriteTodos()).toBe(true);
    });

    it('should set useWriteTodos to false when provided as false', () => {
      const params: ConfigParameters = {
        ...baseParams,
        useWriteTodos: false,
      };
      const config = new Config(params);
      expect(config.getUseWriteTodos()).toBe(false);
    });

    it('should disable useWriteTodos for preview models', () => {
      const params: ConfigParameters = {
        ...baseParams,
        model: 'gemini-3-pro-preview',
      };
      const config = new Config(params);
      expect(config.getUseWriteTodos()).toBe(false);
    });

    it('should NOT disable useWriteTodos for non-preview models', () => {
      const params: ConfigParameters = {
        ...baseParams,
        model: 'gemini-2.5-pro',
      };
      const config = new Config(params);
      expect(config.getUseWriteTodos()).toBe(true);
    });
  });

  describe('Shell Tool Inactivity Timeout', () => {
    it('should default to 300000ms (300 seconds) when not provided', () => {
      const config = new Config(baseParams);
      expect(config.getShellToolInactivityTimeout()).toBe(300000);
    });

    it('should convert provided seconds to milliseconds', () => {
      const params: ConfigParameters = {
        ...baseParams,
        shellToolInactivityTimeout: 10, // 10 seconds
      };
      const config = new Config(params);
      expect(config.getShellToolInactivityTimeout()).toBe(10000);
    });
  });

  describe('ContinueOnFailedApiCall Configuration', () => {
    it('should default continueOnFailedApiCall to false when not provided', () => {
      const config = new Config(baseParams);
      expect(config.getContinueOnFailedApiCall()).toBe(true);
    });

    it('should set continueOnFailedApiCall to true when provided as true', () => {
      const paramsWithContinueOnFailedApiCall: ConfigParameters = {
        ...baseParams,
        continueOnFailedApiCall: true,
      };
      const config = new Config(paramsWithContinueOnFailedApiCall);
      expect(config.getContinueOnFailedApiCall()).toBe(true);
    });

    it('should set continueOnFailedApiCall to false when explicitly provided as false', () => {
      const paramsWithContinueOnFailedApiCall: ConfigParameters = {
        ...baseParams,
        continueOnFailedApiCall: false,
      };
      const config = new Config(paramsWithContinueOnFailedApiCall);
      expect(config.getContinueOnFailedApiCall()).toBe(false);
    });
  });

  describe('createToolRegistry', () => {
    it('should register a tool if coreTools contains an argument-specific pattern', async () => {
      const params: ConfigParameters = {
        ...baseParams,
        coreTools: ['ShellTool(git status)'],
      };
      const config = new Config(params);
      await config.initialize();

      // The ToolRegistry class is mocked, so we can inspect its prototype's methods.
      const registerToolMock = (
        (await vi.importMock('../tools/tool-registry')) as {
          ToolRegistry: { prototype: { registerTool: Mock } };
        }
      ).ToolRegistry.prototype.registerTool;

      // Check that registerTool was called for ShellTool
      const wasShellToolRegistered = registerToolMock.mock.calls.some(
        (call) => call[0] instanceof vi.mocked(ShellTool),
      );
      expect(wasShellToolRegistered).toBe(true);

      // Check that registerTool was NOT called for ReadFileTool
      const wasReadFileToolRegistered = registerToolMock.mock.calls.some(
        (call) => call[0] instanceof vi.mocked(ReadFileTool),
      );
      expect(wasReadFileToolRegistered).toBe(false);
    });

    it('should register subagents as tools when codebaseInvestigatorSettings.enabled is true', async () => {
      const params: ConfigParameters = {
        ...baseParams,
        codebaseInvestigatorSettings: { enabled: true },
      };
      const config = new Config(params);

      const mockAgentDefinition = {
        name: 'codebase-investigator',
        description: 'Agent 1',
        instructions: 'Inst 1',
      };

      const AgentRegistryMock = (
        (await vi.importMock('../agents/registry.js')) as {
          AgentRegistry: Mock;
        }
      ).AgentRegistry;
      AgentRegistryMock.prototype.getDefinition.mockReturnValue(
        mockAgentDefinition,
      );

      const DelegateToAgentToolMock = (
        (await vi.importMock('../agents/delegate-to-agent-tool.js')) as {
          DelegateToAgentTool: Mock;
        }
      ).DelegateToAgentTool;

      await config.initialize();

      const registerToolMock = (
        (await vi.importMock('../tools/tool-registry')) as {
          ToolRegistry: { prototype: { registerTool: Mock } };
        }
      ).ToolRegistry.prototype.registerTool;

      expect(DelegateToAgentToolMock).toHaveBeenCalledTimes(1);
      expect(DelegateToAgentToolMock).toHaveBeenCalledWith(
        expect.anything(), // AgentRegistry
        config,
        expect.anything(), // MessageBus
      );

      const calls = registerToolMock.mock.calls;
      const registeredWrappers = calls.filter(
        (call) => call[0] instanceof DelegateToAgentToolMock,
      );
      expect(registeredWrappers).toHaveLength(1);
    });

    it('should not register subagents as tools when codebaseInvestigatorSettings.enabled is false', async () => {
      const params: ConfigParameters = {
        ...baseParams,
        codebaseInvestigatorSettings: { enabled: false },
        cliHelpAgentSettings: { enabled: false },
      };
      const config = new Config(params);

      const DelegateToAgentToolMock = (
        (await vi.importMock('../agents/delegate-to-agent-tool.js')) as {
          DelegateToAgentTool: Mock;
        }
      ).DelegateToAgentTool;

      await config.initialize();

      expect(DelegateToAgentToolMock).not.toHaveBeenCalled();
    });

    it('should not set default codebase investigator model in config (defaults in registry)', () => {
      const config = new Config(baseParams);
      expect(config.getCodebaseInvestigatorSettings()?.model).toBeUndefined();
    });

    describe('with minified tool class names', () => {
      beforeEach(() => {
        Object.defineProperty(
          vi.mocked(ShellTool).prototype.constructor,
          'name',
          {
            value: '_ShellTool',
            configurable: true,
          },
        );
      });

      afterEach(() => {
        Object.defineProperty(
          vi.mocked(ShellTool).prototype.constructor,
          'name',
          {
            value: 'ShellTool',
          },
        );
      });

      it('should register a tool if coreTools contains the non-minified class name', async () => {
        const params: ConfigParameters = {
          ...baseParams,
          coreTools: ['ShellTool'],
        };
        const config = new Config(params);
        await config.initialize();

        const registerToolMock = (
          (await vi.importMock('../tools/tool-registry')) as {
            ToolRegistry: { prototype: { registerTool: Mock } };
          }
        ).ToolRegistry.prototype.registerTool;

        const wasShellToolRegistered = registerToolMock.mock.calls.some(
          (call) => call[0] instanceof vi.mocked(ShellTool),
        );
        expect(wasShellToolRegistered).toBe(true);
      });

      it('should register a tool if coreTools contains an argument-specific pattern with the non-minified class name', async () => {
        const params: ConfigParameters = {
          ...baseParams,
          coreTools: ['ShellTool(git status)'],
        };
        const config = new Config(params);
        await config.initialize();

        const registerToolMock = (
          (await vi.importMock('../tools/tool-registry')) as {
            ToolRegistry: { prototype: { registerTool: Mock } };
          }
        ).ToolRegistry.prototype.registerTool;

        const wasShellToolRegistered = registerToolMock.mock.calls.some(
          (call) => call[0] instanceof vi.mocked(ShellTool),
        );
        expect(wasShellToolRegistered).toBe(true);
      });
    });
  });

  describe('getTruncateToolOutputThreshold', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return the calculated threshold when it is smaller than the default', () => {
      const config = new Config(baseParams);
      vi.mocked(tokenLimit).mockReturnValue(32000);
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        1000,
      );
      // 4 * (32000 - 1000) = 4 * 31000 = 124000
      // default is 4_000_000
      expect(config.getTruncateToolOutputThreshold()).toBe(124000);
    });

    it('should return the default threshold when the calculated value is larger', () => {
      const config = new Config(baseParams);
      vi.mocked(tokenLimit).mockReturnValue(2_000_000);
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        500_000,
      );
      // 4 * (2_000_000 - 500_000) = 4 * 1_500_000 = 6_000_000
      // default is 4_000_000
      expect(config.getTruncateToolOutputThreshold()).toBe(4_000_000);
    });

    it('should use a custom truncateToolOutputThreshold if provided', () => {
      const customParams = {
        ...baseParams,
        truncateToolOutputThreshold: 50000,
      };
      const config = new Config(customParams);
      vi.mocked(tokenLimit).mockReturnValue(8000);
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        2000,
      );
      // 4 * (8000 - 2000) = 4 * 6000 = 24000
      // custom threshold is 50000
      expect(config.getTruncateToolOutputThreshold()).toBe(24000);

      vi.mocked(tokenLimit).mockReturnValue(32000);
      vi.mocked(uiTelemetryService.getLastPromptTokenCount).mockReturnValue(
        1000,
      );
      // 4 * (32000 - 1000) = 124000
      // custom threshold is 50000
      expect(config.getTruncateToolOutputThreshold()).toBe(50000);
    });
  });

  describe('Proxy Configuration Error Handling', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should call setGlobalProxy when proxy is configured', () => {
      const paramsWithProxy: ConfigParameters = {
        ...baseParams,
        proxy: 'http://proxy.example.com:8080',
      };
      new Config(paramsWithProxy);

      expect(mockSetGlobalProxy).toHaveBeenCalledWith(
        'http://proxy.example.com:8080',
      );
    });

    it('should not call setGlobalProxy when proxy is not configured', () => {
      new Config(baseParams);

      expect(mockSetGlobalProxy).not.toHaveBeenCalled();
    });

    it('should emit error feedback when setGlobalProxy throws an error', () => {
      const proxyError = new Error('Invalid proxy URL');
      mockSetGlobalProxy.mockImplementation(() => {
        throw proxyError;
      });

      const paramsWithProxy: ConfigParameters = {
        ...baseParams,
        proxy: 'invalid-proxy',
      };
      new Config(paramsWithProxy);

      expect(mockCoreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        'Invalid proxy configuration detected. Check debug drawer for more details (F12)',
        proxyError,
      );
    });

    it('should not emit error feedback when setGlobalProxy succeeds', () => {
      mockSetGlobalProxy.mockImplementation(() => {
        // Success - no error thrown
      });

      const paramsWithProxy: ConfigParameters = {
        ...baseParams,
        proxy: 'http://proxy.example.com:8080',
      };
      new Config(paramsWithProxy);

      expect(mockCoreEvents.emitFeedback).not.toHaveBeenCalled();
    });
  });
});

describe('setApprovalMode with folder trust', () => {
  const baseParams: ConfigParameters = {
    sessionId: 'test',
    targetDir: '.',
    debugMode: false,
    model: 'test-model',
    cwd: '.',
  };

  it('should throw an error when setting YOLO mode in an untrusted folder', () => {
    const config = new Config(baseParams);
    vi.spyOn(config, 'isTrustedFolder').mockReturnValue(false);
    expect(() => config.setApprovalMode(ApprovalMode.YOLO)).toThrow(
      'Cannot enable privileged approval modes in an untrusted folder.',
    );
  });

  it('should throw an error when setting AUTO_EDIT mode in an untrusted folder', () => {
    const config = new Config(baseParams);
    vi.spyOn(config, 'isTrustedFolder').mockReturnValue(false);
    expect(() => config.setApprovalMode(ApprovalMode.AUTO_EDIT)).toThrow(
      'Cannot enable privileged approval modes in an untrusted folder.',
    );
  });

  it('should NOT throw an error when setting DEFAULT mode in an untrusted folder', () => {
    const config = new Config(baseParams);
    vi.spyOn(config, 'isTrustedFolder').mockReturnValue(false);
    expect(() => config.setApprovalMode(ApprovalMode.DEFAULT)).not.toThrow();
  });

  it('should NOT throw an error when setting any mode in a trusted folder', () => {
    const config = new Config(baseParams);
    vi.spyOn(config, 'isTrustedFolder').mockReturnValue(true);
    expect(() => config.setApprovalMode(ApprovalMode.YOLO)).not.toThrow();
    expect(() => config.setApprovalMode(ApprovalMode.AUTO_EDIT)).not.toThrow();
    expect(() => config.setApprovalMode(ApprovalMode.DEFAULT)).not.toThrow();
  });

  it('should NOT throw an error when setting any mode if trustedFolder is undefined', () => {
    const config = new Config(baseParams);
    vi.spyOn(config, 'isTrustedFolder').mockReturnValue(true); // isTrustedFolder defaults to true
    expect(() => config.setApprovalMode(ApprovalMode.YOLO)).not.toThrow();
    expect(() => config.setApprovalMode(ApprovalMode.AUTO_EDIT)).not.toThrow();
    expect(() => config.setApprovalMode(ApprovalMode.DEFAULT)).not.toThrow();
  });

  describe('registerCoreTools', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should register RipGrepTool when useRipgrep is true and it is available', async () => {
      (canUseRipgrep as Mock).mockResolvedValue(true);
      const config = new Config({ ...baseParams, useRipgrep: true });
      await config.initialize();

      const calls = (ToolRegistry.prototype.registerTool as Mock).mock.calls;
      const wasRipGrepRegistered = calls.some(
        (call) => call[0] instanceof vi.mocked(RipGrepTool),
      );
      const wasGrepRegistered = calls.some(
        (call) => call[0] instanceof vi.mocked(GrepTool),
      );

      expect(wasRipGrepRegistered).toBe(true);
      expect(wasGrepRegistered).toBe(false);
      expect(logRipgrepFallback).not.toHaveBeenCalled();
    });

    it('should register GrepTool as a fallback when useRipgrep is true but it is not available', async () => {
      (canUseRipgrep as Mock).mockResolvedValue(false);
      const config = new Config({ ...baseParams, useRipgrep: true });
      await config.initialize();

      const calls = (ToolRegistry.prototype.registerTool as Mock).mock.calls;
      const wasRipGrepRegistered = calls.some(
        (call) => call[0] instanceof vi.mocked(RipGrepTool),
      );
      const wasGrepRegistered = calls.some(
        (call) => call[0] instanceof vi.mocked(GrepTool),
      );

      expect(wasRipGrepRegistered).toBe(false);
      expect(wasGrepRegistered).toBe(true);
      expect(logRipgrepFallback).toHaveBeenCalledWith(
        config,
        expect.any(RipgrepFallbackEvent),
      );
      const event = (logRipgrepFallback as Mock).mock.calls[0][1];
      expect(event.error).toBeUndefined();
    });

    it('should register GrepTool as a fallback when canUseRipgrep throws an error', async () => {
      const error = new Error('ripGrep check failed');
      (canUseRipgrep as Mock).mockRejectedValue(error);
      const config = new Config({ ...baseParams, useRipgrep: true });
      await config.initialize();

      const calls = (ToolRegistry.prototype.registerTool as Mock).mock.calls;
      const wasRipGrepRegistered = calls.some(
        (call) => call[0] instanceof vi.mocked(RipGrepTool),
      );
      const wasGrepRegistered = calls.some(
        (call) => call[0] instanceof vi.mocked(GrepTool),
      );

      expect(wasRipGrepRegistered).toBe(false);
      expect(wasGrepRegistered).toBe(true);
      expect(logRipgrepFallback).toHaveBeenCalledWith(
        config,
        expect.any(RipgrepFallbackEvent),
      );
      const event = (logRipgrepFallback as Mock).mock.calls[0][1];
      expect(event.error).toBe(String(error));
    });

    it('should register GrepTool when useRipgrep is false', async () => {
      const config = new Config({ ...baseParams, useRipgrep: false });
      await config.initialize();

      const calls = (ToolRegistry.prototype.registerTool as Mock).mock.calls;
      const wasRipGrepRegistered = calls.some(
        (call) => call[0] instanceof vi.mocked(RipGrepTool),
      );
      const wasGrepRegistered = calls.some(
        (call) => call[0] instanceof vi.mocked(GrepTool),
      );

      expect(wasRipGrepRegistered).toBe(false);
      expect(wasGrepRegistered).toBe(true);
      expect(canUseRipgrep).not.toHaveBeenCalled();
      expect(logRipgrepFallback).not.toHaveBeenCalled();
    });
  });
});

describe('isYoloModeDisabled', () => {
  const baseParams: ConfigParameters = {
    sessionId: 'test',
    targetDir: '.',
    debugMode: false,
    model: 'test-model',
    cwd: '.',
  };

  it('should return false when yolo mode is not disabled and folder is trusted', () => {
    const config = new Config(baseParams);
    vi.spyOn(config, 'isTrustedFolder').mockReturnValue(true);
    expect(config.isYoloModeDisabled()).toBe(false);
  });

  it('should return true when yolo mode is disabled by parameter', () => {
    const config = new Config({ ...baseParams, disableYoloMode: true });
    vi.spyOn(config, 'isTrustedFolder').mockReturnValue(true);
    expect(config.isYoloModeDisabled()).toBe(true);
  });

  it('should return true when folder is untrusted', () => {
    const config = new Config(baseParams);
    vi.spyOn(config, 'isTrustedFolder').mockReturnValue(false);
    expect(config.isYoloModeDisabled()).toBe(true);
  });

  it('should return true when yolo is disabled and folder is untrusted', () => {
    const config = new Config({ ...baseParams, disableYoloMode: true });
    vi.spyOn(config, 'isTrustedFolder').mockReturnValue(false);
    expect(config.isYoloModeDisabled()).toBe(true);
  });
});

describe('BaseLlmClient Lifecycle', () => {
  const MODEL = 'gemini-pro';
  const SANDBOX: SandboxConfig = {
    command: 'docker',
    image: 'gemini-cli-sandbox',
  };
  const TARGET_DIR = '/path/to/target';
  const DEBUG_MODE = false;
  const QUESTION = 'test question';
  const USER_MEMORY = 'Test User Memory';
  const TELEMETRY_SETTINGS = { enabled: false };
  const EMBEDDING_MODEL = 'gemini-embedding';
  const SESSION_ID = 'test-session-id';
  const baseParams: ConfigParameters = {
    cwd: '/tmp',
    embeddingModel: EMBEDDING_MODEL,
    sandbox: SANDBOX,
    targetDir: TARGET_DIR,
    debugMode: DEBUG_MODE,
    question: QUESTION,
    userMemory: USER_MEMORY,
    telemetry: TELEMETRY_SETTINGS,
    sessionId: SESSION_ID,
    model: MODEL,
    usageStatisticsEnabled: false,
  };

  it('should throw an error if getBaseLlmClient is called before refreshAuth', () => {
    const config = new Config(baseParams);
    expect(() => config.getBaseLlmClient()).toThrow(
      'BaseLlmClient not initialized. Ensure authentication has occurred and ContentGenerator is ready.',
    );
  });

  it('should successfully initialize BaseLlmClient after refreshAuth is called', async () => {
    const config = new Config(baseParams);
    const authType = AuthType.USE_GEMINI;
    const mockContentConfig = { model: 'gemini-flash', apiKey: 'test-key' };

    vi.mocked(createContentGeneratorConfig).mockResolvedValue(
      mockContentConfig,
    );

    await config.refreshAuth(authType);

    // Should not throw
    const llmService = config.getBaseLlmClient();
    expect(llmService).toBeDefined();
    expect(BaseLlmClient).toHaveBeenCalledWith(
      config.getContentGenerator(),
      config,
    );
  });
});

describe('Generation Config Merging (HACK)', () => {
  const MODEL = 'gemini-pro';
  const SANDBOX: SandboxConfig = {
    command: 'docker',
    image: 'gemini-cli-sandbox',
  };
  const TARGET_DIR = '/path/to/target';
  const DEBUG_MODE = false;
  const QUESTION = 'test question';
  const USER_MEMORY = 'Test User Memory';
  const TELEMETRY_SETTINGS = { enabled: false };
  const EMBEDDING_MODEL = 'gemini-embedding';
  const SESSION_ID = 'test-session-id';
  const baseParams: ConfigParameters = {
    cwd: '/tmp',
    embeddingModel: EMBEDDING_MODEL,
    sandbox: SANDBOX,
    targetDir: TARGET_DIR,
    debugMode: DEBUG_MODE,
    question: QUESTION,
    userMemory: USER_MEMORY,
    telemetry: TELEMETRY_SETTINGS,
    sessionId: SESSION_ID,
    model: MODEL,
    usageStatisticsEnabled: false,
  };

  it('should merge default aliases when user provides only overrides', () => {
    const userOverrides = [
      {
        match: { model: 'test-model' },
        modelConfig: { generateContentConfig: { temperature: 0.1 } },
      },
    ];

    const params: ConfigParameters = {
      ...baseParams,
      modelConfigServiceConfig: {
        overrides: userOverrides,
      },
    };

    const config = new Config(params);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serviceConfig = (config.modelConfigService as any).config;

    // Assert that the default aliases are present
    expect(serviceConfig.aliases).toEqual(DEFAULT_MODEL_CONFIGS.aliases);
    // Assert that the user's overrides are present
    expect(serviceConfig.overrides).toEqual(userOverrides);
  });

  it('should merge default overrides when user provides only aliases', () => {
    const userAliases = {
      'my-alias': {
        modelConfig: { model: 'my-model' },
      },
    };

    const params: ConfigParameters = {
      ...baseParams,
      modelConfigServiceConfig: {
        aliases: userAliases,
      },
    };

    const config = new Config(params);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serviceConfig = (config.modelConfigService as any).config;

    // Assert that the user's aliases are present
    expect(serviceConfig.aliases).toEqual(userAliases);
    // Assert that the default overrides are present
    expect(serviceConfig.overrides).toEqual(DEFAULT_MODEL_CONFIGS.overrides);
  });

  it('should use user-provided aliases if they exist', () => {
    const userAliases = {
      'my-alias': {
        modelConfig: { model: 'my-model' },
      },
    };

    const params: ConfigParameters = {
      ...baseParams,
      modelConfigServiceConfig: {
        aliases: userAliases,
      },
    };

    const config = new Config(params);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serviceConfig = (config.modelConfigService as any).config;

    // Assert that the user's aliases are used, not the defaults
    expect(serviceConfig.aliases).toEqual(userAliases);
  });

  it('should use default generation config if none is provided', () => {
    const params: ConfigParameters = { ...baseParams };

    const config = new Config(params);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serviceConfig = (config.modelConfigService as any).config;

    // Assert that the full default config is used
    expect(serviceConfig).toEqual(DEFAULT_MODEL_CONFIGS);
  });
});

describe('Config getHooks', () => {
  const baseParams: ConfigParameters = {
    cwd: '/tmp',
    targetDir: '/path/to/target',
    debugMode: false,
    sessionId: 'test-session-id',
    model: 'gemini-pro',
    usageStatisticsEnabled: false,
  };

  it('should return undefined when no hooks are provided', () => {
    const config = new Config(baseParams);
    expect(config.getHooks()).toBeUndefined();
  });

  it('should return empty object when empty hooks are provided', () => {
    const configWithEmptyHooks = new Config({
      ...baseParams,
      hooks: {},
    });
    expect(configWithEmptyHooks.getHooks()).toEqual({});
  });

  it('should return the hooks configuration when provided', () => {
    const mockHooks: { [K in HookEventName]?: HookDefinition[] } = {
      [HookEventName.BeforeTool]: [
        {
          matcher: 'write_file',
          hooks: [
            {
              type: HookType.Command,
              command: 'echo "test hook"',
              timeout: 5000,
            },
          ],
        },
      ],
      [HookEventName.AfterTool]: [
        {
          hooks: [
            {
              type: HookType.Command,
              command: './hooks/after-tool.sh',
              timeout: 10000,
            },
          ],
        },
      ],
    };

    const config = new Config({
      ...baseParams,
      hooks: mockHooks,
    });

    const retrievedHooks = config.getHooks();
    expect(retrievedHooks).toEqual(mockHooks);
    expect(retrievedHooks).toBe(mockHooks); // Should return the same reference
  });

  it('should return hooks with all supported event types', () => {
    const allEventHooks: { [K in HookEventName]?: HookDefinition[] } = {
      [HookEventName.BeforeAgent]: [
        { hooks: [{ type: HookType.Command, command: 'test1' }] },
      ],
      [HookEventName.AfterAgent]: [
        { hooks: [{ type: HookType.Command, command: 'test2' }] },
      ],
      [HookEventName.BeforeTool]: [
        { hooks: [{ type: HookType.Command, command: 'test3' }] },
      ],
      [HookEventName.AfterTool]: [
        { hooks: [{ type: HookType.Command, command: 'test4' }] },
      ],
      [HookEventName.BeforeModel]: [
        { hooks: [{ type: HookType.Command, command: 'test5' }] },
      ],
      [HookEventName.AfterModel]: [
        { hooks: [{ type: HookType.Command, command: 'test6' }] },
      ],
      [HookEventName.BeforeToolSelection]: [
        { hooks: [{ type: HookType.Command, command: 'test7' }] },
      ],
      [HookEventName.Notification]: [
        { hooks: [{ type: HookType.Command, command: 'test8' }] },
      ],
      [HookEventName.SessionStart]: [
        { hooks: [{ type: HookType.Command, command: 'test9' }] },
      ],
      [HookEventName.SessionEnd]: [
        { hooks: [{ type: HookType.Command, command: 'test10' }] },
      ],
      [HookEventName.PreCompress]: [
        { hooks: [{ type: HookType.Command, command: 'test11' }] },
      ],
    };

    const config = new Config({
      ...baseParams,
      hooks: allEventHooks,
    });

    const retrievedHooks = config.getHooks();
    expect(retrievedHooks).toEqual(allEventHooks);
    expect(Object.keys(retrievedHooks!)).toHaveLength(11); // All hook event types
  });

  describe('setModel', () => {
    it('should allow setting a pro (any) model and reset availability', () => {
      const config = new Config(baseParams);
      const service = config.getModelAvailabilityService();
      const spy = vi.spyOn(service, 'reset');

      const proModel = 'gemini-2.5-pro';
      config.setModel(proModel);

      expect(config.getModel()).toBe(proModel);
      expect(mockCoreEvents.emitModelChanged).toHaveBeenCalledWith(proModel);
      expect(spy).toHaveBeenCalled();
    });

    it('should allow setting auto model from non-auto model and reset availability', () => {
      const config = new Config(baseParams);
      const service = config.getModelAvailabilityService();
      const spy = vi.spyOn(service, 'reset');

      config.setModel('auto');

      expect(config.getModel()).toBe('auto');
      expect(mockCoreEvents.emitModelChanged).toHaveBeenCalledWith('auto');
      expect(spy).toHaveBeenCalled();
    });

    it('should allow setting auto model from auto model and reset availability', () => {
      const config = new Config({
        cwd: '/tmp',
        targetDir: '/path/to/target',
        debugMode: false,
        sessionId: 'test-session-id',
        model: 'auto',
        usageStatisticsEnabled: false,
      });
      const service = config.getModelAvailabilityService();
      const spy = vi.spyOn(service, 'reset');

      config.setModel('auto');

      expect(config.getModel()).toBe('auto');
      expect(spy).toHaveBeenCalled();
    });

    it('should reset active model when setModel is called with the current model after a fallback', () => {
      const config = new Config(baseParams);
      const originalModel = config.getModel();
      const fallbackModel = 'fallback-model';

      config.setActiveModel(fallbackModel);
      expect(config.getActiveModel()).toBe(fallbackModel);

      config.setModel(originalModel);

      expect(config.getModel()).toBe(originalModel);
      expect(config.getActiveModel()).toBe(originalModel);
    });

    it('should call onModelChange when a new model is set and should persist', () => {
      const onModelChange = vi.fn();
      const config = new Config({
        ...baseParams,
        onModelChange,
      });

      config.setModel(DEFAULT_GEMINI_MODEL, false);

      expect(onModelChange).toHaveBeenCalledWith(DEFAULT_GEMINI_MODEL);
    });

    it('should NOT call onModelChange when a new model is temporary', () => {
      const onModelChange = vi.fn();
      const config = new Config({
        ...baseParams,
        onModelChange,
      });

      config.setModel(DEFAULT_GEMINI_MODEL, true);

      expect(onModelChange).not.toHaveBeenCalled();
    });
  });
});

describe('Config getExperiments', () => {
  const baseParams: ConfigParameters = {
    cwd: '/tmp',
    targetDir: '/path/to/target',
    debugMode: false,
    sessionId: 'test-session-id',
    model: 'gemini-pro',
    usageStatisticsEnabled: false,
  };

  it('should return undefined when no experiments are provided', () => {
    const config = new Config(baseParams);
    expect(config.getExperiments()).toBeUndefined();
  });

  it('should return empty object when empty experiments are provided', () => {
    const configWithEmptyExps = new Config({
      ...baseParams,
      experiments: { flags: {}, experimentIds: [] },
    });
    expect(configWithEmptyExps.getExperiments()).toEqual({
      flags: {},
      experimentIds: [],
    });
  });

  it('should return the experiments configuration when provided', () => {
    const mockExps = {
      flags: {
        testFlag: { boolValue: true },
      },
      experimentIds: [],
    };

    const config = new Config({
      ...baseParams,
      experiments: mockExps,
    });

    const retrievedExps = config.getExperiments();
    expect(retrievedExps).toEqual(mockExps);
    expect(retrievedExps).toBe(mockExps); // Should return the same reference
  });
});

describe('Config setExperiments logging', () => {
  const baseParams: ConfigParameters = {
    cwd: '/tmp',
    targetDir: '/path/to/target',
    debugMode: false,
    sessionId: 'test-session-id',
    model: 'gemini-pro',
    usageStatisticsEnabled: false,
  };

  it('logs a sorted, non-truncated summary of experiments when they are set', () => {
    const config = new Config(baseParams);
    const debugSpy = vi
      .spyOn(debugLogger, 'debug')
      .mockImplementation(() => {});
    const experiments = {
      flags: {
        ZetaFlag: {
          boolValue: true,
          stringValue: 'zeta',
          int32ListValue: { values: [1, 2] },
        },
        AlphaFlag: {
          boolValue: false,
          stringValue: 'alpha',
          stringListValue: { values: ['a', 'b', 'c'] },
        },
        MiddleFlag: {
          // Intentionally sparse to ensure undefined values are omitted
          floatValue: 0.42,
          int32ListValue: { values: [] },
        },
      },
      experimentIds: [101, 99],
    };

    config.setExperiments(experiments);

    const logCall = debugSpy.mock.calls.find(
      ([message]) => message === 'Experiments loaded',
    );
    expect(logCall).toBeDefined();
    const loggedSummary = logCall?.[1] as string;
    expect(typeof loggedSummary).toBe('string');
    expect(loggedSummary).toContain('experimentIds');
    expect(loggedSummary).toContain('101');
    expect(loggedSummary).toContain('AlphaFlag');
    expect(loggedSummary).toContain('ZetaFlag');
    const alphaIndex = loggedSummary.indexOf('AlphaFlag');
    const zetaIndex = loggedSummary.indexOf('ZetaFlag');
    expect(alphaIndex).toBeGreaterThan(-1);
    expect(zetaIndex).toBeGreaterThan(-1);
    expect(alphaIndex).toBeLessThan(zetaIndex);
    expect(loggedSummary).toContain('\n');
    expect(loggedSummary).not.toContain('stringListLength: 0');
    expect(loggedSummary).not.toContain('int32ListLength: 0');

    debugSpy.mockRestore();
  });
});

describe('Availability Service Integration', () => {
  const baseModel = 'test-model';
  const baseParams: ConfigParameters = {
    sessionId: 'test',
    targetDir: '.',
    debugMode: false,
    model: baseModel,
    cwd: '.',
  };

  it('setActiveModel updates active model', async () => {
    const config = new Config(baseParams);
    const model1 = 'model1';
    const model2 = 'model2';

    config.setActiveModel(model1);
    expect(config.getActiveModel()).toBe(model1);

    config.setActiveModel(model2);
    expect(config.getActiveModel()).toBe(model2);
  });

  it('getActiveModel defaults to configured model if not set', () => {
    const config = new Config(baseParams);
    expect(config.getActiveModel()).toBe(baseModel);
  });

  it('resetTurn delegates to availability service', () => {
    const config = new Config(baseParams);
    const service = config.getModelAvailabilityService();
    const spy = vi.spyOn(service, 'resetTurn');

    config.resetTurn();
    expect(spy).toHaveBeenCalled();
  });
});

describe('Config Quota & Preview Model Access', () => {
  let config: Config;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCodeAssistServer: any;

  const baseParams: ConfigParameters = {
    cwd: '/tmp',
    targetDir: '/tmp',
    debugMode: false,
    sessionId: 'test-session',
    model: 'gemini-pro',
    usageStatisticsEnabled: false,
    embeddingModel: 'gemini-embedding',
    sandbox: {
      command: 'docker',
      image: 'gemini-cli-sandbox',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCodeAssistServer = {
      projectId: 'test-project',
      retrieveUserQuota: vi.fn(),
    };
    vi.mocked(getCodeAssistServer).mockReturnValue(mockCodeAssistServer);
    config = new Config(baseParams);
  });

  describe('refreshUserQuota', () => {
    it('should update hasAccessToPreviewModel to true if quota includes preview model', async () => {
      mockCodeAssistServer.retrieveUserQuota.mockResolvedValue({
        buckets: [{ modelId: PREVIEW_GEMINI_MODEL }],
      });

      await config.refreshUserQuota();
      expect(config.getHasAccessToPreviewModel()).toBe(true);
    });

    it('should update hasAccessToPreviewModel to false if quota does not include preview model', async () => {
      mockCodeAssistServer.retrieveUserQuota.mockResolvedValue({
        buckets: [{ modelId: 'some-other-model' }],
      });

      await config.refreshUserQuota();
      expect(config.getHasAccessToPreviewModel()).toBe(false);
    });

    it('should update hasAccessToPreviewModel to false if buckets are undefined', async () => {
      mockCodeAssistServer.retrieveUserQuota.mockResolvedValue({});

      await config.refreshUserQuota();
      expect(config.getHasAccessToPreviewModel()).toBe(false);
    });

    it('should return undefined and not update if codeAssistServer is missing', async () => {
      vi.mocked(getCodeAssistServer).mockReturnValue(undefined);
      const result = await config.refreshUserQuota();
      expect(result).toBeUndefined();
      expect(config.getHasAccessToPreviewModel()).toBe(false);
    });

    it('should return undefined if retrieveUserQuota fails', async () => {
      mockCodeAssistServer.retrieveUserQuota.mockRejectedValue(
        new Error('Network error'),
      );
      const result = await config.refreshUserQuota();
      expect(result).toBeUndefined();
      // Should remain default (false)
      expect(config.getHasAccessToPreviewModel()).toBe(false);
    });
  });

  describe('setPreviewFeatures', () => {
    it('should reset model to default auto if disabling preview features while using a preview model', () => {
      config.setPreviewFeatures(true);
      config.setModel(PREVIEW_GEMINI_MODEL);

      config.setPreviewFeatures(false);

      expect(config.getModel()).toBe(DEFAULT_GEMINI_MODEL_AUTO);
    });

    it('should NOT reset model if disabling preview features while NOT using a preview model', () => {
      config.setPreviewFeatures(true);
      const nonPreviewModel = 'gemini-1.5-pro';
      config.setModel(nonPreviewModel);

      config.setPreviewFeatures(false);

      expect(config.getModel()).toBe(nonPreviewModel);
    });

    it('should switch to preview auto model if enabling preview features while using default auto model', () => {
      config.setPreviewFeatures(false);
      config.setModel(DEFAULT_GEMINI_MODEL_AUTO);

      config.setPreviewFeatures(true);

      expect(config.getModel()).toBe(PREVIEW_GEMINI_MODEL_AUTO);
    });

    it('should NOT reset model if enabling preview features', () => {
      config.setPreviewFeatures(false);
      config.setModel(PREVIEW_GEMINI_MODEL); // Just pretending it was set somehow

      config.setPreviewFeatures(true);

      expect(config.getModel()).toBe(PREVIEW_GEMINI_MODEL);
    });
  });

  describe('isPlanEnabled', () => {
    it('should return false by default', () => {
      const config = new Config(baseParams);
      expect(config.isPlanEnabled()).toBe(false);
    });

    it('should return true when plan is enabled', () => {
      const config = new Config({
        ...baseParams,
        plan: true,
      });
      expect(config.isPlanEnabled()).toBe(true);
    });

    it('should return false when plan is explicitly disabled', () => {
      const config = new Config({
        ...baseParams,
        plan: false,
      });
      expect(config.isPlanEnabled()).toBe(false);
    });
  });
});

describe('Config JIT Initialization', () => {
  let config: Config;
  let mockContextManager: {
    refresh: Mock;
    getGlobalMemory: Mock;
    getEnvironmentMemory: Mock;
    getLoadedPaths: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockContextManager = {
      refresh: vi.fn(),
      getGlobalMemory: vi.fn().mockReturnValue('Global Memory'),
      getEnvironmentMemory: vi
        .fn()
        .mockReturnValue('Environment Memory\n\nMCP Instructions'),
      getLoadedPaths: vi.fn().mockReturnValue(new Set(['/path/to/GEMINI.md'])),
    };
    (ContextManager as unknown as Mock).mockImplementation(
      () => mockContextManager,
    );
  });

  it('should initialize ContextManager, load memory, and delegate to it when experimentalJitContext is enabled', async () => {
    const params: ConfigParameters = {
      sessionId: 'test-session',
      targetDir: '/tmp/test',
      debugMode: false,
      model: 'test-model',
      experimentalJitContext: true,
      userMemory: 'Initial Memory',
      cwd: '/tmp/test',
    };

    config = new Config(params);
    await config.initialize();

    expect(ContextManager).toHaveBeenCalledWith(config);
    expect(mockContextManager.refresh).toHaveBeenCalled();
    expect(config.getUserMemory()).toBe(
      'Global Memory\n\nEnvironment Memory\n\nMCP Instructions',
    );

    // Verify state update (delegated to ContextManager)
    expect(config.getGeminiMdFileCount()).toBe(1);
    expect(config.getGeminiMdFilePaths()).toEqual(['/path/to/GEMINI.md']);
  });

  it('should NOT initialize ContextManager when experimentalJitContext is disabled', async () => {
    const params: ConfigParameters = {
      sessionId: 'test-session',
      targetDir: '/tmp/test',
      debugMode: false,
      model: 'test-model',
      experimentalJitContext: false,
      userMemory: 'Initial Memory',
      cwd: '/tmp/test',
    };

    config = new Config(params);
    await config.initialize();

    expect(ContextManager).not.toHaveBeenCalled();
    expect(config.getUserMemory()).toBe('Initial Memory');
  });

  describe('reloadSkills', () => {
    it('should refresh disabledSkills and re-register ActivateSkillTool when skills exist', async () => {
      const mockOnReload = vi.fn().mockResolvedValue({
        disabledSkills: ['skill2'],
      });
      const params: ConfigParameters = {
        sessionId: 'test-session',
        targetDir: '/tmp/test',
        debugMode: false,
        model: 'test-model',
        cwd: '/tmp/test',
        skillsSupport: true,
        onReload: mockOnReload,
      };

      config = new Config(params);
      await config.initialize();

      const skillManager = config.getSkillManager();
      const toolRegistry = config.getToolRegistry();

      vi.spyOn(skillManager, 'discoverSkills').mockResolvedValue(undefined);
      vi.spyOn(skillManager, 'setDisabledSkills');
      vi.spyOn(toolRegistry, 'registerTool');
      vi.spyOn(toolRegistry, 'unregisterTool');

      const mockSkills = [{ name: 'skill1' }];
      vi.spyOn(skillManager, 'getSkills').mockReturnValue(
        mockSkills as SkillDefinition[],
      );

      await config.reloadSkills();

      expect(mockOnReload).toHaveBeenCalled();
      expect(skillManager.setDisabledSkills).toHaveBeenCalledWith(['skill2']);
      expect(toolRegistry.registerTool).toHaveBeenCalled();
      expect(toolRegistry.unregisterTool).toHaveBeenCalledWith(
        ACTIVATE_SKILL_TOOL_NAME,
      );
    });

    it('should unregister ActivateSkillTool when no skills exist after reload', async () => {
      const params: ConfigParameters = {
        sessionId: 'test-session',
        targetDir: '/tmp/test',
        debugMode: false,
        model: 'test-model',
        cwd: '/tmp/test',
        skillsSupport: true,
      };

      config = new Config(params);
      await config.initialize();

      const skillManager = config.getSkillManager();
      const toolRegistry = config.getToolRegistry();

      vi.spyOn(skillManager, 'discoverSkills').mockResolvedValue(undefined);
      vi.spyOn(toolRegistry, 'registerTool');
      vi.spyOn(toolRegistry, 'unregisterTool');

      vi.spyOn(skillManager, 'getSkills').mockReturnValue([]);

      await config.reloadSkills();

      expect(toolRegistry.unregisterTool).toHaveBeenCalledWith(
        ACTIVATE_SKILL_TOOL_NAME,
      );
    });

    it('should clear disabledSkills when onReload returns undefined for them', async () => {
      const mockOnReload = vi.fn().mockResolvedValue({
        disabledSkills: undefined,
      });
      const params: ConfigParameters = {
        sessionId: 'test-session',
        targetDir: '/tmp/test',
        debugMode: false,
        model: 'test-model',
        cwd: '/tmp/test',
        skillsSupport: true,
        onReload: mockOnReload,
      };

      config = new Config(params);
      // Initially set some disabled skills
      // @ts-expect-error - accessing private
      config.disabledSkills = ['skill1'];
      await config.initialize();

      const skillManager = config.getSkillManager();
      vi.spyOn(skillManager, 'discoverSkills').mockResolvedValue(undefined);
      vi.spyOn(skillManager, 'setDisabledSkills');

      await config.reloadSkills();

      expect(skillManager.setDisabledSkills).toHaveBeenCalledWith([]);
    });

    it('should update admin settings from onReload', async () => {
      const mockOnReload = vi.fn().mockResolvedValue({
        adminSkillsEnabled: false,
      });
      const params: ConfigParameters = {
        sessionId: 'test-session',
        targetDir: '/tmp/test',
        debugMode: false,
        model: 'test-model',
        cwd: '/tmp/test',
        skillsSupport: true,
        onReload: mockOnReload,
      };

      config = new Config(params);
      await config.initialize();

      const skillManager = config.getSkillManager();
      vi.spyOn(skillManager, 'setAdminSettings');

      await config.reloadSkills();

      expect(skillManager.setAdminSettings).toHaveBeenCalledWith(false);
    });
  });
});
