/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SandboxPolicyManager } from '../policy/sandboxPolicyManager.js';
import { inspect } from 'node:util';
import process from 'node:process';
import { z } from 'zod';
import type { ConversationRecord } from '../services/chatRecordingService.js';
import type {
  AgentHistoryProviderConfig,
  ContextManagementConfig,
  ToolOutputMaskingConfig,
} from '../context/types.js';
export type { ConversationRecord };
import {
  AuthType,
  createContentGenerator,
  createContentGeneratorConfig,
  type ContentGenerator,
  type ContentGeneratorConfig,
} from '../core/contentGenerator.js';
import type { OverageStrategy } from '../billing/billing.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';
import { ResourceRegistry } from '../resources/resource-registry.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { LSTool } from '../tools/ls.js';
import { ReadFileTool } from '../tools/read-file.js';
import { GrepTool } from '../tools/grep.js';
import { canUseRipgrep, RipGrepTool } from '../tools/ripGrep.js';
import { GlobTool } from '../tools/glob.js';
import { ActivateSkillTool } from '../tools/activate-skill.js';
import { EditTool } from '../tools/edit.js';
import { ShellTool } from '../tools/shell.js';
import { WriteFileTool } from '../tools/write-file.js';
import { WebFetchTool } from '../tools/web-fetch.js';
import { MemoryTool, setGeminiMdFilename } from '../tools/memoryTool.js';
import { WebSearchTool } from '../tools/web-search.js';
import { AskUserTool } from '../tools/ask-user.js';
import { UpdateTopicTool } from '../tools/topicTool.js';
import { TopicState } from './topicState.js';
import { AgentTool } from '../agents/agent-tool.js';
import { ExitPlanModeTool } from '../tools/exit-plan-mode.js';
import { EnterPlanModeTool } from '../tools/enter-plan-mode.js';
import {
  ListBackgroundProcessesTool,
  ReadBackgroundOutputTool,
} from '../tools/shellBackgroundTools.js';
import { GeminiClient } from '../core/client.js';
import { BaseLlmClient } from '../core/baseLlmClient.js';
import { LocalLiteRtLmClient } from '../core/localLiteRtLmClient.js';
import type { HookDefinition, HookEventName } from '../hooks/types.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { GitService } from '../services/gitService.js';
import {
  type SandboxManager,
  NoopSandboxManager,
} from '../services/sandboxManager.js';
import { createSandboxManager } from '../services/sandboxManagerFactory.js';
import { SandboxedFileSystemService } from '../services/sandboxedFileSystemService.js';
import {
  initializeTelemetry,
  DEFAULT_TELEMETRY_TARGET,
  DEFAULT_OTLP_ENDPOINT,
  uiTelemetryService,
  type TelemetryTarget,
} from '../telemetry/index.js';
import { coreEvents, CoreEvent } from '../utils/events.js';
import { tokenLimit } from '../core/tokenLimits.js';
import {
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  isAutoModel,
  isPreviewModel,
  isGemini2Model,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
  resolveModel,
} from './models.js';
import { shouldAttemptBrowserLaunch } from '../utils/browser.js';
import type { MCPOAuthConfig } from '../mcp/oauth-provider.js';
import { ideContextStore } from '../ide/ideContext.js';
import { WriteTodosTool } from '../tools/write-todos.js';
import {
  StandardFileSystemService,
  type FileSystemService,
} from '../services/fileSystemService.js';
import {
  TrackerCreateTaskTool,
  TrackerUpdateTaskTool,
  TrackerGetTaskTool,
  TrackerListTasksTool,
  TrackerAddDependencyTool,
  TrackerVisualizeTool,
} from '../tools/trackerTools.js';
import {
  logRipgrepFallback,
  logFlashFallback,
  logApprovalModeSwitch,
  logApprovalModeDuration,
} from '../telemetry/loggers.js';
import {
  RipgrepFallbackEvent,
  FlashFallbackEvent,
  ApprovalModeSwitchEvent,
  ApprovalModeDurationEvent,
} from '../telemetry/types.js';
import type {
  FallbackModelHandler,
  ValidationHandler,
} from '../fallback/types.js';
import { ModelAvailabilityService } from '../availability/modelAvailabilityService.js';
import { ModelRouterService } from '../routing/modelRouterService.js';
import { OutputFormat } from '../output/types.js';
import {
  ModelConfigService,
  type ModelConfig,
  type ModelConfigServiceConfig,
} from '../services/modelConfigService.js';
import { DEFAULT_MODEL_CONFIGS } from './defaultModelConfigs.js';
import { MemoryContextManager } from '../context/memoryContextManager.js';
import { TrackerService } from '../services/trackerService.js';
import type { GenerateContentParameters } from '@google/genai';

// Re-export OAuth config type
export type { MCPOAuthConfig, AnyToolInvocation, AnyDeclarativeTool };
import type { AnyToolInvocation, AnyDeclarativeTool } from '../tools/tools.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
import { getWorkspaceContextOverride } from './scoped-config.js';
import { Storage } from './storage.js';
import type { ShellExecutionConfig } from '../services/shellExecutionService.js';
import { FileExclusions } from '../utils/ignorePatterns.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import type { EventEmitter } from 'node:events';
import { PolicyEngine } from '../policy/policy-engine.js';
import {
  ApprovalMode,
  type PolicyEngineConfig,
  type PolicyRule,
  type SafetyCheckerRule,
} from '../policy/types.js';
import { HookSystem } from '../hooks/index.js';
import type {
  UserTierId,
  GeminiUserTier,
  RetrieveUserQuotaResponse,
  AdminControlsSettings,
} from '../code_assist/types.js';
import type { HierarchicalMemory } from './memory.js';
import { getCodeAssistServer } from '../code_assist/codeAssist.js';
import {
  getExperiments,
  type Experiments,
} from '../code_assist/experiments/experiments.js';
import { AgentRegistry } from '../agents/registry.js';
import { AcknowledgedAgentsService } from '../agents/acknowledgedAgents.js';
import { setGlobalProxy, updateGlobalFetchTimeouts } from '../utils/fetch.js';
import { ExperimentFlags } from '../code_assist/experiments/flagNames.js';
import { debugLogger } from '../utils/debugLogger.js';
import { SkillManager, type SkillDefinition } from '../skills/skillManager.js';
import { startupProfiler } from '../telemetry/startupProfiler.js';
import type { AgentDefinition } from '../agents/types.js';
import { fetchAdminControls } from '../code_assist/admin/admin_controls.js';
import { isSubpath, resolveToRealPath } from '../utils/paths.js';
import { InjectionService } from './injectionService.js';
import { ExecutionLifecycleService } from '../services/executionLifecycleService.js';
import { WORKSPACE_POLICY_TIER } from '../policy/config.js';
import { loadPoliciesFromToml } from '../policy/toml-loader.js';

import { CheckerRunner } from '../safety/checker-runner.js';
import { ContextBuilder } from '../safety/context-builder.js';
import { CheckerRegistry } from '../safety/registry.js';
import { ConsecaSafetyChecker } from '../safety/conseca/conseca.js';
import type { AgentLoopContext } from './agent-loop-context.js';

export interface AccessibilitySettings {
  /** @deprecated Use ui.statusHints instead. */
  enableLoadingPhrases?: boolean;
  screenReader?: boolean;
}

export interface BugCommandSettings {
  urlTemplate: string;
}

export interface SummarizeToolOutputSettings {
  tokenBudget?: number;
}

export interface PlanSettings {
  enabled?: boolean;
  directory?: string;
  modelRouting?: boolean;
}

export interface TelemetrySettings {
  enabled?: boolean;
  target?: TelemetryTarget;
  otlpEndpoint?: string;
  otlpProtocol?: 'grpc' | 'http';
  logPrompts?: boolean;
  outfile?: string;
  useCollector?: boolean;
  useCliAuth?: boolean;
}

export interface OutputSettings {
  format?: OutputFormat;
}

export interface GemmaModelRouterSettings {
  enabled?: boolean;
  classifier?: {
    host?: string;
    model?: string;
  };
}

export interface ADKSettings {
  agentSessionNoninteractiveEnabled?: boolean;
  agentSessionInteractiveEnabled?: boolean;
}

export interface ExtensionSetting {
  name: string;
  description: string;
  envVar: string;
  sensitive?: boolean;
}

export interface ResolvedExtensionSetting {
  name: string;
  envVar: string;
  value?: string;
  sensitive: boolean;
  scope?: 'user' | 'workspace';
  source?: string;
}

export interface TrajectoryProvider {
  /** Prefix used to identify sessions from this provider (e.g., 'ext:') */
  prefix: string;
  /** Optional display name for UI Tabs */
  displayName?: string;
  /** Return an array of conversational tags/ids */
  listSessions(workspaceUri?: string): Promise<
    Array<{
      id: string;
      mtime: string;
      name?: string;
      displayName?: string;
      messageCount?: number;
    }>
  >;
  /** Load a single conversation payload */
  loadSession(id: string): Promise<ConversationRecord | null>;
}

export interface AgentRunConfig {
  maxTimeMinutes?: number;
  maxTurns?: number;
}

/**
 * Override configuration for a specific agent.
 * Generic fields (modelConfig, runConfig, enabled) are standard across all agents.
 */
export interface AgentOverride {
  modelConfig?: ModelConfig;
  runConfig?: AgentRunConfig;
  enabled?: boolean;
  tools?: string[];
  mcpServers?: Record<string, MCPServerConfig>;
}

export interface AgentSettings {
  overrides?: Record<string, AgentOverride>;
  browser?: BrowserAgentCustomConfig;
}

export interface CustomTheme {
  type: 'custom';
  name: string;

  text?: {
    primary?: string;
    secondary?: string;
    link?: string;
    accent?: string;
    response?: string;
  };
  background?: {
    primary?: string;
    diff?: {
      added?: string;
      removed?: string;
    };
  };
  border?: {
    default?: string;
  };
  ui?: {
    comment?: string;
    symbol?: string;
    active?: string;
    focus?: string;
    gradient?: string[];
  };
  status?: {
    error?: string;
    success?: string;
    warning?: string;
  };

  // Legacy properties (all optional)
  Background?: string;
  Foreground?: string;
  LightBlue?: string;
  AccentBlue?: string;
  AccentPurple?: string;
  AccentCyan?: string;
  AccentGreen?: string;
  AccentYellow?: string;
  AccentRed?: string;
  DiffAdded?: string;
  DiffRemoved?: string;
  Comment?: string;
  Gray?: string;
  DarkGray?: string;
  GradientColors?: string[];
}

/**
 * Browser agent custom configuration.
 * Used in agents.browser
 *
 * IMPORTANT: Keep in sync with the browser settings schema in
 * packages/cli/src/config/settingsSchema.ts (agents.browser.properties).
 */
export interface BrowserAgentCustomConfig {
  /**
   * Session mode:
   * - 'persistent': Launch Chrome with a persistent profile at ~/.cache/chrome-devtools-mcp/ (default)
   * - 'isolated': Launch Chrome with a temporary profile, cleaned up after session
   * - 'existing': Attach to an already-running Chrome instance (requires remote debugging
   *   enabled at chrome://inspect/#remote-debugging)
   */
  sessionMode?: 'isolated' | 'persistent' | 'existing';
  /** Run browser in headless mode. Default: false */
  headless?: boolean;
  /** Path to Chrome profile directory for session persistence. */
  profilePath?: string;
  /** Model for the visual agent's analyze_screenshot tool. When set, enables the tool. */
  visualModel?: string;
  /** List of allowed domains for the browser agent (e.g., ["github.com", "*.google.com"]). */
  allowedDomains?: string[];
  /** Disable user input on the browser window during automation. Default: true in non-headless mode */
  disableUserInput?: boolean;
  /** Maximum number of actions (tool calls) allowed per task. Default: 100 */
  maxActionsPerTask?: number;
  /** Whether to confirm sensitive actions (e.g., fill_form, evaluate_script). */
  confirmSensitiveActions?: boolean;
  /** Whether to block file uploads. */
  blockFileUploads?: boolean;
}

/**
 * All information required in CLI to handle an extension. Defined in Core so
 * that the collection of loaded, active, and inactive extensions can be passed
 * around on the config object though Core does not use this information
 * directly.
 */
export interface GeminiCLIExtension {
  name: string;
  version: string;
  isActive: boolean;
  path: string;
  installMetadata?: ExtensionInstallMetadata;
  mcpServers?: Record<string, MCPServerConfig>;
  contextFiles: string[];
  excludeTools?: string[];
  id: string;
  hooks?: { [K in HookEventName]?: HookDefinition[] };
  settings?: ExtensionSetting[];
  resolvedSettings?: ResolvedExtensionSetting[];
  skills?: SkillDefinition[];
  agents?: AgentDefinition[];
  /**
   * Custom themes contributed by this extension.
   * These themes will be registered when the extension is activated.
   */
  themes?: CustomTheme[];
  /**
   * Policy rules contributed by this extension.
   */
  rules?: PolicyRule[];
  /**
   * Safety checkers contributed by this extension.
   */
  checkers?: SafetyCheckerRule[];
  /**
   * Planning features configuration contributed by this extension.
   */
  plan?: {
    /**
     * The directory where planning artifacts are stored.
     */
    directory?: string;
  };
  /**
   * Used to migrate an extension to a new repository source.
   */
  migratedTo?: string;
  /** Loaded JS module for trajectory decoding */
  trajectoryProviderModule?: TrajectoryProvider;
}

export interface ExtensionInstallMetadata {
  source: string;
  type: 'git' | 'local' | 'link' | 'github-release';
  releaseTag?: string; // Only present for github-release installs.
  ref?: string;
  autoUpdate?: boolean;
  allowPreRelease?: boolean;
}

import { DEFAULT_MAX_ATTEMPTS } from '../utils/retry.js';
import {
  DEFAULT_FILE_FILTERING_OPTIONS,
  DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
  type FileFilteringOptions,
} from './constants.js';
import {
  DEFAULT_TOOL_PROTECTION_THRESHOLD,
  DEFAULT_MIN_PRUNABLE_TOKENS_THRESHOLD,
  DEFAULT_PROTECT_LATEST_TURN,
} from '../context/toolOutputMaskingService.js';

import {
  type ExtensionLoader,
  SimpleExtensionLoader,
} from '../utils/extensionLoader.js';
import { McpClientManager } from '../tools/mcp-client-manager.js';
import { A2AClientManager } from '../agents/a2a-client-manager.js';
import { type McpContext } from '../tools/mcp-client.js';
import type { EnvironmentSanitizationConfig } from '../services/environmentSanitization.js';

export type { FileFilteringOptions };
export {
  DEFAULT_FILE_FILTERING_OPTIONS,
  DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
};

export const DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD = 40_000;

export class MCPServerConfig {
  constructor(
    // For stdio transport
    readonly command?: string,
    readonly args?: string[],
    readonly env?: Record<string, string>,
    readonly cwd?: string,
    // For sse transport
    readonly url?: string,
    // For streamable http transport
    readonly httpUrl?: string,
    readonly headers?: Record<string, string>,
    // For websocket transport
    readonly tcp?: string,
    // Transport type (optional, for use with 'url' field)
    // When set to 'http', uses StreamableHTTPClientTransport
    // When set to 'sse', uses SSEClientTransport
    // When omitted, auto-detects transport type
    // Note: 'httpUrl' is deprecated in favor of 'url' + 'type'
    readonly type?: 'sse' | 'http',
    // Common
    readonly timeout?: number,
    readonly trust?: boolean,
    // Metadata
    readonly description?: string,
    readonly includeTools?: string[],
    readonly excludeTools?: string[],
    readonly extension?: GeminiCLIExtension,
    // OAuth configuration
    readonly oauth?: MCPOAuthConfig,
    readonly authProviderType?: AuthProviderType,
    // Service Account Configuration
    /* targetAudience format: CLIENT_ID.apps.googleusercontent.com */
    readonly targetAudience?: string,
    /* targetServiceAccount format: <service-account-name>@<project-num>.iam.gserviceaccount.com */
    readonly targetServiceAccount?: string,
  ) {}
}

export enum AuthProviderType {
  DYNAMIC_DISCOVERY = 'dynamic_discovery',
  GOOGLE_CREDENTIALS = 'google_credentials',
  SERVICE_ACCOUNT_IMPERSONATION = 'service_account_impersonation',
}

export interface SandboxConfig {
  enabled: boolean;
  allowedPaths?: string[];
  includeDirectories?: string[];
  networkAccess?: boolean;
  command?:
    | 'docker'
    | 'podman'
    | 'sandbox-exec'
    | 'runsc'
    | 'lxc'
    | 'windows-native';
  image?: string;
}

export const ConfigSchema = z.object({
  sandbox: z
    .object({
      enabled: z.boolean().default(false),
      allowedPaths: z.array(z.string()).default([]),
      includeDirectories: z.array(z.string()).default([]),
      networkAccess: z.boolean().default(false),
      command: z
        .enum([
          'docker',
          'podman',
          'sandbox-exec',
          'runsc',
          'lxc',
          'windows-native',
        ])
        .optional(),
      image: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (data.enabled && !data.command) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Sandbox command is required when sandbox is enabled',
          path: ['command'],
        });
      }
    })
    .optional(),
});

/**
 * Callbacks for checking MCP server enablement status.
 * These callbacks are provided by the CLI package to bridge
 * the enablement state to the core package.
 */
export interface McpEnablementCallbacks {
  /** Check if a server is disabled for the current session only */
  isSessionDisabled: (serverId: string) => boolean;
  /** Check if a server is enabled in the file-based configuration */
  isFileEnabled: (serverId: string) => Promise<boolean>;
}

export interface PolicyUpdateConfirmationRequest {
  scope: string;
  identifier: string;
  policyDir: string;
  newHash: string;
}

export interface WorktreeSettings {
  name: string;
  path: string;
  baseSha: string;
}

export interface ConfigParameters {
  sessionId: string;
  clientName?: string;
  clientVersion?: string;
  embeddingModel?: string;
  sandbox?: SandboxConfig;
  toolSandboxing?: boolean;
  targetDir: string;
  debugMode: boolean;
  question?: string;

  coreTools?: string[];
  mainAgentTools?: string[];
  /** @deprecated Use Policy Engine instead */
  allowedTools?: string[];
  /** @deprecated Use Policy Engine instead */
  excludeTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  mcpEnablementCallbacks?: McpEnablementCallbacks;
  userMemory?: string | HierarchicalMemory;
  geminiMdFileCount?: number;
  geminiMdFilePaths?: string[];
  approvalMode?: ApprovalMode;
  showMemoryUsage?: boolean;
  contextFileName?: string | string[];
  accessibility?: AccessibilitySettings;
  telemetry?: TelemetrySettings;
  usageStatisticsEnabled?: boolean;
  fileFiltering?: {
    respectGitIgnore?: boolean;
    respectGeminiIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
    enableFuzzySearch?: boolean;
    maxFileCount?: number;
    searchTimeout?: number;
    customIgnoreFilePaths?: string[];
  };
  checkpointing?: boolean;
  proxy?: string;
  cwd: string;
  fileDiscoveryService?: FileDiscoveryService;
  includeDirectories?: string[];
  bugCommand?: BugCommandSettings;
  model: string;
  disableLoopDetection?: boolean;
  maxSessionTurns?: number;
  acpMode?: boolean;
  listSessions?: boolean;
  deleteSession?: string;
  listExtensions?: boolean;
  extensionLoader?: ExtensionLoader;
  enabledExtensions?: string[];
  enableExtensionReloading?: boolean;
  allowedMcpServers?: string[];
  blockedMcpServers?: string[];
  allowedEnvironmentVariables?: string[];
  blockedEnvironmentVariables?: string[];
  enableEnvironmentVariableRedaction?: boolean;
  noBrowser?: boolean;
  summarizeToolOutput?: Record<string, SummarizeToolOutputSettings>;
  folderTrust?: boolean;
  ideMode?: boolean;
  loadMemoryFromIncludeDirectories?: boolean;
  includeDirectoryTree?: boolean;
  importFormat?: 'tree' | 'flat';
  discoveryMaxDirs?: number;
  compressionThreshold?: number;
  interactive?: boolean;
  trustedFolder?: boolean;
  useBackgroundColor?: boolean;
  useAlternateBuffer?: boolean;
  useTerminalBuffer?: boolean;
  useRenderProcess?: boolean;
  useRipgrep?: boolean;
  enableInteractiveShell?: boolean;
  shellBackgroundCompletionBehavior?: string;
  skipNextSpeakerCheck?: boolean;
  shellExecutionConfig?: ShellExecutionConfig;
  extensionManagement?: boolean;
  extensionRegistryURI?: string;
  truncateToolOutputThreshold?: number;
  eventEmitter?: EventEmitter;
  useWriteTodos?: boolean;
  workspacePoliciesDir?: string;
  policyEngineConfig?: PolicyEngineConfig;
  directWebFetch?: boolean;
  policyUpdateConfirmationRequest?: PolicyUpdateConfirmationRequest;
  output?: OutputSettings;
  gemmaModelRouter?: GemmaModelRouterSettings;
  adk?: ADKSettings;
  disableModelRouterForAuth?: AuthType[];
  continueOnFailedApiCall?: boolean;
  retryFetchErrors?: boolean;
  maxAttempts?: number;
  enableShellOutputEfficiency?: boolean;
  shellToolInactivityTimeout?: number;
  fakeResponses?: string;
  recordResponses?: string;
  ptyInfo?: string;
  disableYoloMode?: boolean;
  disableAlwaysAllow?: boolean;
  rawOutput?: boolean;
  acceptRawOutputRisk?: boolean;
  dynamicModelConfiguration?: boolean;
  modelConfigServiceConfig?: ModelConfigServiceConfig;
  enableHooks?: boolean;
  enableHooksUI?: boolean;
  experiments?: Experiments;
  contextManagement?: Partial<ContextManagementConfig>;
  hooks?: { [K in HookEventName]?: HookDefinition[] };
  disabledHooks?: string[];
  projectHooks?: { [K in HookEventName]?: HookDefinition[] };
  enableAgents?: boolean;
  enableEventDrivenScheduler?: boolean;
  skillsSupport?: boolean;
  disabledSkills?: string[];
  adminSkillsEnabled?: boolean;
  experimentalJitContext?: boolean;
  autoDistillation?: boolean;
  experimentalMemoryManager?: boolean;
  experimentalAgentHistoryTruncation?: boolean;
  experimentalAgentHistoryTruncationThreshold?: number;
  experimentalAgentHistoryRetainedMessages?: number;
  experimentalAgentHistorySummarization?: boolean;
  memoryBoundaryMarkers?: string[];
  topicUpdateNarration?: boolean;

  disableLLMCorrection?: boolean;
  plan?: boolean;
  tracker?: boolean;
  planSettings?: PlanSettings;
  worktreeSettings?: WorktreeSettings;
  modelSteering?: boolean;
  onModelChange?: (model: string) => void;
  mcpEnabled?: boolean;
  extensionsEnabled?: boolean;
  agents?: AgentSettings;
  onReload?: () => Promise<{
    disabledSkills?: string[];
    adminSkillsEnabled?: boolean;
    agents?: AgentSettings;
  }>;
  enableConseca?: boolean;
  billing?: {
    overageStrategy?: OverageStrategy;
  };
}

export class Config implements McpContext, AgentLoopContext {
  private _toolRegistry!: ToolRegistry;
  private mcpClientManager?: McpClientManager;
  private readonly a2aClientManager?: A2AClientManager;
  private allowedMcpServers: string[];
  private blockedMcpServers: string[];
  private allowedEnvironmentVariables: string[];
  private blockedEnvironmentVariables: string[];
  private readonly enableEnvironmentVariableRedaction: boolean;
  private _promptRegistry!: PromptRegistry;
  private _resourceRegistry!: ResourceRegistry;
  private agentRegistry!: AgentRegistry;
  private readonly acknowledgedAgentsService: AcknowledgedAgentsService;
  private skillManager!: SkillManager;
  private _sessionId: string;
  private readonly clientName: string | undefined;
  private clientVersion: string;
  private fileSystemService: FileSystemService;
  private trackerService?: TrackerService;
  readonly topicState = new TopicState();
  private contentGeneratorConfig!: ContentGeneratorConfig;
  private contentGenerator!: ContentGenerator;
  readonly modelConfigService: ModelConfigService;
  private readonly embeddingModel: string;
  private readonly sandbox: SandboxConfig | undefined;
  private _sandboxForbiddenPaths: string[] | undefined;
  private readonly targetDir: string;
  private workspaceContext: WorkspaceContext;
  private readonly debugMode: boolean;
  private readonly question: string | undefined;
  private readonly worktreeSettings: WorktreeSettings | undefined;
  readonly enableConseca: boolean;

  private readonly coreTools: string[] | undefined;
  private readonly mainAgentTools: string[] | undefined;
  /** @deprecated Use Policy Engine instead */
  private readonly allowedTools: string[] | undefined;
  /** @deprecated Use Policy Engine instead */
  private readonly excludeTools: string[] | undefined;
  private readonly toolDiscoveryCommand: string | undefined;
  private readonly toolCallCommand: string | undefined;
  private readonly mcpServerCommand: string | undefined;
  private readonly mcpEnabled: boolean;
  private readonly extensionsEnabled: boolean;
  private mcpServers: Record<string, MCPServerConfig> | undefined;
  private readonly mcpEnablementCallbacks?: McpEnablementCallbacks;
  private userMemory: string | HierarchicalMemory;
  private geminiMdFileCount: number;
  private geminiMdFilePaths: string[];
  private readonly showMemoryUsage: boolean;
  private readonly accessibility: AccessibilitySettings;
  private readonly telemetrySettings: TelemetrySettings;
  private readonly usageStatisticsEnabled: boolean;
  private _geminiClient!: GeminiClient;
  private _sandboxManager: SandboxManager;
  private readonly _sandboxPolicyManager: SandboxPolicyManager;
  private baseLlmClient!: BaseLlmClient;
  private localLiteRtLmClient?: LocalLiteRtLmClient;
  private modelRouterService: ModelRouterService;
  private readonly modelAvailabilityService: ModelAvailabilityService;
  private readonly fileFiltering: {
    respectGitIgnore: boolean;
    respectGeminiIgnore: boolean;
    enableRecursiveFileSearch: boolean;
    enableFuzzySearch: boolean;
    maxFileCount: number;
    searchTimeout: number;
    customIgnoreFilePaths: string[];
  };
  private fileDiscoveryService: FileDiscoveryService | null = null;
  private gitService: GitService | undefined = undefined;
  private readonly checkpointing: boolean;
  private readonly proxy: string | undefined;
  private readonly cwd: string;
  private readonly bugCommand: BugCommandSettings | undefined;
  private model: string;
  private readonly disableLoopDetection: boolean;
  // null = unknown (quota not fetched); true = has access; false = definitively no access
  private hasAccessToPreviewModel: boolean | null = null;
  private readonly noBrowser: boolean;
  private readonly folderTrust: boolean;
  private ideMode: boolean;

  private _activeModel: string;
  private readonly maxSessionTurns: number;
  private readonly listSessions: boolean;
  private readonly deleteSession: string | undefined;
  private readonly listExtensions: boolean;
  private readonly _extensionLoader: ExtensionLoader;
  private readonly _enabledExtensions: string[];
  private readonly enableExtensionReloading: boolean;
  fallbackModelHandler?: FallbackModelHandler;
  validationHandler?: ValidationHandler;
  private quotaErrorOccurred: boolean = false;
  private creditsNotificationShown: boolean = false;
  private modelQuotas: Map<
    string,
    { remaining: number; limit: number; resetTime?: string }
  > = new Map();
  private lastRetrievedQuota?: RetrieveUserQuotaResponse;
  private lastQuotaFetchTime = 0;
  private lastEmittedQuotaRemaining: number | undefined;
  private lastEmittedQuotaLimit: number | undefined;

  private emitQuotaChangedEvent(): void {
    const pooled = this.getPooledQuota();
    if (
      this.lastEmittedQuotaRemaining !== pooled.remaining ||
      this.lastEmittedQuotaLimit !== pooled.limit
    ) {
      this.lastEmittedQuotaRemaining = pooled.remaining;
      this.lastEmittedQuotaLimit = pooled.limit;
      coreEvents.emitQuotaChanged(
        pooled.remaining,
        pooled.limit,
        pooled.resetTime,
      );
    }
  }

  private readonly summarizeToolOutput:
    | Record<string, SummarizeToolOutputSettings>
    | undefined;
  private readonly acpMode: boolean = false;
  private readonly loadMemoryFromIncludeDirectories: boolean = false;
  private readonly includeDirectoryTree: boolean = true;
  private readonly importFormat: 'tree' | 'flat';
  private readonly discoveryMaxDirs: number;
  private readonly compressionThreshold: number | undefined;
  /** Public for testing only */
  readonly interactive: boolean;
  private readonly ptyInfo: string;
  private readonly trustedFolder: boolean | undefined;
  private readonly directWebFetch: boolean;
  private readonly useRipgrep: boolean;
  private readonly enableInteractiveShell: boolean;
  private readonly shellBackgroundCompletionBehavior:
    | 'inject'
    | 'notify'
    | 'silent';
  private readonly skipNextSpeakerCheck: boolean;
  private readonly useBackgroundColor: boolean;
  private readonly useAlternateBuffer: boolean;
  private readonly useTerminalBuffer: boolean;
  private readonly useRenderProcess: boolean;
  private shellExecutionConfig: ShellExecutionConfig;
  private readonly extensionManagement: boolean = true;
  private readonly extensionRegistryURI: string | undefined;
  private readonly truncateToolOutputThreshold: number;
  private compressionTruncationCounter = 0;
  private initialized = false;
  private initPromise: Promise<void> | undefined;
  private mcpInitializationPromise: Promise<void> | null = null;
  readonly storage: Storage;
  private readonly fileExclusions: FileExclusions;
  private readonly eventEmitter?: EventEmitter;
  private readonly useWriteTodos: boolean;
  private readonly workspacePoliciesDir: string | undefined;
  private readonly _messageBus: MessageBus;
  private readonly policyEngine: PolicyEngine;
  private policyUpdateConfirmationRequest:
    | PolicyUpdateConfirmationRequest
    | undefined;
  private readonly outputSettings: OutputSettings;

  private readonly gemmaModelRouter: GemmaModelRouterSettings;
  private readonly agentSessionNoninteractiveEnabled: boolean;
  private readonly agentSessionInteractiveEnabled: boolean;

  private readonly continueOnFailedApiCall: boolean;
  private readonly retryFetchErrors: boolean;
  private readonly maxAttempts: number;
  private readonly enableShellOutputEfficiency: boolean;
  private readonly shellToolInactivityTimeout: number;
  readonly fakeResponses?: string;
  readonly recordResponses?: string;
  private readonly disableYoloMode: boolean;
  private readonly disableAlwaysAllow: boolean;
  private readonly rawOutput: boolean;
  private readonly acceptRawOutputRisk: boolean;
  private readonly dynamicModelConfiguration: boolean;
  private pendingIncludeDirectories: string[];
  private readonly enableHooksUI: boolean;
  private readonly enableHooks: boolean;

  private hooks: { [K in HookEventName]?: HookDefinition[] } | undefined;
  private projectHooks:
    | ({ [K in HookEventName]?: HookDefinition[] } & { disabled?: string[] })
    | undefined;
  private disabledHooks: string[];
  private experiments: Experiments | undefined;
  private experimentsPromise: Promise<Experiments | undefined> | undefined;
  private hookSystem?: HookSystem;
  private readonly onModelChange: ((model: string) => void) | undefined;
  private readonly onReload:
    | (() => Promise<{
        disabledSkills?: string[];
        adminSkillsEnabled?: boolean;
        agents?: AgentSettings;
      }>)
    | undefined;

  private readonly billing: {
    overageStrategy: OverageStrategy;
  };

  private readonly enableAgents: boolean;
  private agents: AgentSettings;
  private readonly enableEventDrivenScheduler: boolean;
  private readonly skillsSupport: boolean;
  private disabledSkills: string[];
  private readonly adminSkillsEnabled: boolean;
  private readonly experimentalJitContext: boolean;
  private readonly experimentalMemoryManager: boolean;
  private readonly memoryBoundaryMarkers: readonly string[];
  private readonly topicUpdateNarration: boolean;
  private readonly disableLLMCorrection: boolean;
  private readonly planEnabled: boolean;
  private readonly trackerEnabled: boolean;
  private readonly planModeRoutingEnabled: boolean;
  private readonly modelSteering: boolean;
  private memoryContextManager?: MemoryContextManager;
  private readonly contextManagement: ContextManagementConfig;
  private terminalBackground: string | undefined = undefined;
  private remoteAdminSettings: AdminControlsSettings | undefined;
  private latestApiRequest: GenerateContentParameters | undefined;
  private lastModeSwitchTime: number = performance.now();
  readonly injectionService: InjectionService;
  private approvedPlanPath: string | undefined;

  constructor(params: ConfigParameters) {
    this._sessionId = params.sessionId;
    this.clientName = params.clientName;
    this.clientVersion = params.clientVersion ?? 'unknown';
    this.approvedPlanPath = undefined;
    this.embeddingModel =
      params.embeddingModel ?? DEFAULT_GEMINI_EMBEDDING_MODEL;
    this.sandbox = params.sandbox
      ? {
          enabled: params.sandbox.enabled || params.toolSandboxing || false,
          allowedPaths: params.sandbox.allowedPaths ?? [],
          includeDirectories: [
            ...(params.sandbox.includeDirectories ?? []),
            ...(params.sandbox.allowedPaths ?? []),
            Storage.getGlobalTempDir(),
          ],
          networkAccess: params.sandbox.networkAccess ?? false,
          command: params.sandbox.command,
          image: params.sandbox.image,
        }
      : {
          enabled: params.toolSandboxing || false,
          allowedPaths: [],
          includeDirectories: [Storage.getGlobalTempDir()],
          networkAccess: false,
        };

    this.targetDir = path.resolve(params.targetDir);
    this.folderTrust = params.folderTrust ?? false;
    this.workspaceContext = new WorkspaceContext(this.targetDir, []);
    this.pendingIncludeDirectories = params.includeDirectories ?? [];
    this.debugMode = params.debugMode;
    this.question = params.question;
    this.worktreeSettings = params.worktreeSettings;

    this._sandboxPolicyManager = new SandboxPolicyManager();
    const initialApprovalMode =
      params.approvalMode ??
      params.policyEngineConfig?.approvalMode ??
      'default';

    this._sandboxManager = createSandboxManager(
      this.sandbox,
      {
        workspace: this.targetDir,
        forbiddenPaths: this.getSandboxForbiddenPaths.bind(this),
        includeDirectories: [
          ...this.pendingIncludeDirectories,
          Storage.getGlobalTempDir(),
        ],
        policyManager: this._sandboxPolicyManager,
      },
      initialApprovalMode,
    );

    if (
      !(this._sandboxManager instanceof NoopSandboxManager) &&
      this.sandbox?.enabled
    ) {
      this.fileSystemService = new SandboxedFileSystemService(
        this._sandboxManager,
        params.targetDir,
      );
    } else {
      this.fileSystemService = new StandardFileSystemService();
    }

    this.debugMode = params.debugMode;
    this.question = params.question;
    this.worktreeSettings = params.worktreeSettings;

    this.coreTools = params.coreTools;
    this.mainAgentTools = params.mainAgentTools;
    this.allowedTools = params.allowedTools;
    this.excludeTools = params.excludeTools;
    this.toolDiscoveryCommand = params.toolDiscoveryCommand;
    this.toolCallCommand = params.toolCallCommand;
    this.mcpServerCommand = params.mcpServerCommand;
    this.mcpServers = params.mcpServers;
    this.mcpEnablementCallbacks = params.mcpEnablementCallbacks;
    this.mcpEnabled = params.mcpEnabled ?? true;
    this.extensionsEnabled = params.extensionsEnabled ?? true;
    this.allowedMcpServers = params.allowedMcpServers ?? [];
    this.blockedMcpServers = params.blockedMcpServers ?? [];
    this.allowedEnvironmentVariables = params.allowedEnvironmentVariables ?? [];
    this.blockedEnvironmentVariables = params.blockedEnvironmentVariables ?? [];
    this.enableEnvironmentVariableRedaction =
      params.enableEnvironmentVariableRedaction ?? false;
    this.userMemory = params.userMemory ?? '';
    this.geminiMdFileCount = params.geminiMdFileCount ?? 0;
    this.geminiMdFilePaths = params.geminiMdFilePaths ?? [];
    this.showMemoryUsage = params.showMemoryUsage ?? false;
    this.accessibility = params.accessibility ?? {};
    this.telemetrySettings = {
      enabled: params.telemetry?.enabled ?? false,
      target: params.telemetry?.target ?? DEFAULT_TELEMETRY_TARGET,
      otlpEndpoint: params.telemetry?.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT,
      otlpProtocol: params.telemetry?.otlpProtocol,
      logPrompts: params.telemetry?.logPrompts ?? true,
      outfile: params.telemetry?.outfile,
      useCollector: params.telemetry?.useCollector,
      useCliAuth: params.telemetry?.useCliAuth,
    };
    this.usageStatisticsEnabled = params.usageStatisticsEnabled ?? true;

    this.fileFiltering = {
      respectGitIgnore:
        params.fileFiltering?.respectGitIgnore ??
        DEFAULT_FILE_FILTERING_OPTIONS.respectGitIgnore,
      respectGeminiIgnore:
        params.fileFiltering?.respectGeminiIgnore ??
        DEFAULT_FILE_FILTERING_OPTIONS.respectGeminiIgnore,
      enableRecursiveFileSearch:
        params.fileFiltering?.enableRecursiveFileSearch ?? true,
      enableFuzzySearch: params.fileFiltering?.enableFuzzySearch ?? true,
      maxFileCount:
        params.fileFiltering?.maxFileCount ??
        DEFAULT_FILE_FILTERING_OPTIONS.maxFileCount ??
        20000,
      searchTimeout:
        params.fileFiltering?.searchTimeout ??
        DEFAULT_FILE_FILTERING_OPTIONS.searchTimeout ??
        5000,
      customIgnoreFilePaths: params.fileFiltering?.customIgnoreFilePaths ?? [],
    };
    this.checkpointing = params.checkpointing ?? false;
    this.proxy = params.proxy;
    this.cwd = params.cwd ?? process.cwd();
    this.fileDiscoveryService = params.fileDiscoveryService ?? null;
    this.bugCommand = params.bugCommand;
    this.model = params.model;
    this.disableLoopDetection = params.disableLoopDetection ?? false;
    this._activeModel = params.model;
    this.enableAgents = params.enableAgents ?? true;
    this.agents = params.agents ?? {};
    this.disableLLMCorrection = params.disableLLMCorrection ?? true;
    this.planEnabled = params.plan ?? true;
    this.trackerEnabled = params.tracker ?? false;
    this.planModeRoutingEnabled = params.planSettings?.modelRouting ?? true;
    this.enableEventDrivenScheduler = params.enableEventDrivenScheduler ?? true;
    this.skillsSupport = params.skillsSupport ?? true;
    this.disabledSkills = params.disabledSkills ?? [];
    this.adminSkillsEnabled = params.adminSkillsEnabled ?? true;
    this.modelAvailabilityService = new ModelAvailabilityService();
    this.dynamicModelConfiguration = params.dynamicModelConfiguration ?? false;

    // HACK: The settings loading logic doesn't currently merge the default
    // generation config with the user's settings. This means if a user provides
    // any `generation` settings (e.g., just `overrides`), the default `aliases`
    // are lost. This hack manually merges the default aliases back in if they
    // are missing from the user's config.
    // TODO(12593): Fix the settings loading logic to properly merge defaults and
    // remove this hack.
    let modelConfigServiceConfig = params.modelConfigServiceConfig;
    if (modelConfigServiceConfig) {
      // Ensure user-defined model definitions augment, not replace, the defaults.
      const mergedModelDefinitions = {
        ...DEFAULT_MODEL_CONFIGS.modelDefinitions,
        ...modelConfigServiceConfig.modelDefinitions,
      };
      const mergedModelIdResolutions = {
        ...DEFAULT_MODEL_CONFIGS.modelIdResolutions,
        ...modelConfigServiceConfig.modelIdResolutions,
      };
      const mergedClassifierIdResolutions = {
        ...DEFAULT_MODEL_CONFIGS.classifierIdResolutions,
        ...modelConfigServiceConfig.classifierIdResolutions,
      };
      const mergedModelChains = {
        ...DEFAULT_MODEL_CONFIGS.modelChains,
        ...modelConfigServiceConfig.modelChains,
      };

      modelConfigServiceConfig = {
        // Preserve other user settings like customAliases
        ...modelConfigServiceConfig,
        // Apply defaults for aliases and overrides if they are not provided
        aliases:
          modelConfigServiceConfig.aliases ?? DEFAULT_MODEL_CONFIGS.aliases,
        overrides:
          modelConfigServiceConfig.overrides ?? DEFAULT_MODEL_CONFIGS.overrides,
        // Use the merged model definitions
        modelDefinitions: mergedModelDefinitions,
        modelIdResolutions: mergedModelIdResolutions,
        classifierIdResolutions: mergedClassifierIdResolutions,
        modelChains: mergedModelChains,
      };
    }

    this.modelConfigService = new ModelConfigService(
      modelConfigServiceConfig ?? DEFAULT_MODEL_CONFIGS,
    );

    this.experimentalJitContext = params.experimentalJitContext ?? false;
    this.experimentalMemoryManager = params.experimentalMemoryManager ?? false;
    this.memoryBoundaryMarkers = params.memoryBoundaryMarkers ?? ['.git'];
    this.contextManagement = {
      enabled: params.contextManagement?.enabled ?? false,
      historyWindow: {
        maxTokens: params.contextManagement?.historyWindow?.maxTokens ?? 150000,
        retainedTokens:
          params.contextManagement?.historyWindow?.retainedTokens ?? 40000,
      },
      messageLimits: {
        normalMaxTokens:
          params.contextManagement?.messageLimits?.normalMaxTokens ?? 2500,
        retainedMaxTokens:
          params.contextManagement?.messageLimits?.retainedMaxTokens ?? 12000,
        normalizationHeadRatio:
          params.contextManagement?.messageLimits?.normalizationHeadRatio ??
          0.25,
      },
      tools: {
        distillation: {
          maxOutputTokens:
            params.contextManagement?.tools?.distillation?.maxOutputTokens ??
            10000,
          summarizationThresholdTokens:
            params.contextManagement?.tools?.distillation
              ?.summarizationThresholdTokens ?? 20000,
        },
        outputMasking: {
          protectionThresholdTokens:
            params.contextManagement?.tools?.outputMasking
              ?.protectionThresholdTokens ?? DEFAULT_TOOL_PROTECTION_THRESHOLD,
          minPrunableThresholdTokens:
            params.contextManagement?.tools?.outputMasking
              ?.minPrunableThresholdTokens ??
            DEFAULT_MIN_PRUNABLE_TOKENS_THRESHOLD,
          protectLatestTurn:
            params.contextManagement?.tools?.outputMasking?.protectLatestTurn ??
            DEFAULT_PROTECT_LATEST_TURN,
        },
      },
    };
    this.topicUpdateNarration = params.topicUpdateNarration ?? false;
    this.modelSteering = params.modelSteering ?? false;
    this.injectionService = new InjectionService(() =>
      this.isModelSteeringEnabled(),
    );
    ExecutionLifecycleService.setInjectionService(this.injectionService);
    this.maxSessionTurns = params.maxSessionTurns ?? -1;
    this.acpMode = params.acpMode ?? false;
    this.listSessions = params.listSessions ?? false;
    this.deleteSession = params.deleteSession;
    this.listExtensions = params.listExtensions ?? false;
    this._extensionLoader =
      params.extensionLoader ?? new SimpleExtensionLoader([]);
    this._enabledExtensions = params.enabledExtensions ?? [];
    this.noBrowser = params.noBrowser ?? false;
    this.summarizeToolOutput = params.summarizeToolOutput;
    this.folderTrust = params.folderTrust ?? false;
    this.ideMode = params.ideMode ?? false;
    this.includeDirectoryTree = params.includeDirectoryTree ?? true;
    this.loadMemoryFromIncludeDirectories =
      params.loadMemoryFromIncludeDirectories ?? false;
    this.importFormat = params.importFormat ?? 'tree';
    this.discoveryMaxDirs = params.discoveryMaxDirs ?? 200;
    this.compressionThreshold = params.compressionThreshold;
    this.interactive = params.interactive ?? false;
    this.ptyInfo = params.ptyInfo ?? 'child_process';
    this.trustedFolder = params.trustedFolder;
    this.directWebFetch = params.directWebFetch ?? false;
    this.useRipgrep = params.useRipgrep ?? true;
    this.useBackgroundColor = params.useBackgroundColor ?? true;
    this.useAlternateBuffer = params.useAlternateBuffer ?? false;
    this.useTerminalBuffer = params.useTerminalBuffer ?? false;
    this.useRenderProcess = params.useRenderProcess ?? true;
    this.enableInteractiveShell = params.enableInteractiveShell ?? false;

    const requestedBehavior = params.shellBackgroundCompletionBehavior;
    if (requestedBehavior === 'inject' || requestedBehavior === 'notify') {
      this.shellBackgroundCompletionBehavior = requestedBehavior;
    } else {
      this.shellBackgroundCompletionBehavior = 'silent';
    }

    this.skipNextSpeakerCheck = params.skipNextSpeakerCheck ?? true;
    this.shellExecutionConfig = {
      terminalWidth: params.shellExecutionConfig?.terminalWidth ?? 80,
      terminalHeight: params.shellExecutionConfig?.terminalHeight ?? 24,
      showColor: params.shellExecutionConfig?.showColor ?? false,
      pager: params.shellExecutionConfig?.pager ?? 'cat',
      sanitizationConfig: this.sanitizationConfig,
      sandboxManager: this._sandboxManager,
      sandboxConfig: this.sandbox,
      backgroundCompletionBehavior: this.shellBackgroundCompletionBehavior,
    };
    this.truncateToolOutputThreshold =
      params.truncateToolOutputThreshold ??
      DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD;
    const isGemini2 = isGemini2Model(this.model);
    this.useWriteTodos =
      isGemini2 && !isPreviewModel(this.model, this) && !this.trackerEnabled
        ? (params.useWriteTodos ?? true)
        : false;
    this.workspacePoliciesDir = params.workspacePoliciesDir;
    this.enableHooksUI = params.enableHooksUI ?? true;
    this.enableHooks = params.enableHooks ?? true;
    this.disabledHooks = params.disabledHooks ?? [];

    this.continueOnFailedApiCall = params.continueOnFailedApiCall ?? true;
    this.enableShellOutputEfficiency =
      params.enableShellOutputEfficiency ?? true;
    this.shellToolInactivityTimeout =
      (params.shellToolInactivityTimeout ?? 300) * 1000; // 5 minutes
    this.extensionManagement = params.extensionManagement ?? true;
    this.extensionRegistryURI = params.extensionRegistryURI;
    this.enableExtensionReloading = params.enableExtensionReloading ?? false;
    this.storage = new Storage(this.targetDir, this._sessionId);
    this.storage.setCustomPlansDir(params.planSettings?.directory);

    this.fakeResponses = params.fakeResponses;
    this.recordResponses = params.recordResponses;
    this.fileExclusions = new FileExclusions(this);
    this.eventEmitter = params.eventEmitter;
    this.enableConseca = params.enableConseca ?? false;

    // Initialize Safety Infrastructure
    const contextBuilder = new ContextBuilder(this);
    const checkersPath = this.targetDir;
    // The checkersPath  is used to resolve external checkers. Since we do not have any external checkers currently, it is set to the targetDir.
    const checkerRegistry = new CheckerRegistry(checkersPath);
    const checkerRunner = new CheckerRunner(contextBuilder, checkerRegistry, {
      checkersPath,
      timeout: 30000, // 30 seconds to allow for LLM-based checkers
    });
    this.policyUpdateConfirmationRequest =
      params.policyUpdateConfirmationRequest;

    this.disableAlwaysAllow = params.disableAlwaysAllow ?? false;
    const engineApprovalMode =
      params.approvalMode ??
      params.policyEngineConfig?.approvalMode ??
      ApprovalMode.DEFAULT;
    this.policyEngine = new PolicyEngine(
      {
        ...params.policyEngineConfig,
        approvalMode: engineApprovalMode,
        disableAlwaysAllow: this.disableAlwaysAllow,
        sandboxManager: this._sandboxManager,
      },
      checkerRunner,
    );

    // Register Conseca if enabled
    if (this.enableConseca) {
      debugLogger.log('[SAFETY] Registering Conseca Safety Checker');
      ConsecaSafetyChecker.getInstance().setContext(this);
    }

    this._messageBus = new MessageBus(this.policyEngine, this.debugMode);
    this.acknowledgedAgentsService = new AcknowledgedAgentsService();
    this.skillManager = new SkillManager();
    this.outputSettings = {
      format: params.output?.format ?? OutputFormat.TEXT,
    };
    this.gemmaModelRouter = {
      enabled: params.gemmaModelRouter?.enabled ?? false,
      classifier: {
        host:
          params.gemmaModelRouter?.classifier?.host ?? 'http://localhost:9379',
        model:
          params.gemmaModelRouter?.classifier?.model ?? 'gemma3-1b-gpu-custom',
      },
    };

    this.agentSessionNoninteractiveEnabled =
      params.adk?.agentSessionNoninteractiveEnabled ?? false;
    this.agentSessionInteractiveEnabled =
      params.adk?.agentSessionInteractiveEnabled ?? false;
    this.retryFetchErrors = params.retryFetchErrors ?? true;
    this.maxAttempts = Math.min(
      params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      DEFAULT_MAX_ATTEMPTS,
    );
    this.disableYoloMode = params.disableYoloMode ?? false;
    this.rawOutput = params.rawOutput ?? false;
    this.acceptRawOutputRisk = params.acceptRawOutputRisk ?? false;

    if (params.hooks) {
      this.hooks = params.hooks;
    }
    if (params.projectHooks) {
      this.projectHooks = params.projectHooks;
    }

    this.experiments = params.experiments;
    this.onModelChange = params.onModelChange;
    this.onReload = params.onReload;

    this.billing = {
      overageStrategy: params.billing?.overageStrategy ?? 'ask',
    };

    if (params.contextFileName) {
      setGeminiMdFilename(params.contextFileName);
    }

    if (this.telemetrySettings.enabled) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      initializeTelemetry(this);
    }

    const proxy = this.getProxy();
    if (proxy) {
      try {
        setGlobalProxy(proxy);
      } catch (error) {
        coreEvents.emitFeedback(
          'error',
          'Invalid proxy configuration detected. Check debug drawer for more details (F12)',
          error,
        );
      }
    }
    this._geminiClient = new GeminiClient(this);
    this.a2aClientManager = new A2AClientManager(this);
    this.modelRouterService = new ModelRouterService(this);
  }

  get config(): Config {
    return this;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Dedups initialization requests using a shared promise that is only resolved
   * once.
   */
  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._initialize();

    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    await this.storage.initialize();

    // Add pending directories to workspace context
    for (const dir of this.pendingIncludeDirectories) {
      this.workspaceContext.addDirectory(dir);
    }

    // Add plans directory to workspace context for plan file storage
    if (this.planEnabled) {
      const plansDir = this.storage.getPlansDir();
      try {
        await fs.promises.access(plansDir);
        this.workspaceContext.addDirectory(plansDir);
      } catch {
        // Directory does not exist yet, so we don't add it to the workspace context.
        // It will be created when the first plan is written. Since custom plan
        // directories must be within the project root, they are automatically
        // covered by the project-wide file discovery once created.
      }
    }

    // Initialize centralized FileDiscoveryService
    const discoverToolsHandle = startupProfiler.start('discover_tools');
    this.getFileService();
    if (this.getCheckpointingEnabled()) {
      await this.getGitService();
    }
    this._promptRegistry = new PromptRegistry();
    this._resourceRegistry = new ResourceRegistry();

    this.agentRegistry = new AgentRegistry(this);
    await this.agentRegistry.initialize();

    coreEvents.on(CoreEvent.AgentsRefreshed, this.onAgentsRefreshed);

    this._toolRegistry = await this.createToolRegistry();
    discoverToolsHandle?.end();
    this.mcpClientManager = new McpClientManager(
      this.clientVersion,
      this,
      this.eventEmitter,
    );
    this.mcpClientManager.setMainRegistries({
      toolRegistry: this._toolRegistry,
      promptRegistry: this.promptRegistry,
      resourceRegistry: this.resourceRegistry,
    });
    // We do not await this promise so that the CLI can start up even if
    // MCP servers are slow to connect.
    this.mcpInitializationPromise = Promise.allSettled([
      this.mcpClientManager.startConfiguredMcpServers(),
      this.getExtensionLoader().start(this),
    ]).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected') {
          debugLogger.error('Error initializing MCP clients:', result.reason);
        }
      }
    });

    if (!this.interactive || this.acpMode) {
      await this.mcpInitializationPromise;
    }

    if (this.skillsSupport) {
      this.getSkillManager().setAdminSettings(this.adminSkillsEnabled);
      if (this.adminSkillsEnabled) {
        await this.getSkillManager().discoverSkills(
          this.storage,
          this.getExtensions(),
          this.isTrustedFolder(),
        );
        this.getSkillManager().setDisabledSkills(this.disabledSkills);

        // Re-register ActivateSkillTool to update its schema with the discovered enabled skill enums
        if (this.getSkillManager().getSkills().length > 0) {
          this.toolRegistry.unregisterTool(ActivateSkillTool.Name);
          this.toolRegistry.registerTool(
            new ActivateSkillTool(this, this.messageBus),
          );
        }
      }
    }

    // Initialize hook system if enabled
    if (this.getEnableHooks()) {
      this.hookSystem = new HookSystem(this);
      await this.hookSystem.initialize();
    }

    if (this.experimentalJitContext) {
      this.memoryContextManager = new MemoryContextManager(this);
      await this.memoryContextManager.refresh();
    }

    await this._geminiClient.initialize();
    this.initialized = true;
  }

  getContentGenerator(): ContentGenerator {
    return this.contentGenerator;
  }

  async refreshAuth(
    authMethod: AuthType,
    apiKey?: string,
    baseUrl?: string,
    customHeaders?: Record<string, string>,
  ) {
    // Reset availability service when switching auth
    this.modelAvailabilityService.reset();

    // Vertex and Genai have incompatible encryption and sending history with
    // thoughtSignature from Genai to Vertex will fail, we need to strip them
    if (
      this.contentGeneratorConfig?.authType === AuthType.USE_GEMINI &&
      authMethod !== AuthType.USE_GEMINI
    ) {
      // Restore the conversation history to the new client
      this._geminiClient.stripThoughtsFromHistory();
    }

    // Reset availability status when switching auth (e.g. from limited key to OAuth)
    this.modelAvailabilityService.reset();

    // Clear stale authType to ensure getGemini31LaunchedSync doesn't return stale results
    // during the transition.
    if (this.contentGeneratorConfig) {
      this.contentGeneratorConfig.authType = undefined;
    }

    const newContentGeneratorConfig = await createContentGeneratorConfig(
      this,
      authMethod,
      apiKey,
      baseUrl,
      customHeaders,
    );
    this.contentGenerator = await createContentGenerator(
      newContentGeneratorConfig,
      this,
      this.getSessionId(),
    );
    // Only assign to instance properties after successful initialization
    this.contentGeneratorConfig = newContentGeneratorConfig;

    const codeAssistServer = getCodeAssistServer(this);
    const quotaPromise = codeAssistServer?.projectId
      ? this.refreshUserQuota()
      : Promise.resolve();

    this.experimentsPromise = getExperiments(codeAssistServer)
      .then((experiments) => {
        this.setExperiments(experiments);
        return experiments;
      })
      .catch((e) => {
        debugLogger.error('Failed to fetch experiments', e);
        return undefined;
      });

    // Fetch experiments and update timeouts before continuing initialization
    const experiments = await this.experimentsPromise;

    const requestTimeoutMs = this.getRequestTimeoutMs();
    if (requestTimeoutMs !== undefined) {
      updateGlobalFetchTimeouts(requestTimeoutMs);
    }

    // Initialize BaseLlmClient now that the ContentGenerator and experiments are available
    this.baseLlmClient = new BaseLlmClient(this.contentGenerator, this);

    await quotaPromise;

    const authType = this.contentGeneratorConfig.authType;
    if (
      authType === AuthType.USE_GEMINI ||
      authType === AuthType.USE_VERTEX_AI
    ) {
      this.setHasAccessToPreviewModel(true);
    }

    // Only reset when we have explicit "no access" (hasAccessToPreviewModel === false).
    // When null (quota not fetched) or true, we preserve the saved model.
    if (
      isPreviewModel(this.model, this) &&
      this.hasAccessToPreviewModel === false
    ) {
      this.setModel(DEFAULT_GEMINI_MODEL_AUTO);
    }

    const adminControlsEnabled =
      experiments?.flags[ExperimentFlags.ENABLE_ADMIN_CONTROLS]?.boolValue ??
      false;
    const adminControls = await fetchAdminControls(
      codeAssistServer,
      this.getRemoteAdminSettings(),
      adminControlsEnabled,
      (newSettings: AdminControlsSettings) => {
        this.setRemoteAdminSettings(newSettings);
        coreEvents.emitAdminSettingsChanged();
      },
    );
    this.setRemoteAdminSettings(adminControls);

    if ((await this.getProModelNoAccess()) && isAutoModel(this.model)) {
      this.setModel(PREVIEW_GEMINI_FLASH_MODEL);
    }
  }

  async getExperimentsAsync(): Promise<Experiments | undefined> {
    if (this.experiments) {
      return this.experiments;
    }
    const codeAssistServer = getCodeAssistServer(this);
    return getExperiments(codeAssistServer);
  }

  getUserTier(): UserTierId | undefined {
    return this.contentGenerator?.userTier;
  }

  getUserTierName(): string | undefined {
    return this.contentGenerator?.userTierName;
  }

  getUserPaidTier(): GeminiUserTier | undefined {
    return this.contentGenerator?.paidTier;
  }

  /**
   * Provides access to the BaseLlmClient for stateless LLM operations.
   */
  getBaseLlmClient(): BaseLlmClient {
    if (!this.baseLlmClient) {
      // Handle cases where initialization might be deferred or authentication failed
      if (!this.experiments) {
        throw new Error(
          'BaseLlmClient not initialized. Ensure experiments have been fetched and configuration is ready.',
        );
      }
      if (this.contentGenerator) {
        this.baseLlmClient = new BaseLlmClient(
          this.getContentGenerator(),
          this,
        );
      } else {
        throw new Error(
          'BaseLlmClient not initialized. Ensure authentication has occurred and ContentGenerator is ready.',
        );
      }
    }
    return this.baseLlmClient;
  }

  getLocalLiteRtLmClient(): LocalLiteRtLmClient {
    if (!this.localLiteRtLmClient) {
      this.localLiteRtLmClient = new LocalLiteRtLmClient(this);
    }
    return this.localLiteRtLmClient;
  }

  get promptId(): string {
    return this._sessionId;
  }

  /**
   * @deprecated Do not access directly on Config.
   * Use the injected AgentLoopContext instead.
   */
  get toolRegistry(): ToolRegistry {
    return this._toolRegistry;
  }

  /**
   * @deprecated Do not access directly on Config.
   * Use the injected AgentLoopContext instead.
   */
  get promptRegistry(): PromptRegistry {
    return this._promptRegistry;
  }

  /**
   * @deprecated Do not access directly on Config.
   * Use the injected AgentLoopContext instead.
   */
  get resourceRegistry(): ResourceRegistry {
    return this._resourceRegistry;
  }

  /**
   * @deprecated Do not access directly on Config.
   * Use the injected AgentLoopContext instead.
   */
  get messageBus(): MessageBus {
    return this._messageBus;
  }

  /**
   * @deprecated Do not access directly on Config.
   * Use the injected AgentLoopContext instead.
   */
  get geminiClient(): GeminiClient {
    return this._geminiClient;
  }

  private async getSandboxForbiddenPaths(): Promise<string[]> {
    if (this._sandboxForbiddenPaths) {
      return this._sandboxForbiddenPaths;
    }

    this._sandboxForbiddenPaths = await this.getFileService().getIgnoredPaths({
      respectGitIgnore: false,
      respectGeminiIgnore: true,
    });

    return this._sandboxForbiddenPaths;
  }

  private refreshSandboxManager(): void {
    this._sandboxManager = createSandboxManager(
      this.sandbox,
      {
        workspace: this.targetDir,
        forbiddenPaths: this.getSandboxForbiddenPaths.bind(this),
        includeDirectories: [
          ...this.pendingIncludeDirectories,
          Storage.getGlobalTempDir(),
        ],
        policyManager: this._sandboxPolicyManager,
      },
      this.getApprovalMode(),
    );
    this.shellExecutionConfig.sandboxManager = this._sandboxManager;
  }

  get sandboxPolicyManager() {
    return this._sandboxPolicyManager;
  }

  get sandboxManager(): SandboxManager {
    return this._sandboxManager;
  }

  getSessionId(): string {
    return this.promptId;
  }

  getWorktreeSettings(): WorktreeSettings | undefined {
    return this.worktreeSettings;
  }

  getClientName(): string | undefined {
    return this.clientName;
  }

  setSessionId(sessionId: string): void {
    this._sessionId = sessionId;
  }

  setTerminalBackground(terminalBackground: string | undefined): void {
    this.terminalBackground = terminalBackground;
  }

  getTerminalBackground(): string | undefined {
    return this.terminalBackground;
  }

  getLatestApiRequest(): GenerateContentParameters | undefined {
    return this.latestApiRequest;
  }

  setLatestApiRequest(req: GenerateContentParameters): void {
    this.latestApiRequest = req;
  }

  getRemoteAdminSettings(): AdminControlsSettings | undefined {
    return this.remoteAdminSettings;
  }

  setRemoteAdminSettings(settings: AdminControlsSettings | undefined): void {
    this.remoteAdminSettings = settings;
  }

  shouldLoadMemoryFromIncludeDirectories(): boolean {
    return this.loadMemoryFromIncludeDirectories;
  }

  getIncludeDirectoryTree(): boolean {
    return this.includeDirectoryTree;
  }

  getImportFormat(): 'tree' | 'flat' {
    return this.importFormat;
  }

  getDiscoveryMaxDirs(): number {
    return this.discoveryMaxDirs;
  }

  getContentGeneratorConfig(): ContentGeneratorConfig {
    return this.contentGeneratorConfig;
  }

  getModel(): string {
    return this.model;
  }

  getDisableLoopDetection(): boolean {
    return this.disableLoopDetection ?? false;
  }

  setModel(newModel: string, isTemporary: boolean = true): void {
    if (this.model !== newModel || this._activeModel !== newModel) {
      this.model = newModel;
      // When the user explicitly sets a model, that becomes the active model.
      this._activeModel = newModel;
      coreEvents.emitModelChanged(newModel);
    }
    if (this.onModelChange && !isTemporary) {
      this.onModelChange(newModel);
    }
    this.modelAvailabilityService.reset();
  }

  activateFallbackMode(model: string): void {
    this.setModel(model, true);
    const authType = this.getContentGeneratorConfig()?.authType;
    if (authType) {
      logFlashFallback(this, new FlashFallbackEvent(authType));
    }
  }

  getActiveModel(): string {
    return this._activeModel ?? this.model;
  }

  setActiveModel(model: string): void {
    if (this._activeModel !== model) {
      this._activeModel = model;
    }
  }

  setFallbackModelHandler(handler: FallbackModelHandler): void {
    this.fallbackModelHandler = handler;
  }

  getFallbackModelHandler(): FallbackModelHandler | undefined {
    return this.fallbackModelHandler;
  }

  setValidationHandler(handler: ValidationHandler): void {
    this.validationHandler = handler;
  }

  getValidationHandler(): ValidationHandler | undefined {
    return this.validationHandler;
  }

  resetTurn(): void {
    this.modelAvailabilityService.resetTurn();
  }

  /** Resets billing state (overageStrategy, creditsNotificationShown) once per user prompt. */
  resetBillingTurnState(overageStrategy?: OverageStrategy): void {
    this.creditsNotificationShown = false;
    this.billing.overageStrategy = overageStrategy ?? 'ask';
  }

  getMaxSessionTurns(): number {
    return this.maxSessionTurns;
  }

  setQuotaErrorOccurred(value: boolean): void {
    this.quotaErrorOccurred = value;
  }

  getQuotaErrorOccurred(): boolean {
    return this.quotaErrorOccurred;
  }

  setCreditsNotificationShown(value: boolean): void {
    this.creditsNotificationShown = value;
  }

  getCreditsNotificationShown(): boolean {
    return this.creditsNotificationShown;
  }

  setQuota(
    remaining: number | undefined,
    limit: number | undefined,
    modelId?: string,
  ): void {
    const activeModel = modelId ?? this.getActiveModel();
    if (remaining !== undefined && limit !== undefined) {
      const current = this.modelQuotas.get(activeModel);
      if (
        !current ||
        current.remaining !== remaining ||
        current.limit !== limit
      ) {
        this.modelQuotas.set(activeModel, { remaining, limit });
        this.emitQuotaChangedEvent();
      }
    }
  }

  private getPooledQuota(): {
    remaining?: number;
    limit?: number;
    resetTime?: string;
  } {
    const model = this.getModel();
    if (!isAutoModel(model)) {
      return {};
    }

    const isPreview =
      model === PREVIEW_GEMINI_MODEL_AUTO ||
      isPreviewModel(this.getActiveModel(), this);
    const proModel = isPreview ? PREVIEW_GEMINI_MODEL : DEFAULT_GEMINI_MODEL;
    const flashModel = isPreview
      ? PREVIEW_GEMINI_FLASH_MODEL
      : DEFAULT_GEMINI_FLASH_MODEL;

    const proQuota = this.modelQuotas.get(proModel);
    const flashQuota = this.modelQuotas.get(flashModel);

    if (proQuota || flashQuota) {
      // For reset time, take the one that is furthest in the future (most conservative)
      const resetTime = [proQuota?.resetTime, flashQuota?.resetTime]
        .filter((t): t is string => !!t)
        .sort()
        .reverse()[0];

      return {
        remaining: (proQuota?.remaining ?? 0) + (flashQuota?.remaining ?? 0),
        limit: (proQuota?.limit ?? 0) + (flashQuota?.limit ?? 0),
        resetTime,
      };
    }

    return {};
  }

  getQuotaRemaining(): number | undefined {
    const pooled = this.getPooledQuota();
    if (pooled.remaining !== undefined) {
      return pooled.remaining;
    }
    const primaryModel = resolveModel(
      this.getModel(),
      this.getGemini31LaunchedSync(),
      this.getGemini31FlashLiteLaunchedSync(),
      this.getUseCustomToolModelSync(),
      this.getHasAccessToPreviewModel(),
      this,
    );
    return this.modelQuotas.get(primaryModel)?.remaining;
  }

  getQuotaLimit(): number | undefined {
    const pooled = this.getPooledQuota();
    if (pooled.limit !== undefined) {
      return pooled.limit;
    }
    const primaryModel = resolveModel(
      this.getModel(),
      this.getGemini31LaunchedSync(),
      this.getGemini31FlashLiteLaunchedSync(),
      this.getUseCustomToolModelSync(),
      this.getHasAccessToPreviewModel(),
      this,
    );
    return this.modelQuotas.get(primaryModel)?.limit;
  }

  getQuotaResetTime(): string | undefined {
    const pooled = this.getPooledQuota();
    if (pooled.resetTime !== undefined) {
      return pooled.resetTime;
    }
    const primaryModel = resolveModel(
      this.getModel(),
      this.getGemini31LaunchedSync(),
      this.getGemini31FlashLiteLaunchedSync(),
      this.getUseCustomToolModelSync(),
      this.getHasAccessToPreviewModel(),
      this,
    );
    return this.modelQuotas.get(primaryModel)?.resetTime;
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  getSandbox(): SandboxConfig | undefined {
    return this.sandbox;
  }

  getSandboxEnabled(): boolean {
    return this.sandbox?.enabled ?? false;
  }

  getSandboxAllowedPaths(): string[] {
    const paths = [...(this.sandbox?.allowedPaths ?? [])];
    const globalTempDir = Storage.getGlobalTempDir();
    if (!paths.includes(globalTempDir)) {
      paths.push(globalTempDir);
    }
    return paths;
  }

  getSandboxNetworkAccess(): boolean {
    return this.sandbox?.networkAccess ?? false;
  }

  isRestrictiveSandbox(): boolean {
    const sandboxConfig = this.getSandbox();
    const seatbeltProfile = process.env['SEATBELT_PROFILE'];
    return (
      !!sandboxConfig &&
      sandboxConfig.command === 'sandbox-exec' &&
      !!seatbeltProfile &&
      (seatbeltProfile.startsWith('restrictive-') ||
        seatbeltProfile.startsWith('strict-'))
    );
  }

  getTargetDir(): string {
    return this.targetDir;
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  getWorkspaceContext(): WorkspaceContext {
    return getWorkspaceContextOverride() ?? this.workspaceContext;
  }

  getAgentRegistry(): AgentRegistry {
    return this.agentRegistry;
  }

  getAcknowledgedAgentsService(): AcknowledgedAgentsService {
    return this.acknowledgedAgentsService;
  }

  /** @deprecated Use toolRegistry getter */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  getPromptRegistry(): PromptRegistry {
    return this._promptRegistry;
  }

  getSkillManager(): SkillManager {
    return this.skillManager;
  }

  getResourceRegistry(): ResourceRegistry {
    return this._resourceRegistry;
  }

  getDebugMode(): boolean {
    return this.debugMode;
  }
  getQuestion(): string | undefined {
    return this.question;
  }

  getHasAccessToPreviewModel(): boolean {
    return this.hasAccessToPreviewModel !== false;
  }

  setHasAccessToPreviewModel(hasAccess: boolean | null): void {
    this.hasAccessToPreviewModel = hasAccess;
  }

  async refreshAvailableCredits(): Promise<void> {
    const codeAssistServer = getCodeAssistServer(this);
    if (!codeAssistServer) {
      return;
    }
    try {
      await codeAssistServer.refreshAvailableCredits();
    } catch {
      // Non-fatal: proceed even if refresh fails.
      // The actual credit balance will be verified server-side.
    }
  }

  async refreshUserQuota(): Promise<RetrieveUserQuotaResponse | undefined> {
    const codeAssistServer = getCodeAssistServer(this);
    if (!codeAssistServer || !codeAssistServer.projectId) {
      return undefined;
    }
    try {
      const quota = await codeAssistServer.retrieveUserQuota({
        project: codeAssistServer.projectId,
      });

      if (quota.buckets) {
        this.lastRetrievedQuota = quota;
        this.lastQuotaFetchTime = Date.now();

        for (const bucket of quota.buckets) {
          if (
            bucket.modelId &&
            bucket.remainingAmount &&
            bucket.remainingFraction != null
          ) {
            const remaining = parseInt(bucket.remainingAmount, 10);
            const limit =
              bucket.remainingFraction > 0
                ? Math.round(remaining / bucket.remainingFraction)
                : (this.modelQuotas.get(bucket.modelId)?.limit ?? 0);

            if (!isNaN(remaining) && Number.isFinite(limit) && limit > 0) {
              this.modelQuotas.set(bucket.modelId, {
                remaining,
                limit,
                resetTime: bucket.resetTime,
              });
            }
          }
        }
        this.emitQuotaChangedEvent();
      }

      const hasAccess =
        quota.buckets?.some(
          (b) => b.modelId && isPreviewModel(b.modelId, this),
        ) ?? false;
      this.setHasAccessToPreviewModel(hasAccess);
      return quota;
    } catch (e) {
      debugLogger.debug('Failed to retrieve user quota', e);
      return undefined;
    }
  }

  async refreshUserQuotaIfStale(
    staleMs = 30_000,
  ): Promise<RetrieveUserQuotaResponse | undefined> {
    const now = Date.now();
    if (now - this.lastQuotaFetchTime > staleMs) {
      return this.refreshUserQuota();
    }
    return this.lastRetrievedQuota;
  }

  getLastRetrievedQuota(): RetrieveUserQuotaResponse | undefined {
    return this.lastRetrievedQuota;
  }

  getRemainingQuotaForModel(modelId: string):
    | {
        remainingAmount?: number;
        remainingFraction?: number;
        resetTime?: string;
      }
    | undefined {
    const bucket = this.lastRetrievedQuota?.buckets?.find(
      (b) => b.modelId === modelId,
    );
    if (!bucket) return undefined;

    return {
      remainingAmount: bucket.remainingAmount
        ? parseInt(bucket.remainingAmount, 10)
        : undefined,
      remainingFraction: bucket.remainingFraction,
      resetTime: bucket.resetTime,
    };
  }

  getCoreTools(): string[] | undefined {
    return this.coreTools;
  }

  getMainAgentTools(): string[] | undefined {
    return this.mainAgentTools;
  }

  getAllowedTools(): string[] | undefined {
    return this.allowedTools;
  }

  /**
   * All the excluded tools from static configuration, loaded extensions, or
   * other sources (like the Policy Engine).
   *
   * May change over time.
   */
  getExcludeTools(
    toolMetadata?: Map<string, Record<string, unknown>>,
    allToolNames?: Set<string>,
  ): Set<string> | undefined {
    // Right now this is present for backward compatibility with settings.json exclude
    const excludeToolsSet = new Set([...(this.excludeTools ?? [])]);
    for (const extension of this.getExtensionLoader().getExtensions()) {
      if (!extension.isActive) {
        continue;
      }
      for (const tool of extension.excludeTools || []) {
        excludeToolsSet.add(tool);
      }
    }

    const policyExclusions = this.policyEngine.getExcludedTools(
      toolMetadata,
      allToolNames,
    );
    for (const tool of policyExclusions) {
      excludeToolsSet.add(tool);
    }

    return excludeToolsSet;
  }

  getToolDiscoveryCommand(): string | undefined {
    return this.toolDiscoveryCommand;
  }

  getToolCallCommand(): string | undefined {
    return this.toolCallCommand;
  }

  getMcpServerCommand(): string | undefined {
    return this.mcpServerCommand;
  }

  /**
   * The user configured MCP servers (via gemini settings files).
   *
   * Does NOT include mcp servers configured by extensions.
   */
  getMcpServers(): Record<string, MCPServerConfig> | undefined {
    return this.mcpServers;
  }

  getMcpEnabled(): boolean {
    return this.mcpEnabled;
  }

  getMcpEnablementCallbacks(): McpEnablementCallbacks | undefined {
    return this.mcpEnablementCallbacks;
  }

  getExtensionsEnabled(): boolean {
    return this.extensionsEnabled;
  }

  getExtensionRegistryURI(): string | undefined {
    return this.extensionRegistryURI;
  }

  getMcpClientManager(): McpClientManager | undefined {
    return this.mcpClientManager;
  }

  getA2AClientManager(): A2AClientManager | undefined {
    return this.a2aClientManager;
  }

  setUserInteractedWithMcp(): void {
    this.mcpClientManager?.setUserInteractedWithMcp();
  }

  /** @deprecated Use getMcpClientManager().getLastError() directly */
  getLastMcpError(serverName: string): string | undefined {
    return this.mcpClientManager?.getLastError(serverName);
  }

  emitMcpDiagnostic(
    severity: 'info' | 'warning' | 'error',
    message: string,
    error?: unknown,
    serverName?: string,
  ): void {
    if (this.mcpClientManager) {
      this.mcpClientManager.emitDiagnostic(
        severity,
        message,
        error,
        serverName,
      );
    } else {
      coreEvents.emitFeedback(severity, message, error);
    }
  }

  getAllowedMcpServers(): string[] | undefined {
    return this.allowedMcpServers;
  }

  getBlockedMcpServers(): string[] | undefined {
    return this.blockedMcpServers;
  }

  get sanitizationConfig(): EnvironmentSanitizationConfig {
    return {
      allowedEnvironmentVariables: this.allowedEnvironmentVariables,
      blockedEnvironmentVariables: this.blockedEnvironmentVariables,
      enableEnvironmentVariableRedaction:
        this.enableEnvironmentVariableRedaction,
    };
  }

  setMcpServers(mcpServers: Record<string, MCPServerConfig>): void {
    this.mcpServers = mcpServers;
  }

  getUserMemory(): string | HierarchicalMemory {
    if (this.experimentalJitContext && this.memoryContextManager) {
      return {
        global: this.memoryContextManager.getGlobalMemory(),
        extension: this.memoryContextManager.getExtensionMemory(),
        project: this.memoryContextManager.getEnvironmentMemory(),
        userProjectMemory: this.memoryContextManager.getUserProjectMemory(),
      };
    }
    return this.userMemory;
  }

  /**
   * Refreshes the MCP context, including memory, tools, and system instructions.
   */
  async refreshMcpContext(): Promise<void> {
    if (this.experimentalJitContext && this.memoryContextManager) {
      await this.memoryContextManager.refresh();
    } else {
      const { refreshServerHierarchicalMemory } = await import(
        '../utils/memoryDiscovery.js'
      );
      await refreshServerHierarchicalMemory(this);
    }
    if (this._geminiClient?.isInitialized()) {
      await this._geminiClient.setTools();
      this._geminiClient.updateSystemInstruction();
    }
  }

  setUserMemory(newUserMemory: string | HierarchicalMemory): void {
    this.userMemory = newUserMemory;
  }

  /**
   * Returns memory for the system instruction.
   * When JIT is enabled, global memory and user project memory (Tier 1) go
   * in the system instruction. Extension and project memory (Tier 2) are
   * placed in the first user message instead, per the tiered context model.
   * User project memory is in Tier 1 so mid-session saves are reflected
   * via system instruction updates.
   */
  getSystemInstructionMemory(): string | HierarchicalMemory {
    if (this.experimentalJitContext && this.memoryContextManager) {
      const global = this.memoryContextManager.getGlobalMemory();
      const userProjectMemory =
        this.memoryContextManager.getUserProjectMemory();
      if (userProjectMemory?.trim()) {
        return { global, userProjectMemory };
      }
      return global;
    }
    return this.userMemory;
  }

  /**
   * Returns Tier 2 memory (extension + project) for injection into the first
   * user message when JIT is enabled. Returns empty string when JIT is
   * disabled (Tier 2 memory is already in the system instruction).
   */
  getSessionMemory(): string {
    if (!this.experimentalJitContext || !this.memoryContextManager) {
      return '';
    }
    const sections: string[] = [];
    const extension = this.memoryContextManager.getExtensionMemory();
    const project = this.memoryContextManager.getEnvironmentMemory();
    if (extension?.trim()) {
      sections.push(
        `<extension_context>\n${extension.trim()}\n</extension_context>`,
      );
    }
    if (project?.trim()) {
      sections.push(`<project_context>\n${project.trim()}\n</project_context>`);
    }
    if (sections.length === 0) return '';
    return `\n<loaded_context>\n${sections.join('\n')}\n</loaded_context>`;
  }

  getGlobalMemory(): string {
    return this.memoryContextManager?.getGlobalMemory() ?? '';
  }

  getEnvironmentMemory(): string {
    return this.memoryContextManager?.getEnvironmentMemory() ?? '';
  }

  getMemoryContextManager(): MemoryContextManager | undefined {
    return this.memoryContextManager;
  }

  isJitContextEnabled(): boolean {
    return this.experimentalJitContext;
  }

  isContextManagementEnabled(): boolean {
    return this.contextManagement.enabled;
  }

  getMemoryBoundaryMarkers(): readonly string[] {
    return this.memoryBoundaryMarkers;
  }

  isMemoryManagerEnabled(): boolean {
    return this.experimentalMemoryManager;
  }

  getContextManagementConfig(): ContextManagementConfig {
    return this.contextManagement;
  }

  get agentHistoryProviderConfig(): AgentHistoryProviderConfig {
    return {
      maxTokens: this.contextManagement.historyWindow.maxTokens,
      retainedTokens: this.contextManagement.historyWindow.retainedTokens,
      normalMessageTokens: this.contextManagement.messageLimits.normalMaxTokens,
      maximumMessageTokens:
        this.contextManagement.messageLimits.retainedMaxTokens,
      normalizationHeadRatio:
        this.contextManagement.messageLimits.normalizationHeadRatio,
    };
  }

  isTopicUpdateNarrationEnabled(): boolean {
    return this.topicUpdateNarration;
  }

  isModelSteeringEnabled(): boolean {
    return this.modelSteering;
  }

  async getToolOutputMaskingConfig(): Promise<ToolOutputMaskingConfig> {
    await this.ensureExperimentsLoaded();

    const remoteProtection =
      this.experiments?.flags[ExperimentFlags.MASKING_PROTECTION_THRESHOLD]
        ?.intValue;
    const remotePrunable =
      this.experiments?.flags[ExperimentFlags.MASKING_PRUNABLE_THRESHOLD]
        ?.intValue;
    const remoteProtectLatest =
      this.experiments?.flags[ExperimentFlags.MASKING_PROTECT_LATEST_TURN]
        ?.boolValue;

    const parsedProtection = remoteProtection
      ? parseInt(remoteProtection, 10)
      : undefined;
    const parsedPrunable = remotePrunable
      ? parseInt(remotePrunable, 10)
      : undefined;

    return {
      protectionThresholdTokens:
        parsedProtection !== undefined && !isNaN(parsedProtection)
          ? parsedProtection
          : this.contextManagement.tools.outputMasking
              .protectionThresholdTokens,
      minPrunableThresholdTokens:
        parsedPrunable !== undefined && !isNaN(parsedPrunable)
          ? parsedPrunable
          : this.contextManagement.tools.outputMasking
              .minPrunableThresholdTokens,
      protectLatestTurn:
        remoteProtectLatest ??
        this.contextManagement.tools.outputMasking.protectLatestTurn,
    };
  }

  getGeminiMdFileCount(): number {
    if (this.experimentalJitContext && this.memoryContextManager) {
      return this.memoryContextManager.getLoadedPaths().size;
    }
    return this.geminiMdFileCount;
  }

  setGeminiMdFileCount(count: number): void {
    this.geminiMdFileCount = count;
  }

  getGeminiMdFilePaths(): string[] {
    if (this.experimentalJitContext && this.memoryContextManager) {
      return Array.from(this.memoryContextManager.getLoadedPaths());
    }
    return this.geminiMdFilePaths;
  }

  getWorkspacePoliciesDir(): string | undefined {
    return this.workspacePoliciesDir;
  }

  setGeminiMdFilePaths(paths: string[]): void {
    this.geminiMdFilePaths = paths;
  }

  getApprovalMode(): ApprovalMode {
    return this.policyEngine.getApprovalMode();
  }

  isPlanMode(): boolean {
    return this.getApprovalMode() === ApprovalMode.PLAN;
  }

  getPolicyUpdateConfirmationRequest():
    | PolicyUpdateConfirmationRequest
    | undefined {
    return this.policyUpdateConfirmationRequest;
  }

  /**
   * Hot-loads workspace policies from the specified directory into the active policy engine.
   * This allows applying newly accepted policies without requiring an application restart.
   *
   * @param policyDir The directory containing the workspace policy TOML files.
   */
  async loadWorkspacePolicies(policyDir: string): Promise<void> {
    const { rules, checkers } = await loadPoliciesFromToml(
      [policyDir],
      () => WORKSPACE_POLICY_TIER,
    );

    // Clear existing workspace policies to prevent duplicates/stale rules
    this.policyEngine.removeRulesByTier(WORKSPACE_POLICY_TIER);
    this.policyEngine.removeCheckersByTier(WORKSPACE_POLICY_TIER);

    for (const rule of rules) {
      this.policyEngine.addRule(rule);
    }

    for (const checker of checkers) {
      this.policyEngine.addChecker(checker);
    }

    this.policyUpdateConfirmationRequest = undefined;

    debugLogger.debug(`Workspace policies loaded from: ${policyDir}`);
  }

  setApprovalMode(mode: ApprovalMode): void {
    if (
      !this.isTrustedFolder() &&
      mode !== ApprovalMode.DEFAULT &&
      mode !== ApprovalMode.PLAN
    ) {
      throw new Error(
        'Cannot enable privileged approval modes in an untrusted folder.',
      );
    }

    const currentMode = this.getApprovalMode();
    if (currentMode !== mode) {
      this.logCurrentModeDuration(currentMode);
      logApprovalModeSwitch(
        this,
        new ApprovalModeSwitchEvent(currentMode, mode),
      );
    }

    this.policyEngine.setApprovalMode(mode);
    this.refreshSandboxManager();

    const isPlanModeTransition =
      currentMode !== mode &&
      (currentMode === ApprovalMode.PLAN || mode === ApprovalMode.PLAN);
    const isYoloModeTransition =
      currentMode !== mode &&
      (currentMode === ApprovalMode.YOLO || mode === ApprovalMode.YOLO);

    if (isPlanModeTransition || isYoloModeTransition) {
      if (this._geminiClient?.isInitialized()) {
        this._geminiClient.clearCurrentSequenceModel();
        this._geminiClient.setTools().catch((err) => {
          debugLogger.error('Failed to update tools', err);
        });
      }
      this.updateSystemInstructionIfInitialized();
    }
  }

  /**
   * Logs the duration of the current approval mode.
   */
  logCurrentModeDuration(mode: ApprovalMode): void {
    const now = performance.now();
    const duration = now - this.lastModeSwitchTime;
    if (duration > 0) {
      logApprovalModeDuration(
        this,
        new ApprovalModeDurationEvent(mode, duration),
      );
    }
    this.lastModeSwitchTime = now;
  }

  isYoloModeDisabled(): boolean {
    return this.disableYoloMode || !this.isTrustedFolder();
  }

  getDisableAlwaysAllow(): boolean {
    return this.disableAlwaysAllow;
  }

  getRawOutput(): boolean {
    return this.rawOutput;
  }

  getAcceptRawOutputRisk(): boolean {
    return this.acceptRawOutputRisk;
  }

  getExperimentalDynamicModelConfiguration(): boolean {
    return this.dynamicModelConfiguration;
  }

  getPendingIncludeDirectories(): string[] {
    return this.pendingIncludeDirectories;
  }

  clearPendingIncludeDirectories(): void {
    this.pendingIncludeDirectories = [];
  }

  getShowMemoryUsage(): boolean {
    return this.showMemoryUsage;
  }

  getAccessibility(): AccessibilitySettings {
    return this.accessibility;
  }

  getTelemetryEnabled(): boolean {
    return this.telemetrySettings.enabled ?? false;
  }

  getTelemetryLogPromptsEnabled(): boolean {
    return this.telemetrySettings.logPrompts ?? true;
  }

  getTelemetryOtlpEndpoint(): string {
    return this.telemetrySettings.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT;
  }

  getTelemetryOtlpProtocol(): 'grpc' | 'http' {
    return this.telemetrySettings.otlpProtocol ?? 'grpc';
  }

  getTelemetryTarget(): TelemetryTarget {
    return this.telemetrySettings.target ?? DEFAULT_TELEMETRY_TARGET;
  }

  getTelemetryOutfile(): string | undefined {
    return this.telemetrySettings.outfile;
  }

  getBillingSettings(): { overageStrategy: OverageStrategy } {
    return this.billing;
  }

  /**
   * Updates the overage strategy at runtime.
   * Used to switch from 'ask' to 'always' after the user accepts credits
   * via the overage dialog, so subsequent API calls auto-include credits.
   */
  setOverageStrategy(strategy: OverageStrategy): void {
    this.billing.overageStrategy = strategy;
  }

  getTelemetryUseCollector(): boolean {
    return this.telemetrySettings.useCollector ?? false;
  }

  getTelemetryUseCliAuth(): boolean {
    return this.telemetrySettings.useCliAuth ?? false;
  }

  /** @deprecated Use geminiClient getter */
  getGeminiClient(): GeminiClient {
    return this.geminiClient;
  }

  /**
   * Updates the system instruction with the latest user memory.
   * Whenever the user memory (GEMINI.md files) is updated.
   */
  updateSystemInstructionIfInitialized(): void {
    const geminiClient = this.geminiClient;
    if (geminiClient?.isInitialized()) {
      geminiClient.updateSystemInstruction();
    }
  }

  getModelRouterService(): ModelRouterService {
    return this.modelRouterService;
  }

  getModelConfigService(): ModelConfigService {
    return this.modelConfigService;
  }

  getModelAvailabilityService(): ModelAvailabilityService {
    return this.modelAvailabilityService;
  }

  getEnableRecursiveFileSearch(): boolean {
    return this.fileFiltering.enableRecursiveFileSearch;
  }

  getFileFilteringEnableFuzzySearch(): boolean {
    return this.fileFiltering.enableFuzzySearch;
  }

  getFileFilteringRespectGitIgnore(): boolean {
    return this.fileFiltering.respectGitIgnore;
  }

  getFileFilteringRespectGeminiIgnore(): boolean {
    return this.fileFiltering.respectGeminiIgnore;
  }

  getCustomIgnoreFilePaths(): string[] {
    return this.fileFiltering.customIgnoreFilePaths;
  }

  getFileFilteringOptions(): FileFilteringOptions {
    return {
      respectGitIgnore: this.fileFiltering.respectGitIgnore,
      respectGeminiIgnore: this.fileFiltering.respectGeminiIgnore,
      maxFileCount: this.fileFiltering.maxFileCount,
      searchTimeout: this.fileFiltering.searchTimeout,
      customIgnoreFilePaths: this.fileFiltering.customIgnoreFilePaths,
    };
  }

  /**
   * Gets custom file exclusion patterns from configuration.
   * TODO: This is a placeholder implementation. In the future, this could
   * read from settings files, CLI arguments, or environment variables.
   */
  getCustomExcludes(): string[] {
    // Placeholder implementation - returns empty array for now
    // Future implementation could read from:
    // - User settings file
    // - Project-specific configuration
    // - Environment variables
    // - CLI arguments
    return [];
  }

  getCheckpointingEnabled(): boolean {
    return this.checkpointing;
  }

  getProxy(): string | undefined {
    return this.proxy;
  }

  getWorkingDir(): string {
    return this.cwd;
  }

  getBugCommand(): BugCommandSettings | undefined {
    return this.bugCommand;
  }

  getTrackerService(): TrackerService {
    if (!this.trackerService) {
      this.trackerService = new TrackerService(
        this.storage.getProjectTempTrackerDir(),
      );
    }
    return this.trackerService;
  }

  getFileService(): FileDiscoveryService {
    if (!this.fileDiscoveryService) {
      this.fileDiscoveryService = new FileDiscoveryService(this.targetDir, {
        respectGitIgnore: this.fileFiltering.respectGitIgnore,
        respectGeminiIgnore: this.fileFiltering.respectGeminiIgnore,
        customIgnoreFilePaths: this.fileFiltering.customIgnoreFilePaths,
      });
    }
    return this.fileDiscoveryService;
  }

  getUsageStatisticsEnabled(): boolean {
    return this.usageStatisticsEnabled;
  }

  getAcpMode(): boolean {
    return this.acpMode;
  }

  async waitForMcpInit(): Promise<void> {
    if (this.mcpInitializationPromise) {
      await this.mcpInitializationPromise;
    }
  }

  getListExtensions(): boolean {
    return this.listExtensions;
  }

  getListSessions(): boolean {
    return this.listSessions;
  }

  getDeleteSession(): string | undefined {
    return this.deleteSession;
  }

  getExtensionManagement(): boolean {
    return this.extensionManagement;
  }

  getExtensions(): GeminiCLIExtension[] {
    return this._extensionLoader.getExtensions();
  }

  getExtensionLoader(): ExtensionLoader {
    return this._extensionLoader;
  }

  // The list of explicitly enabled extensions, if any were given, may contain
  // the string "none".
  getEnabledExtensions(): string[] {
    return this._enabledExtensions;
  }

  getEnableExtensionReloading(): boolean {
    return this.enableExtensionReloading;
  }

  getDisableLLMCorrection(): boolean {
    return this.disableLLMCorrection;
  }

  isPlanEnabled(): boolean {
    return this.planEnabled;
  }

  isTrackerEnabled(): boolean {
    return this.trackerEnabled;
  }

  getApprovedPlanPath(): string | undefined {
    return this.approvedPlanPath;
  }

  getDirectWebFetch(): boolean {
    return this.directWebFetch;
  }

  setApprovedPlanPath(path: string | undefined): void {
    this.approvedPlanPath = path;
  }

  isAgentsEnabled(): boolean {
    return this.enableAgents;
  }

  isEventDrivenSchedulerEnabled(): boolean {
    return this.enableEventDrivenScheduler;
  }

  getNoBrowser(): boolean {
    return this.noBrowser;
  }

  getAgentsSettings(): AgentSettings {
    return this.agents;
  }

  isBrowserLaunchSuppressed(): boolean {
    return this.getNoBrowser() || !shouldAttemptBrowserLaunch();
  }

  getSummarizeToolOutputConfig():
    | Record<string, SummarizeToolOutputSettings>
    | undefined {
    return this.summarizeToolOutput;
  }

  getIdeMode(): boolean {
    return this.ideMode;
  }

  /**
   * Returns 'true' if the folder trust feature is enabled.
   */
  getFolderTrust(): boolean {
    return this.folderTrust;
  }

  /**
   * Returns 'true' if the workspace is considered "trusted".
   * 'false' for untrusted.
   */
  isTrustedFolder(): boolean {
    const context = ideContextStore.get();
    if (context?.workspaceState?.isTrusted !== undefined) {
      return context.workspaceState.isTrusted;
    }

    // Default to untrusted if folder trust is enabled and no explicit value is set.
    return this.folderTrust ? (this.trustedFolder ?? false) : true;
  }

  setIdeMode(value: boolean): void {
    this.ideMode = value;
  }

  /**
   * Get the current FileSystemService
   */
  getFileSystemService(): FileSystemService {
    return this.fileSystemService;
  }

  /**
   * Checks if a given absolute path is allowed for file system operations.
   * A path is allowed if it's within the workspace context or the project's temporary directory.
   *
   * @param absolutePath The absolute path to check.
   * @returns true if the path is allowed, false otherwise.
   */
  isPathAllowed(absolutePath: string): boolean {
    const resolvedPath = resolveToRealPath(absolutePath);

    const workspaceContext = this.getWorkspaceContext();
    if (workspaceContext.isPathWithinWorkspace(resolvedPath)) {
      return true;
    }

    const projectTempDir = this.storage.getProjectTempDir();
    const resolvedTempDir = resolveToRealPath(projectTempDir);

    return isSubpath(resolvedTempDir, resolvedPath);
  }

  /**
   * Validates if a path is allowed and returns a detailed error message if not.
   *
   * @param absolutePath The absolute path to validate.
   * @param checkType The type of access to check ('read' or 'write'). Defaults to 'write' for safety.
   * @returns An error message string if the path is disallowed, null otherwise.
   */
  validatePathAccess(
    absolutePath: string,
    checkType: 'read' | 'write' = 'write',
  ): string | null {
    // For read operations, check read-only paths first
    if (checkType === 'read') {
      if (this.getWorkspaceContext().isPathReadable(absolutePath)) {
        return null;
      }
    }

    // Then check standard allowed paths (Workspace + Temp)
    // This covers 'write' checks and acts as a fallback/temp-dir check for 'read'
    if (this.isPathAllowed(absolutePath)) {
      return null;
    }

    const workspaceDirs = this.getWorkspaceContext().getDirectories();
    const projectTempDir = this.storage.getProjectTempDir();
    return `Path not in workspace: Attempted path "${absolutePath}" resolves outside the allowed workspace directories: ${workspaceDirs.join(', ')} or the project temp directory: ${projectTempDir}`;
  }

  /**
   * Set a custom FileSystemService
   */
  setFileSystemService(fileSystemService: FileSystemService): void {
    this.fileSystemService = fileSystemService;
  }

  async getCompressionThreshold(): Promise<number | undefined> {
    if (this.compressionThreshold) {
      return this.compressionThreshold;
    }

    await this.ensureExperimentsLoaded();

    const remoteThreshold =
      this.experiments?.flags[ExperimentFlags.CONTEXT_COMPRESSION_THRESHOLD]
        ?.floatValue;
    if (remoteThreshold === 0) {
      return undefined;
    }
    return remoteThreshold;
  }

  async getUserCaching(): Promise<boolean | undefined> {
    await this.ensureExperimentsLoaded();

    return this.experiments?.flags[ExperimentFlags.USER_CACHING]?.boolValue;
  }

  async getPlanModeRoutingEnabled(): Promise<boolean> {
    return this.planModeRoutingEnabled;
  }

  async getNumericalRoutingEnabled(): Promise<boolean> {
    await this.ensureExperimentsLoaded();

    const flag =
      this.experiments?.flags[ExperimentFlags.ENABLE_NUMERICAL_ROUTING];
    return flag?.boolValue ?? true;
  }

  /**
   * Returns the resolved complexity threshold for routing.
   * If a remote threshold is provided and within range (0-100), it is returned.
   * Otherwise, the default threshold (90) is returned.
   */
  async getResolvedClassifierThreshold(): Promise<number> {
    const remoteValue = await this.getClassifierThreshold();
    const defaultValue = 90;

    if (
      remoteValue !== undefined &&
      !isNaN(remoteValue) &&
      remoteValue >= 0 &&
      remoteValue <= 100
    ) {
      return remoteValue;
    }

    return defaultValue;
  }

  async getClassifierThreshold(): Promise<number | undefined> {
    await this.ensureExperimentsLoaded();

    const flag = this.experiments?.flags[ExperimentFlags.CLASSIFIER_THRESHOLD];
    if (flag?.intValue !== undefined) {
      return parseInt(flag.intValue, 10);
    }
    return flag?.floatValue;
  }

  async getBannerTextNoCapacityIssues(): Promise<string> {
    await this.ensureExperimentsLoaded();
    return (
      this.experiments?.flags[ExperimentFlags.BANNER_TEXT_NO_CAPACITY_ISSUES]
        ?.stringValue ?? ''
    );
  }

  async getBannerTextCapacityIssues(): Promise<string> {
    await this.ensureExperimentsLoaded();
    return (
      this.experiments?.flags[ExperimentFlags.BANNER_TEXT_CAPACITY_ISSUES]
        ?.stringValue ?? ''
    );
  }

  /**
   * Returns whether the user has access to Pro models.
   * This is determined by the PRO_MODEL_NO_ACCESS experiment flag.
   */
  async getProModelNoAccess(): Promise<boolean> {
    await this.ensureExperimentsLoaded();
    return this.getProModelNoAccessSync();
  }

  /**
   * Returns whether the user has access to Pro models synchronously.
   *
   * Note: This method should only be called after startup, once experiments have been loaded.
   */
  getProModelNoAccessSync(): boolean {
    if (this.contentGeneratorConfig?.authType !== AuthType.LOGIN_WITH_GOOGLE) {
      return false;
    }
    return (
      this.experiments?.flags[ExperimentFlags.PRO_MODEL_NO_ACCESS]?.boolValue ??
      false
    );
  }

  /**
   * Returns whether Gemini 3.1 Pro has been launched.
   * This method is async and ensures that experiments are loaded before returning the result.
   */
  async getGemini31Launched(): Promise<boolean> {
    await this.ensureExperimentsLoaded();
    return this.getGemini31LaunchedSync();
  }

  /**
   * Returns whether Gemini 3.1 Flash Lite has been launched.
   * This method is async and ensures that experiments are loaded before returning the result.
   */
  async getGemini31FlashLiteLaunched(): Promise<boolean> {
    await this.ensureExperimentsLoaded();
    return this.getGemini31FlashLiteLaunchedSync();
  }

  /**
   * Returns whether the custom tool model should be used.
   */
  async getUseCustomToolModel(): Promise<boolean> {
    const useGemini3_1 = await this.getGemini31Launched();
    const authType = this.contentGeneratorConfig?.authType;
    return useGemini3_1 && authType === AuthType.USE_GEMINI;
  }

  /**
   * Returns whether the custom tool model should be used.
   *
   * Note: This method should only be called after startup, once experiments have been loaded.
   */
  getUseCustomToolModelSync(): boolean {
    const useGemini3_1 = this.getGemini31LaunchedSync();
    const authType = this.contentGeneratorConfig?.authType;
    return useGemini3_1 && authType === AuthType.USE_GEMINI;
  }

  private isGemini31LaunchedForAuthType(authType?: AuthType): boolean {
    return (
      authType === AuthType.USE_GEMINI ||
      authType === AuthType.USE_VERTEX_AI ||
      authType === AuthType.GATEWAY
    );
  }

  /**
   * Returns whether Gemini 3.1 has been launched.
   *
   * Note: This method should only be called after startup, once experiments have been loaded.
   * If you need to call this during startup or from an async context, use
   * getGemini31Launched instead.
   */
  getGemini31LaunchedSync(): boolean {
    const authType = this.contentGeneratorConfig?.authType;
    if (this.isGemini31LaunchedForAuthType(authType)) {
      return true;
    }
    return (
      this.experiments?.flags[ExperimentFlags.GEMINI_3_1_PRO_LAUNCHED]
        ?.boolValue ?? false
    );
  }

  /**
   * Returns the configured default request timeout in milliseconds.
   */
  getRequestTimeoutMs(): number | undefined {
    const flag =
      this.experiments?.flags?.[ExperimentFlags.DEFAULT_REQUEST_TIMEOUT];
    if (flag?.intValue !== undefined) {
      const seconds = parseInt(flag.intValue, 10);
      if (Number.isInteger(seconds) && seconds >= 0) {
        return seconds * 1000; // Convert seconds to milliseconds
      }
    }
    return undefined;
  }

  /**
   * Returns whether Gemini 3.1 Flash Lite has been launched.
   *
   * Note: This method should only be called after startup, once experiments have been loaded.
   * If you need to call this during startup or from an async context, use
   * getGemini31FlashLiteLaunched instead.
   */
  getGemini31FlashLiteLaunchedSync(): boolean {
    const authType = this.contentGeneratorConfig?.authType;
    if (this.isGemini31LaunchedForAuthType(authType)) {
      return true;
    }
    return (
      this.experiments?.flags[ExperimentFlags.GEMINI_3_1_FLASH_LITE_LAUNCHED]
        ?.boolValue ?? false
    );
  }

  private async ensureExperimentsLoaded(): Promise<void> {
    if (!this.experimentsPromise) {
      return;
    }
    try {
      await this.experimentsPromise;
    } catch (e) {
      debugLogger.debug('Failed to fetch experiments', e);
    }
  }

  isInteractiveShellEnabled(): boolean {
    return (
      this.interactive &&
      this.ptyInfo !== 'child_process' &&
      this.enableInteractiveShell
    );
  }

  isSkillsSupportEnabled(): boolean {
    return this.skillsSupport;
  }

  /**
   * Reloads skills by re-discovering them from extensions and local directories.
   */
  async reloadSkills(): Promise<void> {
    if (!this.skillsSupport) {
      return;
    }

    if (this.onReload) {
      const refreshed = await this.onReload();
      this.disabledSkills = refreshed.disabledSkills ?? [];
      this.getSkillManager().setAdminSettings(
        refreshed.adminSkillsEnabled ?? this.adminSkillsEnabled,
      );
    }

    if (this.getSkillManager().isAdminEnabled()) {
      await this.getSkillManager().discoverSkills(
        this.storage,
        this.getExtensions(),
        this.isTrustedFolder(),
      );
      this.getSkillManager().setDisabledSkills(this.disabledSkills);

      // Re-register ActivateSkillTool to update its schema with the newly discovered skills
      if (this.getSkillManager().getSkills().length > 0) {
        this.toolRegistry.unregisterTool(ActivateSkillTool.Name);
        this.toolRegistry.registerTool(
          new ActivateSkillTool(this, this.messageBus),
        );
      } else {
        this.toolRegistry.unregisterTool(ActivateSkillTool.Name);
      }
    } else {
      this.getSkillManager().clearSkills();
      this.toolRegistry.unregisterTool(ActivateSkillTool.Name);
    }

    // Notify the client that system instructions might need updating
    this.updateSystemInstructionIfInitialized();
  }

  /**
   * Reloads agent settings.
   */
  async reloadAgents(): Promise<void> {
    if (this.onReload) {
      const refreshed = await this.onReload();
      if (refreshed.agents) {
        this.agents = refreshed.agents;
      }
    }
  }

  isInteractive(): boolean {
    return this.interactive;
  }

  getUseRipgrep(): boolean {
    return this.useRipgrep;
  }

  getUseBackgroundColor(): boolean {
    return this.useBackgroundColor;
  }

  getUseAlternateBuffer(): boolean {
    return this.useAlternateBuffer;
  }

  getUseTerminalBuffer(): boolean {
    return this.useTerminalBuffer;
  }

  getUseRenderProcess(): boolean {
    return this.useRenderProcess;
  }

  getEnableInteractiveShell(): boolean {
    return this.enableInteractiveShell;
  }

  getShellBackgroundCompletionBehavior(): 'inject' | 'notify' | 'silent' {
    return this.shellBackgroundCompletionBehavior;
  }

  getSkipNextSpeakerCheck(): boolean {
    return this.skipNextSpeakerCheck;
  }

  getContinueOnFailedApiCall(): boolean {
    return this.continueOnFailedApiCall;
  }

  getRetryFetchErrors(): boolean {
    return this.retryFetchErrors;
  }

  getMaxAttempts(): number {
    return this.maxAttempts;
  }

  getEnableShellOutputEfficiency(): boolean {
    return this.enableShellOutputEfficiency;
  }

  getShellToolInactivityTimeout(): number {
    return this.shellToolInactivityTimeout;
  }

  getShellExecutionConfig(): ShellExecutionConfig {
    return this.shellExecutionConfig;
  }

  setShellExecutionConfig(config: ShellExecutionConfig): void {
    this.shellExecutionConfig = {
      terminalWidth:
        config.terminalWidth ?? this.shellExecutionConfig.terminalWidth,
      terminalHeight:
        config.terminalHeight ?? this.shellExecutionConfig.terminalHeight,
      showColor: config.showColor ?? this.shellExecutionConfig.showColor,
      pager: config.pager ?? this.shellExecutionConfig.pager,
      sanitizationConfig:
        config.sanitizationConfig ??
        this.shellExecutionConfig.sanitizationConfig,
      sandboxManager:
        config.sandboxManager ?? this.shellExecutionConfig.sandboxManager,
    };
  }
  getScreenReader(): boolean {
    return this.accessibility.screenReader ?? false;
  }

  getTruncateToolOutputThreshold(): number {
    return Math.min(
      // Estimate remaining context window in characters (1 token ~= 4 chars).
      4 *
        (tokenLimit(this.model) - uiTelemetryService.getLastPromptTokenCount()),
      this.truncateToolOutputThreshold,
    );
  }

  getToolMaxOutputTokens(): number {
    return this.contextManagement.tools.distillation.maxOutputTokens;
  }

  getToolSummarizationThresholdTokens(): number {
    return this.contextManagement.tools.distillation
      .summarizationThresholdTokens;
  }

  getNextCompressionTruncationId(): number {
    return ++this.compressionTruncationCounter;
  }

  getUseWriteTodos(): boolean {
    return this.useWriteTodos;
  }

  getOutputFormat(): OutputFormat {
    return this.outputSettings?.format
      ? this.outputSettings.format
      : OutputFormat.TEXT;
  }

  async getGitService(): Promise<GitService> {
    if (!this.gitService) {
      this.gitService = new GitService(this.targetDir, this.storage);
      await this.gitService.initialize();
    }
    return this.gitService;
  }

  getFileExclusions(): FileExclusions {
    return this.fileExclusions;
  }

  /** @deprecated Use messageBus getter */
  getMessageBus(): MessageBus {
    return this.messageBus;
  }

  getPolicyEngine(): PolicyEngine {
    return this.policyEngine;
  }

  getEnableHooks(): boolean {
    return this.enableHooks;
  }

  getEnableHooksUI(): boolean {
    return this.enableHooksUI;
  }

  getGemmaModelRouterEnabled(): boolean {
    return this.gemmaModelRouter.enabled ?? false;
  }

  getGemmaModelRouterSettings(): GemmaModelRouterSettings {
    return this.gemmaModelRouter;
  }

  getAgentSessionNoninteractiveEnabled(): boolean {
    return this.agentSessionNoninteractiveEnabled;
  }

  getAgentSessionInteractiveEnabled(): boolean {
    return this.agentSessionInteractiveEnabled;
  }

  /**
   * Get override settings for a specific agent.
   * Reads from agents.overrides.<agentName>.
   */
  getAgentOverride(agentName: string): AgentOverride | undefined {
    return this.getAgentsSettings()?.overrides?.[agentName];
  }

  /**
   * Get browser agent configuration.
   * Combines generic AgentOverride fields with browser-specific customConfig.
   * This is the canonical way to access browser agent settings.
   */
  getBrowserAgentConfig(): {
    enabled: boolean;
    model?: string;
    customConfig: BrowserAgentCustomConfig;
  } {
    const override = this.getAgentOverride('browser_agent');
    const customConfig = this.getAgentsSettings()?.browser ?? {};
    return {
      enabled: override?.enabled ?? false,
      model: override?.modelConfig?.model,
      customConfig: {
        sessionMode: customConfig.sessionMode ?? 'persistent',
        headless: customConfig.headless ?? false,
        profilePath: customConfig.profilePath,
        visualModel: customConfig.visualModel,
        allowedDomains: customConfig.allowedDomains,
        disableUserInput: customConfig.disableUserInput,
        maxActionsPerTask: customConfig.maxActionsPerTask ?? 100,
        confirmSensitiveActions: customConfig.confirmSensitiveActions,
        blockFileUploads: customConfig.blockFileUploads,
      },
    };
  }

  /**
   * Determines if user input should be disabled during browser automation.
   * Based on the `disableUserInput` setting and `headless` mode.
   */
  shouldDisableBrowserUserInput(): boolean {
    const browserConfig = this.getBrowserAgentConfig();
    return (
      browserConfig.customConfig?.disableUserInput !== false &&
      !browserConfig.customConfig?.headless
    );
  }

  async createToolRegistry(): Promise<ToolRegistry> {
    const registry = new ToolRegistry(
      this,
      this.messageBus,
      /* isMainRegistry= */ true,
    );

    // helper to create & register core tools that are enabled
    const maybeRegister = (
      toolClass: { name: string; Name?: string },
      registerFn: () => void,
    ) => {
      const className = toolClass.name;
      const toolName = toolClass.Name || className;
      const coreTools = this.getCoreTools();
      // On some platforms, the className can be minified to _ClassName.
      const normalizedClassName = className.replace(/^_+/, '');

      let isEnabled = true; // Enabled by default if coreTools is not set.
      if (coreTools) {
        isEnabled = coreTools.some(
          (tool) =>
            tool === toolName ||
            tool === normalizedClassName ||
            tool.startsWith(`${toolName}(`) ||
            tool.startsWith(`${normalizedClassName}(`),
        );
      }

      if (isEnabled) {
        registerFn();
      }
    };

    maybeRegister(UpdateTopicTool, () =>
      registry.registerTool(new UpdateTopicTool(this, this.messageBus)),
    );

    maybeRegister(LSTool, () =>
      registry.registerTool(new LSTool(this, this.messageBus)),
    );
    maybeRegister(ReadFileTool, () =>
      registry.registerTool(new ReadFileTool(this, this.messageBus)),
    );

    if (this.getUseRipgrep()) {
      let useRipgrep = false;
      let errorString: undefined | string = undefined;
      try {
        useRipgrep = await canUseRipgrep();
      } catch (error: unknown) {
        errorString = String(error);
      }
      if (useRipgrep) {
        maybeRegister(RipGrepTool, () =>
          registry.registerTool(new RipGrepTool(this, this.messageBus)),
        );
      } else {
        logRipgrepFallback(this, new RipgrepFallbackEvent(errorString));
        maybeRegister(GrepTool, () =>
          registry.registerTool(new GrepTool(this, this.messageBus)),
        );
      }
    } else {
      maybeRegister(GrepTool, () =>
        registry.registerTool(new GrepTool(this, this.messageBus)),
      );
    }

    maybeRegister(GlobTool, () =>
      registry.registerTool(new GlobTool(this, this.messageBus)),
    );
    maybeRegister(ActivateSkillTool, () =>
      registry.registerTool(new ActivateSkillTool(this, this.messageBus)),
    );
    maybeRegister(EditTool, () =>
      registry.registerTool(new EditTool(this, this.messageBus)),
    );
    maybeRegister(WriteFileTool, () =>
      registry.registerTool(new WriteFileTool(this, this.messageBus)),
    );
    maybeRegister(WebFetchTool, () =>
      registry.registerTool(new WebFetchTool(this, this.messageBus)),
    );
    maybeRegister(ShellTool, () =>
      registry.registerTool(new ShellTool(this, this.messageBus)),
    );
    maybeRegister(ListBackgroundProcessesTool, () =>
      registry.registerTool(
        new ListBackgroundProcessesTool(this, this.messageBus),
      ),
    );
    maybeRegister(ReadBackgroundOutputTool, () =>
      registry.registerTool(
        new ReadBackgroundOutputTool(this, this.messageBus),
      ),
    );
    if (!this.isMemoryManagerEnabled()) {
      maybeRegister(MemoryTool, () =>
        registry.registerTool(new MemoryTool(this.messageBus, this.storage)),
      );
    }
    maybeRegister(WebSearchTool, () =>
      registry.registerTool(new WebSearchTool(this, this.messageBus)),
    );
    maybeRegister(AskUserTool, () =>
      registry.registerTool(new AskUserTool(this.messageBus)),
    );
    if (this.getUseWriteTodos()) {
      maybeRegister(WriteTodosTool, () =>
        registry.registerTool(new WriteTodosTool(this.messageBus)),
      );
    }
    if (this.isPlanEnabled()) {
      maybeRegister(ExitPlanModeTool, () =>
        registry.registerTool(new ExitPlanModeTool(this, this.messageBus)),
      );
      maybeRegister(EnterPlanModeTool, () =>
        registry.registerTool(new EnterPlanModeTool(this, this.messageBus)),
      );
    }

    if (this.isTrackerEnabled()) {
      maybeRegister(TrackerCreateTaskTool, () =>
        registry.registerTool(new TrackerCreateTaskTool(this, this.messageBus)),
      );
      maybeRegister(TrackerUpdateTaskTool, () =>
        registry.registerTool(new TrackerUpdateTaskTool(this, this.messageBus)),
      );
      maybeRegister(TrackerGetTaskTool, () =>
        registry.registerTool(new TrackerGetTaskTool(this, this.messageBus)),
      );
      maybeRegister(TrackerListTasksTool, () =>
        registry.registerTool(new TrackerListTasksTool(this, this.messageBus)),
      );
      maybeRegister(TrackerAddDependencyTool, () =>
        registry.registerTool(
          new TrackerAddDependencyTool(this, this.messageBus),
        ),
      );
      maybeRegister(TrackerVisualizeTool, () =>
        registry.registerTool(new TrackerVisualizeTool(this, this.messageBus)),
      );
    }

    // Register Subagent Tool
    maybeRegister(AgentTool, () =>
      registry.registerTool(new AgentTool(this, this.messageBus)),
    );

    await registry.discoverAllTools();
    registry.sortTools();
    return registry;
  }

  /**
   * Get the hook system instance
   */
  getHookSystem(): HookSystem | undefined {
    return this.hookSystem;
  }

  /**
   * Get hooks configuration
   */
  getHooks(): { [K in HookEventName]?: HookDefinition[] } | undefined {
    return this.hooks;
  }

  /**
   * Get project-specific hooks configuration
   */
  getProjectHooks(): { [K in HookEventName]?: HookDefinition[] } | undefined {
    return this.projectHooks;
  }

  /**
   * Update the list of disabled hooks dynamically.
   * This is used to keep the running system in sync with settings changes
   * without risk of loading new hook definitions into memory.
   */
  updateDisabledHooks(disabledHooks: string[]): void {
    this.disabledHooks = disabledHooks;
  }

  /**
   * Get disabled hooks list
   */
  getDisabledHooks(): string[] {
    return this.disabledHooks;
  }

  /**
   * Get experiments configuration
   */
  getExperiments(): Experiments | undefined {
    return this.experiments;
  }

  /**
   * Set experiments configuration
   */
  setExperiments(experiments: Experiments): void {
    this.experiments = experiments;
    const flagSummaries = Object.entries(experiments.flags ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([flagId, flag]) => {
        const summary: Record<string, unknown> = { flagId };
        if (flag.boolValue !== undefined) {
          summary['boolValue'] = flag.boolValue;
        }
        if (flag.floatValue !== undefined) {
          summary['floatValue'] = flag.floatValue;
        }
        if (flag.intValue !== undefined) {
          summary['intValue'] = flag.intValue;
        }
        if (flag.stringValue !== undefined) {
          summary['stringValue'] = flag.stringValue;
        }
        const int32Length = flag.int32ListValue?.values?.length ?? 0;
        if (int32Length > 0) {
          summary['int32ListLength'] = int32Length;
        }
        const stringListLength = flag.stringListValue?.values?.length ?? 0;
        if (stringListLength > 0) {
          summary['stringListLength'] = stringListLength;
        }
        return summary;
      });
    const summary = {
      experimentIds: experiments.experimentIds ?? [],
      flags: flagSummaries,
    };
    const summaryString = inspect(summary, {
      depth: null,
      maxArrayLength: null,
      maxStringLength: null,
      breakLength: 80,
      compact: false,
    });
    debugLogger.debug('Experiments loaded', summaryString);
  }

  private onAgentsRefreshed = async () => {
    await this.agentRegistry.initialize();

    // Propagate updates to the active chat session
    const client = this.geminiClient;
    if (client?.isInitialized()) {
      await client.setTools();
      client.updateSystemInstruction();
    } else {
      debugLogger.debug(
        '[Config] GeminiClient not initialized; skipping live prompt/tool refresh.',
      );
    }
  };

  /**
   * Disposes of resources and removes event listeners.
   */
  async dispose(): Promise<void> {
    this.logCurrentModeDuration(this.getApprovalMode());
    coreEvents.off(CoreEvent.AgentsRefreshed, this.onAgentsRefreshed);
    this.agentRegistry?.dispose();
    this._geminiClient?.dispose();
    if (this.mcpClientManager) {
      await this.mcpClientManager.stop();
    }
  }
}
// Export model constants for use in CLI
export { DEFAULT_GEMINI_FLASH_MODEL };
