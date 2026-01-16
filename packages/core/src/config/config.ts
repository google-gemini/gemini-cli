/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { inspect } from 'node:util';
import process from 'node:process';
import type {
  ContentGenerator,
  ContentGeneratorConfig,
} from '../core/contentGenerator.js';
import {
  AuthType,
  createContentGenerator,
  createContentGeneratorConfig,
} from '../core/contentGenerator.js';
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
import { GeminiClient } from '../core/client.js';
import { BaseLlmClient } from '../core/baseLlmClient.js';
import type { HookDefinition, HookEventName } from '../hooks/types.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { GitService } from '../services/gitService.js';
import type { TelemetryTarget } from '../telemetry/index.js';
import {
  initializeTelemetry,
  DEFAULT_TELEMETRY_TARGET,
  DEFAULT_OTLP_ENDPOINT,
  uiTelemetryService,
} from '../telemetry/index.js';
import { coreEvents, CoreEvent } from '../utils/events.js';
import { tokenLimit } from '../core/tokenLimits.js';
import {
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  DEFAULT_THINKING_MODE,
  isPreviewModel,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
} from './models.js';
import { shouldAttemptBrowserLaunch } from '../utils/browser.js';
import type { MCPOAuthConfig } from '../mcp/oauth-provider.js';
import { ideContextStore } from '../ide/ideContext.js';
import { WriteTodosTool } from '../tools/write-todos.js';
import type { FileSystemService } from '../services/fileSystemService.js';
import { StandardFileSystemService } from '../services/fileSystemService.js';
import { logRipgrepFallback, logFlashFallback } from '../telemetry/loggers.js';
import {
  RipgrepFallbackEvent,
  FlashFallbackEvent,
} from '../telemetry/types.js';
import type { FallbackModelHandler } from '../fallback/types.js';
import { ModelAvailabilityService } from '../availability/modelAvailabilityService.js';
import { ModelRouterService } from '../routing/modelRouterService.js';
import { OutputFormat } from '../output/types.js';
import type {
  ModelConfig,
  ModelConfigServiceConfig,
} from '../services/modelConfigService.js';
import { ModelConfigService } from '../services/modelConfigService.js';
import { DEFAULT_MODEL_CONFIGS } from './defaultModelConfigs.js';
import { ContextManager } from '../services/contextManager.js';
import type { GenerateContentParameters } from '@google/genai';

// Re-export OAuth config type
export type { MCPOAuthConfig, AnyToolInvocation };
import type { AnyToolInvocation } from '../tools/tools.js';
import { WorkspaceContext } from '../utils/workspaceContext.js';
import { Storage } from './storage.js';
import type { ShellExecutionConfig } from '../services/shellExecutionService.js';
import { FileExclusions } from '../utils/ignorePatterns.js';
import type { EventEmitter } from 'node:events';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { ApprovalMode, type PolicyEngineConfig } from '../policy/types.js';
import { HookSystem } from '../hooks/index.js';
import type { UserTierId } from '../code_assist/types.js';
import type { RetrieveUserQuotaResponse } from '../code_assist/types.js';
import type { GeminiCodeAssistSetting } from '../code_assist/types.js';
import { getCodeAssistServer } from '../code_assist/codeAssist.js';
import type { Experiments } from '../code_assist/experiments/experiments.js';
import { AgentRegistry } from '../agents/registry.js';
import { setGlobalProxy } from '../utils/fetch.js';
import { DelegateToAgentTool } from '../agents/delegate-to-agent-tool.js';
import { DELEGATE_TO_AGENT_TOOL_NAME } from '../tools/tool-names.js';
import { getExperiments } from '../code_assist/experiments/experiments.js';
import { ExperimentFlags } from '../code_assist/experiments/flagNames.js';
import { debugLogger } from '../utils/debugLogger.js';
import { SkillManager, type SkillDefinition } from '../skills/skillManager.js';
import { startupProfiler } from '../telemetry/startupProfiler.js';
import type { AgentDefinition } from '../agents/types.js';

export interface AccessibilitySettings {
  disableLoadingPhrases?: boolean;
  screenReader?: boolean;
}

export interface BugCommandSettings {
  urlTemplate: string;
}

export interface SummarizeToolOutputSettings {
  tokenBudget?: number;
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

export interface CodebaseInvestigatorSettings {
  enabled?: boolean;
  maxNumTurns?: number;
  maxTimeMinutes?: number;
  thinkingBudget?: number;
  model?: string;
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
  value: string;
  sensitive: boolean;
  scope?: 'user' | 'workspace';
  source?: string;
}

export interface CliHelpAgentSettings {
  enabled?: boolean;
}

export interface AgentRunConfig {
  maxTimeMinutes?: number;
  maxTurns?: number;
}

export interface AgentOverride {
  modelConfig?: ModelConfig;
  runConfig?: AgentRunConfig;
  disabled?: boolean;
}

export interface AgentSettings {
  overrides?: Record<string, AgentOverride>;
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
}

export interface ExtensionInstallMetadata {
  source: string;
  type: 'git' | 'local' | 'link' | 'github-release';
  releaseTag?: string; // Only present for github-release installs.
  ref?: string;
  autoUpdate?: boolean;
  allowPreRelease?: boolean;
}

import type { FileFilteringOptions } from './constants.js';
import {
  DEFAULT_FILE_FILTERING_OPTIONS,
  DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
} from './constants.js';

import {
  type ExtensionLoader,
  SimpleExtensionLoader,
} from '../utils/extensionLoader.js';
import { McpClientManager } from '../tools/mcp-client-manager.js';
import type { EnvironmentSanitizationConfig } from '../services/environmentSanitization.js';

export type { FileFilteringOptions };
export {
  DEFAULT_FILE_FILTERING_OPTIONS,
  DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
};

export const DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD = 4_000_000;
export const DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES = 1000;

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
  command: 'docker' | 'podman' | 'sandbox-exec';
  image: string;
}

export interface ConfigParameters {
  sessionId: string;
  embeddingModel?: string;
  sandbox?: SandboxConfig;
  targetDir: string;
  debugMode: boolean;
  question?: string;

  coreTools?: string[];
  allowedTools?: string[];
  excludeTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  userMemory?: string;
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
    disableFuzzySearch?: boolean;
    maxFileCount?: number;
    searchTimeout?: number;
  };
  checkpointing?: boolean;
  proxy?: string;
  cwd: string;
  fileDiscoveryService?: FileDiscoveryService;
  includeDirectories?: string[];
  bugCommand?: BugCommandSettings;
  model: string;
  maxSessionTurns?: number;
  experimentalZedIntegration?: boolean;
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
  importFormat?: 'tree' | 'flat';
  discoveryMaxDirs?: number;
  compressionThreshold?: number;
  interactive?: boolean;
  trustedFolder?: boolean;
  useRipgrep?: boolean;
  enableInteractiveShell?: boolean;
  skipNextSpeakerCheck?: boolean;
  shellExecutionConfig?: ShellExecutionConfig;
  extensionManagement?: boolean;
  enablePromptCompletion?: boolean;
  truncateToolOutputThreshold?: number;
  truncateToolOutputLines?: number;
  enableToolOutputTruncation?: boolean;
  eventEmitter?: EventEmitter;
  useWriteTodos?: boolean;
  policyEngineConfig?: PolicyEngineConfig;
  output?: OutputSettings;
  disableModelRouterForAuth?: AuthType[];
  codebaseInvestigatorSettings?: CodebaseInvestigatorSettings;
  cliHelpAgentSettings?: CliHelpAgentSettings;
  continueOnFailedApiCall?: boolean;
  retryFetchErrors?: boolean;
  enableShellOutputEfficiency?: boolean;
  shellToolInactivityTimeout?: number;
  fakeResponses?: string;
  recordResponses?: string;
  ptyInfo?: string;
  disableYoloMode?: boolean;
  modelConfigServiceConfig?: ModelConfigServiceConfig;
  enableHooks?: boolean;
  enableHooksUI?: boolean;
  experiments?: Experiments;
  hooks?: { [K in HookEventName]?: HookDefinition[] } & { disabled?: string[] };
  projectHooks?: { [K in HookEventName]?: HookDefinition[] } & {
    disabled?: string[];
  };
  previewFeatures?: boolean;
  enableAgents?: boolean;
  skillsSupport?: boolean;
  disabledSkills?: string[];
  adminSkillsEnabled?: boolean;
  experimentalJitContext?: boolean;
  disableLLMCorrection?: boolean;
  plan?: boolean;
  onModelChange?: (model: string) => void;
  mcpEnabled?: boolean;
  extensionsEnabled?: boolean;
  agents?: AgentSettings;
  onReload?: () => Promise<{
    disabledSkills?: string[];
    adminSkillsEnabled?: boolean;
    agents?: AgentSettings;
  }>;
}

export class Config {
  private toolRegistry!: ToolRegistry;
  private mcpClientManager?: McpClientManager;
  private allowedMcpServers: string[];
  private blockedMcpServers: string[];
  private allowedEnvironmentVariables: string[];
  private blockedEnvironmentVariables: string[];
  private readonly enableEnvironmentVariableRedaction: boolean;
  private promptRegistry!: PromptRegistry;
  private resourceRegistry!: ResourceRegistry;
  private agentRegistry!: AgentRegistry;
  private skillManager!: SkillManager;
  private sessionId: string;
  private fileSystemService: FileSystemService;
  private contentGeneratorConfig!: ContentGeneratorConfig;
  private contentGenerator!: ContentGenerator;
  readonly modelConfigService: ModelConfigService;
  private readonly embeddingModel: string;
  private readonly sandbox: SandboxConfig | undefined;
  private readonly targetDir: string;
  private workspaceContext: WorkspaceContext;
  private readonly debugMode: boolean;
  private readonly question: string | undefined;

  private readonly coreTools: string[] | undefined;
  private readonly allowedTools: string[] | undefined;
  private readonly excludeTools: string[] | undefined;
  private readonly toolDiscoveryCommand: string | undefined;
  private readonly toolCallCommand: string | undefined;
  private readonly mcpServerCommand: string | undefined;
  private readonly mcpEnabled: boolean;
  private readonly extensionsEnabled: boolean;
  private mcpServers: Record<string, MCPServerConfig> | undefined;
  private userMemory: string;
  private geminiMdFileCount: number;
  private geminiMdFilePaths: string[];
  private readonly showMemoryUsage: boolean;
  private readonly accessibility: AccessibilitySettings;
  private readonly telemetrySettings: TelemetrySettings;
  private readonly usageStatisticsEnabled: boolean;
  private geminiClient!: GeminiClient;
  private baseLlmClient!: BaseLlmClient;
  private modelRouterService: ModelRouterService;
  private readonly modelAvailabilityService: ModelAvailabilityService;
  private readonly fileFiltering: {
    respectGitIgnore: boolean;
    respectGeminiIgnore: boolean;
    enableRecursiveFileSearch: boolean;
    disableFuzzySearch: boolean;
    maxFileCount: number;
    searchTimeout: number;
  };
  private fileDiscoveryService: FileDiscoveryService | null = null;
  private gitService: GitService | undefined = undefined;
  private readonly checkpointing: boolean;
  private readonly proxy: string | undefined;
  private readonly cwd: string;
  private readonly bugCommand: BugCommandSettings | undefined;
  private model: string;
  private previewFeatures: boolean | undefined;
  private hasAccessToPreviewModel: boolean = false;
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
  private quotaErrorOccurred: boolean = false;
  private readonly summarizeToolOutput:
    | Record<string, SummarizeToolOutputSettings>
    | undefined;
  private readonly experimentalZedIntegration: boolean = false;
  private readonly loadMemoryFromIncludeDirectories: boolean = false;
  private readonly importFormat: 'tree' | 'flat';
  private readonly discoveryMaxDirs: number;
  private readonly compressionThreshold: number | undefined;
  private readonly interactive: boolean;
  private readonly ptyInfo: string;
  private readonly trustedFolder: boolean | undefined;
  private readonly useRipgrep: boolean;
  private readonly enableInteractiveShell: boolean;
  private readonly skipNextSpeakerCheck: boolean;
  private shellExecutionConfig: ShellExecutionConfig;
  private readonly extensionManagement: boolean = true;
  private readonly enablePromptCompletion: boolean = false;
  private readonly truncateToolOutputThreshold: number;
  private readonly truncateToolOutputLines: number;
  private readonly enableToolOutputTruncation: boolean;
  private initialized: boolean = false;
  readonly storage: Storage;
  private readonly fileExclusions: FileExclusions;
  private readonly eventEmitter?: EventEmitter;
  private readonly useWriteTodos: boolean;
  private readonly messageBus: MessageBus;
  private readonly policyEngine: PolicyEngine;
  private readonly outputSettings: OutputSettings;
  private readonly codebaseInvestigatorSettings: CodebaseInvestigatorSettings;
  private readonly cliHelpAgentSettings: CliHelpAgentSettings;
  private readonly continueOnFailedApiCall: boolean;
  private readonly retryFetchErrors: boolean;
  private readonly enableShellOutputEfficiency: boolean;
  private readonly shellToolInactivityTimeout: number;
  readonly fakeResponses?: string;
  readonly recordResponses?: string;
  private readonly disableYoloMode: boolean;
  private pendingIncludeDirectories: string[];
  private readonly enableHooks: boolean;
  private readonly enableHooksUI: boolean;
  private readonly hooks:
    | { [K in HookEventName]?: HookDefinition[] }
    | undefined;
  private readonly projectHooks:
    | ({ [K in HookEventName]?: HookDefinition[] } & { disabled?: string[] })
    | undefined;
  private readonly disabledHooks: string[];
  private experiments: Experiments | undefined;
  private experimentsPromise: Promise<void> | undefined;
  private hookSystem?: HookSystem;
  private readonly onModelChange: ((model: string) => void) | undefined;
  private readonly onReload:
    | (() => Promise<{
        disabledSkills?: string[];
        adminSkillsEnabled?: boolean;
        agents?: AgentSettings;
      }>)
    | undefined;

  private readonly enableAgents: boolean;
  private agents: AgentSettings;
  private readonly skillsSupport: boolean;
  private disabledSkills: string[];
  private readonly adminSkillsEnabled: boolean;

  private readonly experimentalJitContext: boolean;
  private readonly disableLLMCorrection: boolean;
  private readonly planEnabled: boolean;
  private contextManager?: ContextManager;
  private terminalBackground: string | undefined = undefined;
  private remoteAdminSettings: GeminiCodeAssistSetting | undefined;
  private latestApiRequest: GenerateContentParameters | undefined;

  constructor(params: ConfigParameters) {
    this.sessionId = params.sessionId;
    this.embeddingModel =
      params.embeddingModel ?? DEFAULT_GEMINI_EMBEDDING_MODEL;
    this.fileSystemService = new StandardFileSystemService();
    this.sandbox = params.sandbox;
    this.targetDir = path.resolve(params.targetDir);
    this.folderTrust = params.folderTrust ?? false;
    this.workspaceContext = new WorkspaceContext(this.targetDir, []);
    this.pendingIncludeDirectories = params.includeDirectories ?? [];
    this.debugMode = params.debugMode;
    this.question = params.question;

    this.coreTools = params.coreTools;
    this.allowedTools = params.allowedTools;
    this.excludeTools = params.excludeTools;
    this.toolDiscoveryCommand = params.toolDiscoveryCommand;
    this.toolCallCommand = params.toolCallCommand;
    this.mcpServerCommand = params.mcpServerCommand;
    this.mcpServers = params.mcpServers;
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
      disableFuzzySearch: params.fileFiltering?.disableFuzzySearch ?? false,
      maxFileCount:
        params.fileFiltering?.maxFileCount ??
        DEFAULT_FILE_FILTERING_OPTIONS.maxFileCount ??
        20000,
      searchTimeout:
        params.fileFiltering?.searchTimeout ??
        DEFAULT_FILE_FILTERING_OPTIONS.searchTimeout ??
        5000,
    };
    this.checkpointing = params.checkpointing ?? false;
    this.proxy = params.proxy;
    this.cwd = params.cwd ?? process.cwd();
    this.fileDiscoveryService = params.fileDiscoveryService ?? null;
    this.bugCommand = params.bugCommand;
    this.model = params.model;
    this._activeModel = params.model;
    this.enableAgents = params.enableAgents ?? false;
    this.agents = params.agents ?? {};
    this.disableLLMCorrection = params.disableLLMCorrection ?? false;
    this.planEnabled = params.plan ?? false;
    this.skillsSupport = params.skillsSupport ?? false;
    this.disabledSkills = params.disabledSkills ?? [];
    this.adminSkillsEnabled = params.adminSkillsEnabled ?? true;
    this.modelAvailabilityService = new ModelAvailabilityService();
    this.previewFeatures = params.previewFeatures ?? undefined;
    this.experimentalJitContext = params.experimentalJitContext ?? false;
    this.maxSessionTurns = params.maxSessionTurns ?? -1;
    this.experimentalZedIntegration =
      params.experimentalZedIntegration ?? false;
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
    this.loadMemoryFromIncludeDirectories =
      params.loadMemoryFromIncludeDirectories ?? false;
    this.importFormat = params.importFormat ?? 'tree';
    this.discoveryMaxDirs = params.discoveryMaxDirs ?? 200;
    this.compressionThreshold = params.compressionThreshold;
    this.interactive = params.interactive ?? false;
    this.ptyInfo = params.ptyInfo ?? 'child_process';
    this.trustedFolder = params.trustedFolder;
    this.useRipgrep = params.useRipgrep ?? true;
    this.enableInteractiveShell = params.enableInteractiveShell ?? false;
    this.skipNextSpeakerCheck = params.skipNextSpeakerCheck ?? true;
    this.shellExecutionConfig = {
      terminalWidth: params.shellExecutionConfig?.terminalWidth ?? 80,
      terminalHeight: params.shellExecutionConfig?.terminalHeight ?? 24,
      showColor: params.shellExecutionConfig?.showColor ?? false,
      pager: params.shellExecutionConfig?.pager ?? 'cat',
      sanitizationConfig: this.sanitizationConfig,
    };
    this.truncateToolOutputThreshold =
      params.truncateToolOutputThreshold ??
      DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD;
    this.truncateToolOutputLines =
      params.truncateToolOutputLines ?? DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES;
    this.enableToolOutputTruncation = params.enableToolOutputTruncation ?? true;
    // // TODO(joshualitt): Re-evaluate the todo tool for 3 family.
    this.useWriteTodos = isPreviewModel(this.model)
      ? false
      : (params.useWriteTodos ?? true);
    this.enableHooksUI = params.enableHooksUI ?? true;
    this.enableHooks = params.enableHooks ?? false;
    this.disabledHooks =
      (params.hooks && 'disabled' in params.hooks
        ? params.hooks.disabled
        : undefined) ?? [];

    this.codebaseInvestigatorSettings = {
      enabled: params.codebaseInvestigatorSettings?.enabled ?? true,
      maxNumTurns: params.codebaseInvestigatorSettings?.maxNumTurns ?? 10,
      maxTimeMinutes: params.codebaseInvestigatorSettings?.maxTimeMinutes ?? 3,
      thinkingBudget:
        params.codebaseInvestigatorSettings?.thinkingBudget ??
        DEFAULT_THINKING_MODE,
      model: params.codebaseInvestigatorSettings?.model,
    };
    this.cliHelpAgentSettings = {
      enabled: params.cliHelpAgentSettings?.enabled ?? true,
    };
    this.continueOnFailedApiCall = params.continueOnFailedApiCall ?? true;
    this.enableShellOutputEfficiency =
      params.enableShellOutputEfficiency ?? true;
    this.shellToolInactivityTimeout =
      (params.shellToolInactivityTimeout ?? 300) * 1000; // 5 minutes
    this.extensionManagement = params.extensionManagement ?? true;
    this.enableExtensionReloading = params.enableExtensionReloading ?? false;
    this.storage = new Storage(this.targetDir);
    this.fakeResponses = params.fakeResponses;
    this.recordResponses = params.recordResponses;
    this.enablePromptCompletion = params.enablePromptCompletion ?? false;
    this.fileExclusions = new FileExclusions(this);
    this.eventEmitter = params.eventEmitter;
    this.policyEngine = new PolicyEngine({
      ...params.policyEngineConfig,
      approvalMode:
        params.approvalMode ?? params.policyEngineConfig?.approvalMode,
    });
    this.messageBus = new MessageBus(this.policyEngine, this.debugMode);
    this.skillManager = new SkillManager();
    this.outputSettings = {
      format: params.output?.format ?? OutputFormat.TEXT,
    };
    this.retryFetchErrors = params.retryFetchErrors ?? false;
    this.disableYoloMode = params.disableYoloMode ?? false;
    this.hooks = params.hooks;
    this.projectHooks = params.projectHooks;
    this.experiments = params.experiments;
    this.onModelChange = params.onModelChange;
    this.onReload = params.onReload;

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
    this.geminiClient = new GeminiClient(this);
    this.modelRouterService = new ModelRouterService(this);

    // HACK: The settings loading logic doesn't currently merge the default
    // generation config with the user's settings. This means if a user provides
    // any `generation` settings (e.g., just `overrides`), the default `aliases`
    // are lost. This hack manually merges the default aliases back in if they
    // are missing from the user's config.
    // TODO(12593): Fix the settings loading logic to properly merge defaults and
    // remove this hack.
    let modelConfigServiceConfig = params.modelConfigServiceConfig;
    if (modelConfigServiceConfig) {
      if (!modelConfigServiceConfig.aliases) {
        modelConfigServiceConfig = {
          ...modelConfigServiceConfig,
          aliases: DEFAULT_MODEL_CONFIGS.aliases,
        };
      }
      if (!modelConfigServiceConfig.overrides) {
        modelConfigServiceConfig = {
          ...modelConfigServiceConfig,
          overrides: DEFAULT_MODEL_CONFIGS.overrides,
        };
      }
    }

    this.modelConfigService = new ModelConfigService(
      modelConfigServiceConfig ?? DEFAULT_MODEL_CONFIGS,
    );
  }

  /**
   * Must only be called once, throws if called again.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw Error('Config was already initialized');
    }
    this.initialized = true;

    // Initialize centralized FileDiscoveryService
    const discoverToolsHandle = startupProfiler.start('discover_tools');
    this.getFileService();
    if (this.getCheckpointingEnabled()) {
      await this.getGitService();
    }
    this.promptRegistry = new PromptRegistry();
    this.resourceRegistry = new ResourceRegistry();

    this.agentRegistry = new AgentRegistry(this);
    await this.agentRegistry.initialize();

    coreEvents.on(CoreEvent.AgentsRefreshed, this.onAgentsRefreshed);

    this.toolRegistry = await this.createToolRegistry();
    discoverToolsHandle?.end();
    this.mcpClientManager = new McpClientManager(
      this.toolRegistry,
      this,
      this.eventEmitter,
    );
    // We do not await this promise so that the CLI can start up even if
    // MCP servers are slow to connect.
    Promise.all([
      this.mcpClientManager.startConfiguredMcpServers(),
      this.getExtensionLoader().start(this),
    ]).catch((error) => {
      debugLogger.error('Error initializing MCP clients:', error);
    });

    if (this.skillsSupport) {
      this.getSkillManager().setAdminSettings(this.adminSkillsEnabled);
      if (this.adminSkillsEnabled) {
        await this.getSkillManager().discoverSkills(
          this.storage,
          this.getExtensions(),
        );
        this.getSkillManager().setDisabledSkills(this.disabledSkills);

        // Re-register ActivateSkillTool to update its schema with the discovered enabled skill enums
        if (this.getSkillManager().getSkills().length > 0) {
          this.getToolRegistry().unregisterTool(ActivateSkillTool.Name);
          this.getToolRegistry().registerTool(
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
      this.contextManager = new ContextManager(this);
      await this.contextManager.refresh();
    }

    await this.geminiClient.initialize();
  }

  getContentGenerator(): ContentGenerator {
    return this.contentGenerator;
  }

  async refreshAuth(authMethod: AuthType) {
    // Reset availability service when switching auth
    this.modelAvailabilityService.reset();

    // Vertex and Genai have incompatible encryption and sending history with
    // thoughtSignature from Genai to Vertex will fail, we need to strip them
    if (
      this.contentGeneratorConfig?.authType === AuthType.USE_GEMINI &&
      authMethod !== AuthType.USE_GEMINI
    ) {
      // Restore the conversation history to the new client
      this.geminiClient.stripThoughtsFromHistory();
    }

    // Reset availability status when switching auth (e.g. from limited key to OAuth)
    this.modelAvailabilityService.reset();

    const newContentGeneratorConfig = await createContentGeneratorConfig(
      this,
      authMethod,
    );
    this.contentGenerator = await createContentGenerator(
      newContentGeneratorConfig,
      this,
      this.getSessionId(),
    );
    // Only assign to instance properties after successful initialization
    this.contentGeneratorConfig = newContentGeneratorConfig;

    // Initialize BaseLlmClient now that the ContentGenerator is available
    this.baseLlmClient = new BaseLlmClient(this.contentGenerator, this);

    const codeAssistServer = getCodeAssistServer(this);
    if (codeAssistServer?.projectId) {
      await this.refreshUserQuota();
    }

    this.experimentsPromise = getExperiments(codeAssistServer)
      .then((experiments) => {
        this.setExperiments(experiments);

        // If preview features have not been set and the user authenticated through Google, we enable preview based on remote config only if it's true
        if (this.getPreviewFeatures() === undefined) {
          const remotePreviewFeatures =
            experiments.flags[ExperimentFlags.ENABLE_PREVIEW]?.boolValue;
          if (remotePreviewFeatures === true) {
            this.setPreviewFeatures(remotePreviewFeatures);
          }
        }
      })
      .catch((e) => {
        debugLogger.error('Failed to fetch experiments', e);
      });

    const authType = this.contentGeneratorConfig.authType;
    if (
      authType === AuthType.USE_GEMINI ||
      authType === AuthType.USE_VERTEX_AI
    ) {
      this.setHasAccessToPreviewModel(true);
    }

    // Update model if user no longer has access to the preview model
    if (!this.hasAccessToPreviewModel && isPreviewModel(this.model)) {
      this.setModel(DEFAULT_GEMINI_MODEL_AUTO);
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

  /**
   * Provides access to the BaseLlmClient for stateless LLM operations.
   */
  getBaseLlmClient(): BaseLlmClient {
    if (!this.baseLlmClient) {
      // Handle cases where initialization might be deferred or authentication failed
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

  getSessionId(): string {
    return this.sessionId;
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
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

  getRemoteAdminSettings(): GeminiCodeAssistSetting | undefined {
    return this.remoteAdminSettings;
  }

  setRemoteAdminSettings(settings: GeminiCodeAssistSetting): void {
    this.remoteAdminSettings = settings;
  }

  shouldLoadMemoryFromIncludeDirectories(): boolean {
    return this.loadMemoryFromIncludeDirectories;
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

  setModel(newModel: string, isTemporary: boolean = true): void {
    if (this.model !== newModel || this._activeModel !== newModel) {
      this.model = newModel;
      // When the user explicitly sets a model, that becomes the active model.
      this._activeModel = newModel;
      coreEvents.emitModelChanged(newModel);
      if (this.onModelChange && !isTemporary) {
        this.onModelChange(newModel);
      }
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

  resetTurn(): void {
    this.modelAvailabilityService.resetTurn();
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

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  getSandbox(): SandboxConfig | undefined {
    return this.sandbox;
  }

  isRestrictiveSandbox(): boolean {
    const sandboxConfig = this.getSandbox();
    const seatbeltProfile = process.env['SEATBELT_PROFILE'];
    return (
      !!sandboxConfig &&
      sandboxConfig.command === 'sandbox-exec' &&
      !!seatbeltProfile &&
      seatbeltProfile.startsWith('restrictive-')
    );
  }

  getTargetDir(): string {
    return this.targetDir;
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  getWorkspaceContext(): WorkspaceContext {
    return this.workspaceContext;
  }

  getAgentRegistry(): AgentRegistry {
    return this.agentRegistry;
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  getPromptRegistry(): PromptRegistry {
    return this.promptRegistry;
  }

  getSkillManager(): SkillManager {
    return this.skillManager;
  }

  getResourceRegistry(): ResourceRegistry {
    return this.resourceRegistry;
  }

  getDebugMode(): boolean {
    return this.debugMode;
  }
  getQuestion(): string | undefined {
    return this.question;
  }

  getPreviewFeatures(): boolean | undefined {
    return this.previewFeatures;
  }

  setPreviewFeatures(previewFeatures: boolean) {
    // No change in state, no action needed
    if (this.previewFeatures === previewFeatures) {
      return;
    }
    this.previewFeatures = previewFeatures;
    const currentModel = this.getModel();

    // Case 1: Disabling preview features while on a preview model
    if (!previewFeatures && isPreviewModel(currentModel)) {
      this.setModel(DEFAULT_GEMINI_MODEL_AUTO);
    }

    // Case 2: Enabling preview features while on the default auto model
    else if (previewFeatures && currentModel === DEFAULT_GEMINI_MODEL_AUTO) {
      this.setModel(PREVIEW_GEMINI_MODEL_AUTO);
    }
  }

  getHasAccessToPreviewModel(): boolean {
    return this.hasAccessToPreviewModel;
  }

  setHasAccessToPreviewModel(hasAccess: boolean): void {
    this.hasAccessToPreviewModel = hasAccess;
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
      const hasAccess =
        quota.buckets?.some((b) => b.modelId === PREVIEW_GEMINI_MODEL) ?? false;
      this.setHasAccessToPreviewModel(hasAccess);
      return quota;
    } catch (e) {
      debugLogger.debug('Failed to retrieve user quota', e);
      return undefined;
    }
  }

  getCoreTools(): string[] | undefined {
    return this.coreTools;
  }

  getAllowedTools(): string[] | undefined {
    return this.allowedTools;
  }

  /**
   * All the excluded tools from static configuration, loaded extensions, or
   * other sources.
   *
   * May change over time.
   */
  getExcludeTools(): Set<string> | undefined {
    const excludeToolsSet = new Set([...(this.excludeTools ?? [])]);
    for (const extension of this.getExtensionLoader().getExtensions()) {
      if (!extension.isActive) {
        continue;
      }
      for (const tool of extension.excludeTools || []) {
        excludeToolsSet.add(tool);
      }
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

  getExtensionsEnabled(): boolean {
    return this.extensionsEnabled;
  }

  getMcpClientManager(): McpClientManager | undefined {
    return this.mcpClientManager;
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

  getUserMemory(): string {
    if (this.experimentalJitContext && this.contextManager) {
      return [
        this.contextManager.getGlobalMemory(),
        this.contextManager.getEnvironmentMemory(),
      ]
        .filter(Boolean)
        .join('\n\n');
    }
    return this.userMemory;
  }

  setUserMemory(newUserMemory: string): void {
    this.userMemory = newUserMemory;
  }

  getGlobalMemory(): string {
    return this.contextManager?.getGlobalMemory() ?? '';
  }

  getEnvironmentMemory(): string {
    return this.contextManager?.getEnvironmentMemory() ?? '';
  }

  getContextManager(): ContextManager | undefined {
    return this.contextManager;
  }

  isJitContextEnabled(): boolean {
    return this.experimentalJitContext;
  }

  getGeminiMdFileCount(): number {
    if (this.experimentalJitContext && this.contextManager) {
      return this.contextManager.getLoadedPaths().size;
    }
    return this.geminiMdFileCount;
  }

  setGeminiMdFileCount(count: number): void {
    this.geminiMdFileCount = count;
  }

  getGeminiMdFilePaths(): string[] {
    if (this.experimentalJitContext && this.contextManager) {
      return Array.from(this.contextManager.getLoadedPaths());
    }
    return this.geminiMdFilePaths;
  }

  setGeminiMdFilePaths(paths: string[]): void {
    this.geminiMdFilePaths = paths;
  }

  getApprovalMode(): ApprovalMode {
    return this.policyEngine.getApprovalMode();
  }

  setApprovalMode(mode: ApprovalMode): void {
    if (!this.isTrustedFolder() && mode !== ApprovalMode.DEFAULT) {
      throw new Error(
        'Cannot enable privileged approval modes in an untrusted folder.',
      );
    }
    this.policyEngine.setApprovalMode(mode);
  }

  isYoloModeDisabled(): boolean {
    return this.disableYoloMode || !this.isTrustedFolder();
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

  getTelemetryUseCollector(): boolean {
    return this.telemetrySettings.useCollector ?? false;
  }

  getTelemetryUseCliAuth(): boolean {
    return this.telemetrySettings.useCliAuth ?? false;
  }

  getGeminiClient(): GeminiClient {
    return this.geminiClient;
  }

  /**
   * Updates the system instruction with the latest user memory.
   * Whenever the user memory (GEMINI.md files) is updated.
   */
  async updateSystemInstructionIfInitialized(): Promise<void> {
    const geminiClient = this.getGeminiClient();
    if (geminiClient?.isInitialized()) {
      await geminiClient.updateSystemInstruction();
    }
  }

  getModelRouterService(): ModelRouterService {
    return this.modelRouterService;
  }

  getModelAvailabilityService(): ModelAvailabilityService {
    return this.modelAvailabilityService;
  }

  getEnableRecursiveFileSearch(): boolean {
    return this.fileFiltering.enableRecursiveFileSearch;
  }

  getFileFilteringDisableFuzzySearch(): boolean {
    return this.fileFiltering.disableFuzzySearch;
  }

  getFileFilteringRespectGitIgnore(): boolean {
    return this.fileFiltering.respectGitIgnore;
  }
  getFileFilteringRespectGeminiIgnore(): boolean {
    return this.fileFiltering.respectGeminiIgnore;
  }

  getFileFilteringOptions(): FileFilteringOptions {
    return {
      respectGitIgnore: this.fileFiltering.respectGitIgnore,
      respectGeminiIgnore: this.fileFiltering.respectGeminiIgnore,
      maxFileCount: this.fileFiltering.maxFileCount,
      searchTimeout: this.fileFiltering.searchTimeout,
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

  getFileService(): FileDiscoveryService {
    if (!this.fileDiscoveryService) {
      this.fileDiscoveryService = new FileDiscoveryService(this.targetDir);
    }
    return this.fileDiscoveryService;
  }

  getUsageStatisticsEnabled(): boolean {
    return this.usageStatisticsEnabled;
  }

  getExperimentalZedIntegration(): boolean {
    return this.experimentalZedIntegration;
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

  isAgentsEnabled(): boolean {
    return this.enableAgents;
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
      );
      this.getSkillManager().setDisabledSkills(this.disabledSkills);

      // Re-register ActivateSkillTool to update its schema with the newly discovered skills
      if (this.getSkillManager().getSkills().length > 0) {
        this.getToolRegistry().unregisterTool(ActivateSkillTool.Name);
        this.getToolRegistry().registerTool(
          new ActivateSkillTool(this, this.messageBus),
        );
      } else {
        this.getToolRegistry().unregisterTool(ActivateSkillTool.Name);
      }
    } else {
      this.getSkillManager().clearSkills();
      this.getToolRegistry().unregisterTool(ActivateSkillTool.Name);
    }

    // Notify the client that system instructions might need updating
    await this.updateSystemInstructionIfInitialized();
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

  getEnableInteractiveShell(): boolean {
    return this.enableInteractiveShell;
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
    };
  }
  getScreenReader(): boolean {
    return this.accessibility.screenReader ?? false;
  }

  getEnablePromptCompletion(): boolean {
    return this.enablePromptCompletion;
  }

  getEnableToolOutputTruncation(): boolean {
    return this.enableToolOutputTruncation;
  }

  getTruncateToolOutputThreshold(): number {
    return Math.min(
      // Estimate remaining context window in characters (1 token ~= 4 chars).
      4 *
        (tokenLimit(this.model) - uiTelemetryService.getLastPromptTokenCount()),
      this.truncateToolOutputThreshold,
    );
  }

  getTruncateToolOutputLines(): number {
    return this.truncateToolOutputLines;
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

  getCodebaseInvestigatorSettings(): CodebaseInvestigatorSettings {
    return this.codebaseInvestigatorSettings;
  }

  getCliHelpAgentSettings(): CliHelpAgentSettings {
    return this.cliHelpAgentSettings;
  }

  async createToolRegistry(): Promise<ToolRegistry> {
    const registry = new ToolRegistry(this, this.messageBus);

    // helper to create & register core tools that are enabled
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registerCoreTool = (ToolClass: any, ...args: unknown[]) => {
      const className = ToolClass.name;
      const toolName = ToolClass.Name || className;
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
        // Pass message bus to tools (required for policy engine integration)
        const toolArgs = [...args, this.getMessageBus()];

        registry.registerTool(new ToolClass(...toolArgs));
      }
    };

    registerCoreTool(LSTool, this);
    registerCoreTool(ReadFileTool, this);

    if (this.getUseRipgrep()) {
      let useRipgrep = false;
      let errorString: undefined | string = undefined;
      try {
        useRipgrep = await canUseRipgrep();
      } catch (error: unknown) {
        errorString = String(error);
      }
      if (useRipgrep) {
        registerCoreTool(RipGrepTool, this);
      } else {
        logRipgrepFallback(this, new RipgrepFallbackEvent(errorString));
        registerCoreTool(GrepTool, this);
      }
    } else {
      registerCoreTool(GrepTool, this);
    }

    registerCoreTool(GlobTool, this);
    registerCoreTool(ActivateSkillTool, this);
    registerCoreTool(EditTool, this);
    registerCoreTool(WriteFileTool, this);
    registerCoreTool(WebFetchTool, this);
    registerCoreTool(ShellTool, this);
    registerCoreTool(MemoryTool);
    registerCoreTool(WebSearchTool, this);
    if (this.getUseWriteTodos()) {
      registerCoreTool(WriteTodosTool);
    }

    // Register Subagents as Tools
    // Register DelegateToAgentTool if agents are enabled
    this.registerDelegateToAgentTool(registry);

    await registry.discoverAllTools();
    registry.sortTools();
    return registry;
  }

  /**
   * Registers the DelegateToAgentTool if agents or related features are enabled.
   */
  private registerDelegateToAgentTool(registry: ToolRegistry): void {
    if (
      this.isAgentsEnabled() ||
      this.getCodebaseInvestigatorSettings().enabled ||
      this.getCliHelpAgentSettings().enabled
    ) {
      // Check if the delegate tool itself is allowed (if allowedTools is set)
      const allowedTools = this.getAllowedTools();
      const isAllowed =
        !allowedTools || allowedTools.includes(DELEGATE_TO_AGENT_TOOL_NAME);

      if (isAllowed) {
        const delegateTool = new DelegateToAgentTool(
          this.agentRegistry,
          this,
          this.getMessageBus(),
        );
        registry.registerTool(delegateTool);
      }
    }
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
  getProjectHooks():
    | ({ [K in HookEventName]?: HookDefinition[] } & { disabled?: string[] })
    | undefined {
    return this.projectHooks;
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
    if (this.toolRegistry) {
      this.registerDelegateToAgentTool(this.toolRegistry);
    }
    // Propagate updates to the active chat session
    const client = this.getGeminiClient();
    if (client?.isInitialized()) {
      await client.setTools();
      await client.updateSystemInstruction();
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
    coreEvents.off(CoreEvent.AgentsRefreshed, this.onAgentsRefreshed);
    if (this.agentRegistry) {
      this.agentRegistry.dispose();
    }
    if (this.mcpClientManager) {
      await this.mcpClientManager.stop();
    }
  }
}
// Export model constants for use in CLI
export { DEFAULT_GEMINI_FLASH_MODEL };
