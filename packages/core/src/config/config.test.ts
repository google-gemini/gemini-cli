/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import type { ConfigParameters, SandboxConfig } from './config.js';
import { Config, DEFAULT_FILE_FILTERING_OPTIONS } from './config.js';
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
import { DEFAULT_MODEL_CONFIGS } from './defaultModelConfigs.js';

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
  ToolRegistryMock.prototype.discoverAllTools = vi.fn();
  ToolRegistryMock.prototype.sortTools = vi.fn();
  ToolRegistryMock.prototype.getAllTools = vi.fn(() => []); // Mock methods if needed
  ToolRegistryMock.prototype.getTool = vi.fn();
  ToolRegistryMock.prototype.getFunctionDeclarations = vi.fn(() => []);
  return { ToolRegistry: ToolRegistryMock };
});

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

vi.mock('../agents/subagent-tool-wrapper.js', () => ({
  SubagentToolWrapper: vi.fn(),
}));

const mockCoreEvents = vi.hoisted(() => ({
  emitFeedback: vi.fn(),
  emitModelChanged: vi.fn(),
}));

const mockSetGlobalProxy = vi.hoisted(() => vi.fn());

vi.mock('../utils/events.js', () => ({
  coreEvents: mockCoreEvents,
}));

vi.mock('../utils/fetch.js', () => ({
  setGlobalProxy: mockSetGlobalProxy,
}));

import { BaseLlmClient } from '../core/baseLlmClient.js';
import { tokenLimit } from '../core/tokenLimits.js';
import { uiTelemetryService } from '../telemetry/index.js';

vi.mock('../core/baseLlmClient.js');
vi.mock('../core/tokenLimits.js', () => ({
  tokenLimit: vi.fn(),
}));

describe('Server Config (config.ts)', () => {
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

  beforeEach(() => {
    // Reset mocks if necessary
    vi.clearAllMocks();
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
              GeminiCLIContextCompression__threshold_fraction: {
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
              GeminiCLIContextCompression__threshold_fraction: {
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

      // Set fallback mode to true to ensure it gets reset
      config.setFallbackMode(true);
      expect(config.isInFallbackMode()).toBe(true);

      await config.refreshAuth(authType);

      expect(createContentGeneratorConfig).toHaveBeenCalledWith(
        config,
        authType,
      );
      // Verify that contentGeneratorConfig is updated
      expect(config.getContentGeneratorConfig()).toEqual(mockContentConfig);
      expect(GeminiClient).toHaveBeenCalledWith(config);
      // Verify that fallback mode is reset
      expect(config.isInFallbackMode()).toBe(false);
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
    const resolved = path.resolve(baseParams.targetDir);
    const includeDirectories = ['dir1', 'dir2'];
    const paramsWithIncludeDirs: ConfigParameters = {
      ...baseParams,
      includeDirectories,
    };
    const config = new Config(paramsWithIncludeDirs);
    const workspaceContext = config.getWorkspaceContext();
    const directories = workspaceContext.getDirectories();
    // Should include the target directory plus the included directories
    expect(directories).toHaveLength(3);
    expect(directories).toContain(resolved);
    expect(directories).toContain(path.join(resolved, 'dir1'));
    expect(directories).toContain(path.join(resolved, 'dir2'));
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

  describe('Model Router with Auth', () => {
    it('should disable model router by default for oauth-personal', async () => {
      const config = new Config({
        ...baseParams,
        useModelRouter: true,
      });
      await config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);
      expect(config.getUseModelRouter()).toBe(true);
    });

    it('should enable model router by default for other auth types', async () => {
      const config = new Config({
        ...baseParams,
        useModelRouter: true,
      });
      await config.refreshAuth(AuthType.USE_GEMINI);
      expect(config.getUseModelRouter()).toBe(true);
    });

    it('should disable model router for specified auth type', async () => {
      const config = new Config({
        ...baseParams,
        useModelRouter: true,
        disableModelRouterForAuth: [AuthType.USE_GEMINI],
      });
      await config.refreshAuth(AuthType.USE_GEMINI);
      expect(config.getUseModelRouter()).toBe(false);
    });

    it('should enable model router for other auth type', async () => {
      const config = new Config({
        ...baseParams,
        useModelRouter: true,
        disableModelRouterForAuth: [],
      });
      await config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);
      expect(config.getUseModelRouter()).toBe(true);
    });

    it('should keep model router disabled when useModelRouter is false', async () => {
      const config = new Config({
        ...baseParams,
        useModelRouter: false,
        disableModelRouterForAuth: [AuthType.USE_GEMINI],
      });
      await config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);
      expect(config.getUseModelRouter()).toBe(false);
    });

    it('should keep the user-chosen model after refreshAuth, even when model router is disabled for the auth type', async () => {
      const config = new Config({
        ...baseParams,
        useModelRouter: true,
        disableModelRouterForAuth: [AuthType.USE_GEMINI],
      });
      const chosenModel = 'gemini-1.5-pro-latest';
      config.setModel(chosenModel);

      await config.refreshAuth(AuthType.USE_GEMINI);

      expect(config.getUseModelRouter()).toBe(false);
      expect(config.getModel()).toBe(chosenModel);
    });

    it('should keep the user-chosen model after refreshAuth, when model router is enabled for the auth type', async () => {
      const config = new Config({
        ...baseParams,
        useModelRouter: true,
        disableModelRouterForAuth: [AuthType.USE_GEMINI],
      });
      const chosenModel = 'gemini-1.5-pro-latest';
      config.setModel(chosenModel);

      await config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);

      expect(config.getUseModelRouter()).toBe(true);
      expect(config.getModel()).toBe(chosenModel);
    });

    it('should NOT switch to auto model if cli provides specific model, even if router is enabled', async () => {
      const config = new Config({
        ...baseParams,
        useModelRouter: true,
        model: 'gemini-flash-latest',
      });

      await config.refreshAuth(AuthType.LOGIN_WITH_GOOGLE);

      expect(config.getUseModelRouter()).toBe(true);
      expect(config.getModel()).toBe('gemini-flash-latest');
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
      const wasShellToolRegistered = (registerToolMock as Mock).mock.calls.some(
        (call) => call[0] instanceof vi.mocked(ShellTool),
      );
      expect(wasShellToolRegistered).toBe(true);

      // Check that registerTool was NOT called for ReadFileTool
      const wasReadFileToolRegistered = (
        registerToolMock as Mock
      ).mock.calls.some((call) => call[0] instanceof vi.mocked(ReadFileTool));
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

      const SubagentToolWrapperMock = (
        (await vi.importMock('../agents/subagent-tool-wrapper.js')) as {
          SubagentToolWrapper: Mock;
        }
      ).SubagentToolWrapper;

      await config.initialize();

      const registerToolMock = (
        (await vi.importMock('../tools/tool-registry')) as {
          ToolRegistry: { prototype: { registerTool: Mock } };
        }
      ).ToolRegistry.prototype.registerTool;

      expect(SubagentToolWrapperMock).toHaveBeenCalledTimes(1);
      expect(SubagentToolWrapperMock).toHaveBeenCalledWith(
        mockAgentDefinition,
        config,
        undefined,
      );

      const calls = registerToolMock.mock.calls;
      const registeredWrappers = calls.filter(
        (call) => call[0] instanceof SubagentToolWrapperMock,
      );
      expect(registeredWrappers).toHaveLength(1);
    });

    it('should not register subagents as tools when codebaseInvestigatorSettings.enabled is false', async () => {
      const params: ConfigParameters = {
        ...baseParams,
        codebaseInvestigatorSettings: { enabled: false },
      };
      const config = new Config(params);

      const SubagentToolWrapperMock = (
        (await vi.importMock('../agents/subagent-tool-wrapper.js')) as {
          SubagentToolWrapper: Mock;
        }
      ).SubagentToolWrapper;

      await config.initialize();

      expect(SubagentToolWrapperMock).not.toHaveBeenCalled();
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

        const wasShellToolRegistered = (
          registerToolMock as Mock
        ).mock.calls.some((call) => call[0] instanceof vi.mocked(ShellTool));
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

        const wasShellToolRegistered = (
          registerToolMock as Mock
        ).mock.calls.some((call) => call[0] instanceof vi.mocked(ShellTool));
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
    it('should allow setting a pro (any) model and disable fallback mode', () => {
      const config = new Config(baseParams);
      config.setFallbackMode(true);
      expect(config.isInFallbackMode()).toBe(true);

      const proModel = 'gemini-2.5-pro';
      config.setModel(proModel);

      expect(config.getModel()).toBe(proModel);
      expect(config.isInFallbackMode()).toBe(false);
      expect(mockCoreEvents.emitModelChanged).toHaveBeenCalledWith(proModel);
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
