/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import type { Config } from '@google/gemini-cli-core';
import type { LoadedSettings, Settings } from '../config/settings.js';
import { createTestMergedSettings } from '../config/settings.js';

/**
 * Creates a mocked Config object with default values and allows overrides.
 */
export const createMockConfig = (overrides: Partial<Config> = {}): Config =>
  ({
    getSandbox: vi.fn(() => undefined),
    getQuestion: vi.fn(() => ''),
    isInteractive: vi.fn(() => false),
    setTerminalBackground: vi.fn(),
    storage: {
      getProjectTempDir: vi.fn().mockReturnValue('/tmp/gemini-test'),
      initialize: vi.fn().mockResolvedValue(undefined),
    },
    getDebugMode: vi.fn(() => false),
    getProjectRoot: vi.fn(() => '/'),
    refreshAuth: vi.fn().mockResolvedValue(undefined),
    getRemoteAdminSettings: vi.fn(() => undefined),
    initialize: vi.fn().mockResolvedValue(undefined),
    getPolicyEngine: vi.fn(() => ({})),
    getMessageBus: vi.fn(() => ({ subscribe: vi.fn() })),
    getHookSystem: vi.fn(() => ({
      fireSessionEndEvent: vi.fn().mockResolvedValue(undefined),
      fireSessionStartEvent: vi.fn().mockResolvedValue(undefined),
    })),
    getListExtensions: vi.fn(() => false),
    getExtensions: vi.fn(() => []),
    getListSessions: vi.fn(() => false),
    getDeleteSession: vi.fn(() => undefined),
    setSessionId: vi.fn(),
    getSessionId: vi.fn().mockReturnValue('mock-session-id'),
    getContentGeneratorConfig: vi.fn(() => ({ authType: 'google' })),
    getExperimentalZedIntegration: vi.fn(() => false),
    isBrowserLaunchSuppressed: vi.fn(() => false),
    setRemoteAdminSettings: vi.fn(),
    isYoloModeDisabled: vi.fn(() => false),
    isPlanEnabled: vi.fn(() => false),
    getCoreTools: vi.fn(() => []),
    getAllowedTools: vi.fn(() => []),
    getApprovalMode: vi.fn(() => 'default'),
    getFileFilteringRespectGitIgnore: vi.fn(() => true),
    getOutputFormat: vi.fn(() => 'text'),
    getUsageStatisticsEnabled: vi.fn(() => true),
    getScreenReader: vi.fn(() => false),
    getGeminiMdFileCount: vi.fn(() => 0),
    getDeferredCommand: vi.fn(() => undefined),
    getFileSystemService: vi.fn(() => ({})),
    clientVersion: '1.0.0',
    getModel: vi.fn().mockReturnValue('gemini-pro'),
    getWorkingDir: vi.fn().mockReturnValue('/mock/cwd'),
    getToolRegistry: vi.fn().mockReturnValue({
      getTools: vi.fn().mockReturnValue([]),
      getAllTools: vi.fn().mockReturnValue([]),
    }),
    getAgentRegistry: vi.fn().mockReturnValue({}),
    getPromptRegistry: vi.fn().mockReturnValue({}),
    getResourceRegistry: vi.fn().mockReturnValue({}),
    getSkillManager: vi.fn().mockReturnValue({
      isAdminEnabled: vi.fn().mockReturnValue(false),
    }),
    getFileService: vi.fn().mockReturnValue({}),
    getGitService: vi.fn().mockResolvedValue({}),
    getUserMemory: vi.fn().mockReturnValue(''),
    getGeminiMdFilePaths: vi.fn().mockReturnValue([]),
    getShowMemoryUsage: vi.fn().mockReturnValue(false),
    getAccessibility: vi.fn().mockReturnValue({}),
    getTelemetryEnabled: vi.fn().mockReturnValue(false),
    getTelemetryLogPromptsEnabled: vi.fn().mockReturnValue(false),
    getTelemetryOtlpEndpoint: vi.fn().mockReturnValue(''),
    getTelemetryOtlpProtocol: vi.fn().mockReturnValue('grpc'),
    getTelemetryTarget: vi.fn().mockReturnValue(''),
    getTelemetryOutfile: vi.fn().mockReturnValue(undefined),
    getTelemetryUseCollector: vi.fn().mockReturnValue(false),
    getTelemetryUseCliAuth: vi.fn().mockReturnValue(false),
    getGeminiClient: vi.fn().mockReturnValue({
      isInitialized: vi.fn().mockReturnValue(true),
    }),
    updateSystemInstructionIfInitialized: vi.fn().mockResolvedValue(undefined),
    getModelRouterService: vi.fn().mockReturnValue({}),
    getModelAvailabilityService: vi.fn().mockReturnValue({}),
    getEnableRecursiveFileSearch: vi.fn().mockReturnValue(true),
    getFileFilteringEnableFuzzySearch: vi.fn().mockReturnValue(true),
    getFileFilteringRespectGeminiIgnore: vi.fn().mockReturnValue(true),
    getFileFilteringOptions: vi.fn().mockReturnValue({}),
    getCustomExcludes: vi.fn().mockReturnValue([]),
    getCheckpointingEnabled: vi.fn().mockReturnValue(false),
    getProxy: vi.fn().mockReturnValue(undefined),
    getBugCommand: vi.fn().mockReturnValue(undefined),
    getExtensionManagement: vi.fn().mockReturnValue(true),
    getExtensionLoader: vi.fn().mockReturnValue({}),
    getEnabledExtensions: vi.fn().mockReturnValue([]),
    getEnableExtensionReloading: vi.fn().mockReturnValue(false),
    getDisableLLMCorrection: vi.fn().mockReturnValue(false),
    getNoBrowser: vi.fn().mockReturnValue(false),
    getAgentsSettings: vi.fn().mockReturnValue({}),
    getSummarizeToolOutputConfig: vi.fn().mockReturnValue(undefined),
    getIdeMode: vi.fn().mockReturnValue(false),
    getFolderTrust: vi.fn().mockReturnValue(true),
    isTrustedFolder: vi.fn().mockReturnValue(true),
    getCompressionThreshold: vi.fn().mockResolvedValue(undefined),
    getUserCaching: vi.fn().mockResolvedValue(false),
    getNumericalRoutingEnabled: vi.fn().mockResolvedValue(false),
    getClassifierThreshold: vi.fn().mockResolvedValue(undefined),
    getBannerTextNoCapacityIssues: vi.fn().mockResolvedValue(''),
    getBannerTextCapacityIssues: vi.fn().mockResolvedValue(''),
    isInteractiveShellEnabled: vi.fn().mockReturnValue(false),
    isSkillsSupportEnabled: vi.fn().mockReturnValue(false),
    reloadSkills: vi.fn().mockResolvedValue(undefined),
    reloadAgents: vi.fn().mockResolvedValue(undefined),
    getUseRipgrep: vi.fn().mockReturnValue(false),
    getEnableInteractiveShell: vi.fn().mockReturnValue(false),
    getSkipNextSpeakerCheck: vi.fn().mockReturnValue(false),
    getContinueOnFailedApiCall: vi.fn().mockReturnValue(false),
    getRetryFetchErrors: vi.fn().mockReturnValue(false),
    getEnableShellOutputEfficiency: vi.fn().mockReturnValue(true),
    getShellToolInactivityTimeout: vi.fn().mockReturnValue(300000),
    getShellExecutionConfig: vi.fn().mockReturnValue({}),
    setShellExecutionConfig: vi.fn(),
    getEnablePromptCompletion: vi.fn().mockReturnValue(false),
    getEnableToolOutputTruncation: vi.fn().mockReturnValue(true),
    getTruncateToolOutputThreshold: vi.fn().mockReturnValue(1000),
    getTruncateToolOutputLines: vi.fn().mockReturnValue(100),
    getNextCompressionTruncationId: vi.fn().mockReturnValue(1),
    getUseWriteTodos: vi.fn().mockReturnValue(false),
    getFileExclusions: vi.fn().mockReturnValue({}),
    getEnableHooks: vi.fn().mockReturnValue(true),
    getEnableHooksUI: vi.fn().mockReturnValue(true),
    getMcpClientManager: vi.fn().mockReturnValue({
      getMcpInstructions: vi.fn().mockReturnValue(''),
      getMcpServers: vi.fn().mockReturnValue({}),
    }),
    getEnableEventDrivenScheduler: vi.fn().mockReturnValue(false),
    getAdminSkillsEnabled: vi.fn().mockReturnValue(false),
    getDisabledSkills: vi.fn().mockReturnValue([]),
    getExperimentalJitContext: vi.fn().mockReturnValue(false),
    getTerminalBackground: vi.fn().mockReturnValue(undefined),
    getEmbeddingModel: vi.fn().mockReturnValue('embedding-model'),
    getQuotaErrorOccurred: vi.fn().mockReturnValue(false),
    getMaxSessionTurns: vi.fn().mockReturnValue(100),
    getExcludeTools: vi.fn().mockReturnValue(new Set()),
    getAllowedMcpServers: vi.fn().mockReturnValue([]),
    getBlockedMcpServers: vi.fn().mockReturnValue([]),
    getExperiments: vi.fn().mockReturnValue(undefined),
    getHasAccessToPreviewModel: vi.fn().mockReturnValue(false),
    ...overrides,
  }) as unknown as Config;

/**
 * Creates a mocked LoadedSettings object for tests.
 */
export function createMockSettings(
  overrides: Record<string, unknown> = {},
): LoadedSettings {
  const merged = createTestMergedSettings(
    (overrides['merged'] as Partial<Settings>) || {},
  );

  return {
    system: { settings: {} },
    systemDefaults: { settings: {} },
    user: { settings: {} },
    workspace: { settings: {} },
    errors: [],
    ...overrides,
    merged,
  } as unknown as LoadedSettings;
}
