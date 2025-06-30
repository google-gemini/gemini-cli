/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import process from 'node:process';
import {
  AuthType,
  ContentGeneratorConfig,
  createContentGeneratorConfig,
} from '../core/contentGenerator.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { LSTool } from '../tools/ls.js';
import { ReadFileTool } from '../tools/read-file.js';
import { GrepTool } from '../tools/grep.js';
import { GlobTool } from '../tools/glob.js';
import { EditTool } from '../tools/edit.js';
import { ShellTool } from '../tools/shell.js';
import { WriteFileTool } from '../tools/write-file.js';
import { WebFetchTool } from '../tools/web-fetch.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import {
  MemoryTool,
  setGeminiMdFilename,
  GEMINI_CONFIG_DIR as GEMINI_DIR,
} from '../tools/memoryTool.js';
import { WebSearchTool } from '../tools/web-search.js';
import { BackupTool } from '../tools/backup.js';
import { GeminiClient } from '../core/client.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { GitService } from '../services/gitService.js';
import { getProjectTempDir } from '../utils/paths.js';
import {
  initializeTelemetry,
  DEFAULT_TELEMETRY_TARGET,
  DEFAULT_OTLP_ENDPOINT,
  TelemetryTarget,
  StartSessionEvent,
} from '../telemetry/index.js';
import {
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
} from './models.js';
import { ClearcutLogger } from '../telemetry/clearcut-logger/clearcut-logger.js';

/**
 * Defines the approval mode for tool execution.
 */
export enum ApprovalMode {
  /**
   * Default mode: The user is prompted for approval before executing a tool.
   */
  DEFAULT = 'default',
  /**
   * Auto-edit mode: The user is prompted for approval before executing a tool that modifies files.
   */
  AUTO_EDIT = 'autoEdit',
  /**
   * YOLO mode: All tools are executed without prompting for approval.
   */
  YOLO = 'yolo',
}

/**
 * Defines accessibility settings.
 */
export interface AccessibilitySettings {
  /**
   * When true, disables the loading phrases that are displayed while waiting for a response.
   */
  disableLoadingPhrases?: boolean;
}

/**
 * Defines settings for the bug command.
 */
export interface BugCommandSettings {
  /**
   * A URL template to use for creating bug reports.
   */
  urlTemplate: string;
}

/**
 * Defines telemetry settings.
 */
export interface TelemetrySettings {
  /**
   * When true, telemetry is enabled.
   */
  enabled?: boolean;
  /**
   * The telemetry target to use.
   */
  target?: TelemetryTarget;
  /**
   * The OTLP endpoint to use for telemetry.
   */
  otlpEndpoint?: string;
  /**
   * When true, prompts are logged.
   */
  logPrompts?: boolean;
}

/**
 * Defines the configuration for an MCP server.
 */
export class MCPServerConfig {
  /**
   * @param command The command to execute for stdio transport.
   * @param args The arguments to pass to the command.
   * @param env The environment variables to set for the command.
   * @param cwd The working directory for the command.
   * @param url The URL to use for SSE transport.
   * @param httpUrl The URL to use for streamable HTTP transport.
   * @param tcp The TCP address to use for websocket transport.
   * @param timeout The timeout for the server.
   * @param trust Whether to trust the server.
   * @param description A description of the server.
   */
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
    // Common
    readonly timeout?: number,
    readonly trust?: boolean,
    // Metadata
    readonly description?: string,
  ) {}
}

/**
 * Defines the configuration for the sandbox.
 */
export interface SandboxConfig {
  /**
   * The command to use for the sandbox.
   */
  command: 'docker' | 'podman' | 'sandbox-exec';
  /**
   * The image to use for the sandbox.
   */
  image: string;
}

/**
 * A handler for the flash fallback mechanism.
 * @param currentModel The current model being used.
 * @param fallbackModel The model to fall back to.
 * @returns A promise that resolves to a boolean indicating whether to accept the fallback.
 */
export type FlashFallbackHandler = (
  currentModel: string,
  fallbackModel: string,
) => Promise<boolean>;

/**
 * Defines the parameters for the Config class.
 */
export interface ConfigParameters {
  /**
   * The session ID.
   */
  sessionId: string;
  /**
   * The embedding model to use.
   */
  embeddingModel?: string;
  /**
   * The sandbox configuration.
   */
  sandbox?: SandboxConfig;
  /**
   * The target directory.
   */
  targetDir: string;
  /**
   * Whether to enable debug mode.
   */
  debugMode: boolean;
  /**
   * The question to ask.
   */
  question?: string;
  /**
   * Whether to use the full context.
   */
  fullContext?: boolean;
  /**
   * The core tools to use.
   */
  coreTools?: string[];
  /**
   * The tools to exclude.
   */
  excludeTools?: string[];
  /**
   * The tool discovery command.
   */
  toolDiscoveryCommand?: string;
  /**
   * The tool call command.
   */
  toolCallCommand?: string;
  /**
   * The MCP server command.
   */
  mcpServerCommand?: string;
  /**
   * The MCP servers.
   */
  mcpServers?: Record<string, MCPServerConfig>;
  /**
   * The user memory.
   */
  userMemory?: string;
  /**
   * The number of GEMINI.md files.
   */
  geminiMdFileCount?: number;
  /**
   * The approval mode.
   */
  approvalMode?: ApprovalMode;
  /**
   * Whether to show memory usage.
   */
  showMemoryUsage?: boolean;
  /**
   * The context file name.
   */
  contextFileName?: string | string[];
  /**
   * The accessibility settings.
   */
  accessibility?: AccessibilitySettings;
  /**
   * The telemetry settings.
   */
  telemetry?: TelemetrySettings;
  /**
   * Whether usage statistics are enabled.
   */
  usageStatisticsEnabled?: boolean;
  /**
   * The file filtering settings.
   */
  fileFiltering?: {
    respectGitIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
  };
  /**
   * Whether checkpointing is enabled.
   */
  checkpointing?: boolean;
  /**
   * The proxy to use.
   */
  proxy?: string;
  /**
   * The current working directory.
   */
  cwd: string;
  /**
   * The file discovery service.
   */
  fileDiscoveryService?: FileDiscoveryService;
  /**
   * The bug command settings.
   */
  bugCommand?: BugCommandSettings;
  /**
   * The model to use.
   */
  model: string;
  /**
   * The extension context file paths.
   */
  extensionContextFilePaths?: string[];
}

export class Config {
  private toolRegistry!: ToolRegistry;
  private readonly sessionId: string;
  private contentGeneratorConfig!: ContentGeneratorConfig;
  private readonly embeddingModel: string;
  private readonly sandbox: SandboxConfig | undefined;
  private readonly targetDir: string;
  private readonly debugMode: boolean;
  private readonly question: string | undefined;
  private readonly fullContext: boolean;
  private readonly coreTools: string[] | undefined;
  private readonly excludeTools: string[] | undefined;
  private readonly toolDiscoveryCommand: string | undefined;
  private readonly toolCallCommand: string | undefined;
  private readonly mcpServerCommand: string | undefined;
  private readonly mcpServers: Record<string, MCPServerConfig> | undefined;
  private userMemory: string;
  private geminiMdFileCount: number;
  private approvalMode: ApprovalMode;
  private readonly showMemoryUsage: boolean;
  private readonly accessibility: AccessibilitySettings;
  private readonly telemetrySettings: TelemetrySettings;
  private readonly usageStatisticsEnabled: boolean;
  private geminiClient!: GeminiClient;
  private readonly fileFiltering: {
    respectGitIgnore: boolean;
    enableRecursiveFileSearch: boolean;
  };
  private fileDiscoveryService: FileDiscoveryService | null = null;
  private gitService: GitService | undefined = undefined;
  private readonly checkpointing: boolean;
  private readonly proxy: string | undefined;
  private readonly cwd: string;
  private readonly bugCommand: BugCommandSettings | undefined;
  private readonly model: string;
  private readonly extensionContextFilePaths: string[];
  private modelSwitchedDuringSession: boolean = false;
  flashFallbackHandler?: FlashFallbackHandler;

  /**
   * @param params The configuration parameters.
   */
  constructor(params: ConfigParameters) {
    this.sessionId = params.sessionId;
    this.embeddingModel =
      params.embeddingModel ?? DEFAULT_GEMINI_EMBEDDING_MODEL;
    this.sandbox = params.sandbox;
    this.targetDir = path.resolve(params.targetDir);
    this.debugMode = params.debugMode;
    this.question = params.question;
    this.fullContext = params.fullContext ?? false;
    this.coreTools = params.coreTools;
    this.excludeTools = params.excludeTools;
    this.toolDiscoveryCommand = params.toolDiscoveryCommand;
    this.toolCallCommand = params.toolCallCommand;
    this.mcpServerCommand = params.mcpServerCommand;
    this.mcpServers = params.mcpServers;
    this.userMemory = params.userMemory ?? '';
    this.geminiMdFileCount = params.geminiMdFileCount ?? 0;
    this.approvalMode = params.approvalMode ?? ApprovalMode.DEFAULT;
    this.showMemoryUsage = params.showMemoryUsage ?? false;
    this.accessibility = params.accessibility ?? {};
    this.telemetrySettings = {
      enabled: params.telemetry?.enabled ?? false,
      target: params.telemetry?.target ?? DEFAULT_TELEMETRY_TARGET,
      otlpEndpoint: params.telemetry?.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT,
      logPrompts: params.telemetry?.logPrompts ?? true,
    };
    this.usageStatisticsEnabled = params.usageStatisticsEnabled ?? true;

    this.fileFiltering = {
      respectGitIgnore: params.fileFiltering?.respectGitIgnore ?? true,
      enableRecursiveFileSearch:
        params.fileFiltering?.enableRecursiveFileSearch ?? true,
    };
    this.checkpointing = params.checkpointing ?? false;
    this.proxy = params.proxy;
    this.cwd = params.cwd ?? process.cwd();
    this.fileDiscoveryService = params.fileDiscoveryService ?? null;
    this.bugCommand = params.bugCommand;
    this.model = params.model;
    this.extensionContextFilePaths = params.extensionContextFilePaths ?? [];

    if (params.contextFileName) {
      setGeminiMdFilename(params.contextFileName);
    }

    if (this.telemetrySettings.enabled) {
      initializeTelemetry(this);
    }

    if (this.getUsageStatisticsEnabled()) {
      ClearcutLogger.getInstance(this)?.logStartSessionEvent(
        new StartSessionEvent(this),
      );
    } else {
      console.log('Data collection is disabled.');
    }
  }

  /**
   * Refreshes the authentication.
   * @param authMethod The authentication method to use.
   */
  async refreshAuth(authMethod: AuthType) {
    // Always use the original default model when switching auth methods
    // This ensures users don't stay on Flash after switching between auth types
    // and allows API key users to get proper fallback behavior from getEffectiveModel
    const modelToUse = this.model; // Use the original default model

    // Temporarily clear contentGeneratorConfig to prevent getModel() from returning
    // the previous session's model (which might be Flash)
    this.contentGeneratorConfig = undefined!;

    const contentConfig = await createContentGeneratorConfig(
      modelToUse,
      authMethod,
      this,
    );

    const gc = new GeminiClient(this);
    this.geminiClient = gc;
    this.toolRegistry = await createToolRegistry(this);
    await gc.initialize(contentConfig);
    this.contentGeneratorConfig = contentConfig;

    // Reset the session flag since we're explicitly changing auth and using default model
    this.modelSwitchedDuringSession = false;

    // Note: In the future, we may want to reset any cached state when switching auth methods
  }

  /**
   * Gets the session ID.
   * @returns The session ID.
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Gets the content generator config.
   * @returns The content generator config.
   */
  getContentGeneratorConfig(): ContentGeneratorConfig {
    return this.contentGeneratorConfig;
  }

  /**
   * Gets the model.
   * @returns The model.
   */
  getModel(): string {
    return this.contentGeneratorConfig?.model || this.model;
  }

  /**
   * Sets the model.
   * @param newModel The new model to use.
   */
  setModel(newModel: string): void {
    if (this.contentGeneratorConfig) {
      this.contentGeneratorConfig.model = newModel;
      this.modelSwitchedDuringSession = true;
    }
  }

  /**
   * Checks if the model was switched during the session.
   * @returns True if the model was switched, false otherwise.
   */
  isModelSwitchedDuringSession(): boolean {
    return this.modelSwitchedDuringSession;
  }

  /**
   * Resets the model to the default.
   */
  resetModelToDefault(): void {
    if (this.contentGeneratorConfig) {
      this.contentGeneratorConfig.model = this.model; // Reset to the original default model
      this.modelSwitchedDuringSession = false;
    }
  }

  /**
   * Sets the flash fallback handler.
   * @param handler The flash fallback handler.
   */
  setFlashFallbackHandler(handler: FlashFallbackHandler): void {
    this.flashFallbackHandler = handler;
  }

  /**
   * Gets the embedding model.
   * @returns The embedding model.
   */
  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  /**
   * Gets the sandbox configuration.
   * @returns The sandbox configuration.
   */
  getSandbox(): SandboxConfig | undefined {
    return this.sandbox;
  }

  /**
   * Gets the target directory.
   * @returns The target directory.
   */
  getTargetDir(): string {
    return this.targetDir;
  }

  /**
   * Gets the project root directory.
   * @returns The project root directory.
   */
  getProjectRoot(): string {
    return this.targetDir;
  }

  /**
   * Gets the tool registry.
   * @returns The tool registry.
   */
  getToolRegistry(): Promise<ToolRegistry> {
    return Promise.resolve(this.toolRegistry);
  }

  /**
   * Gets whether debug mode is enabled.
   * @returns True if debug mode is enabled, false otherwise.
   */
  getDebugMode(): boolean {
    return this.debugMode;
  }
  /**
   * Gets the question.
   * @returns The question.
   */
  getQuestion(): string | undefined {
    return this.question;
  }

  /**
   * Gets whether full context is enabled.
   * @returns True if full context is enabled, false otherwise.
   */
  getFullContext(): boolean {
    return this.fullContext;
  }

  /**
   * Gets the core tools.
   * @returns The core tools.
   */
  getCoreTools(): string[] | undefined {
    return this.coreTools;
  }

  /**
   * Gets the excluded tools.
   * @returns The excluded tools.
   */
  getExcludeTools(): string[] | undefined {
    return this.excludeTools;
  }

  /**
   * Gets the tool discovery command.
   * @returns The tool discovery command.
   */
  getToolDiscoveryCommand(): string | undefined {
    return this.toolDiscoveryCommand;
  }

  /**
   * Gets the tool call command.
   * @returns The tool call command.
   */
  getToolCallCommand(): string | undefined {
    return this.toolCallCommand;
  }

  /**
   * Gets the MCP server command.
   * @returns The MCP server command.
   */
  getMcpServerCommand(): string | undefined {
    return this.mcpServerCommand;
  }

  /**
   * Gets the MCP servers.
   * @returns The MCP servers.
   */
  getMcpServers(): Record<string, MCPServerConfig> | undefined {
    return this.mcpServers;
  }

  /**
   * Gets the user memory.
   * @returns The user memory.
   */
  getUserMemory(): string {
    return this.userMemory;
  }

  /**
   * Sets the user memory.
   * @param newUserMemory The new user memory.
   */
  setUserMemory(newUserMemory: string): void {
    this.userMemory = newUserMemory;
  }

  /**
   * Gets the number of Gemini MD files.
   * @returns The number of Gemini MD files.
   */
  getGeminiMdFileCount(): number {
    return this.geminiMdFileCount;
  }

  /**
   * Sets the number of Gemini MD files.
   * @param count The number of Gemini MD files.
   */
  setGeminiMdFileCount(count: number): void {
    this.geminiMdFileCount = count;
  }

  /**
   * Gets the approval mode.
   * @returns The approval mode.
   */
  getApprovalMode(): ApprovalMode {
    return this.approvalMode;
  }

  /**
   * Sets the approval mode.
   * @param mode The approval mode.
   */
  setApprovalMode(mode: ApprovalMode): void {
    this.approvalMode = mode;
  }

  /**
   * Gets whether memory usage is shown.
   * @returns True if memory usage is shown, false otherwise.
   */
  getShowMemoryUsage(): boolean {
    return this.showMemoryUsage;
  }

  /**
   * Gets the accessibility settings.
   * @returns The accessibility settings.
   */
  getAccessibility(): AccessibilitySettings {
    return this.accessibility;
  }

  /**
   * Gets whether telemetry is enabled.
   * @returns True if telemetry is enabled, false otherwise.
   */
  getTelemetryEnabled(): boolean {
    return this.telemetrySettings.enabled ?? false;
  }

  /**
   * Gets whether telemetry prompt logging is enabled.
   * @returns True if telemetry prompt logging is enabled, false otherwise.
   */
  getTelemetryLogPromptsEnabled(): boolean {
    return this.telemetrySettings.logPrompts ?? true;
  }

  /**
   * Gets the telemetry OTLP endpoint.
   * @returns The telemetry OTLP endpoint.
   */
  getTelemetryOtlpEndpoint(): string {
    return this.telemetrySettings.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT;
  }

  /**
   * Gets the telemetry target.
   * @returns The telemetry target.
   */
  getTelemetryTarget(): TelemetryTarget {
    return this.telemetrySettings.target ?? DEFAULT_TELEMETRY_TARGET;
  }

  /**
   * Gets the Gemini client.
   * @returns The Gemini client.
   */
  getGeminiClient(): GeminiClient {
    return this.geminiClient;
  }

  /**
   * Gets the Gemini directory.
   * @returns The Gemini directory.
   */
  getGeminiDir(): string {
    return path.join(this.targetDir, GEMINI_DIR);
  }

  /**
   * Gets the project temporary directory.
   * @returns The project temporary directory.
   */
  getProjectTempDir(): string {
    return getProjectTempDir(this.getProjectRoot());
  }

  /**
   * Gets whether recursive file search is enabled.
   * @returns True if recursive file search is enabled, false otherwise.
   */
  getEnableRecursiveFileSearch(): boolean {
    return this.fileFiltering.enableRecursiveFileSearch;
  }

  /**
   * Gets whether file filtering respects gitignore.
   * @returns True if file filtering respects gitignore, false otherwise.
   */
  getFileFilteringRespectGitIgnore(): boolean {
    return this.fileFiltering.respectGitIgnore;
  }

  /**
   * Gets whether checkpointing is enabled.
   * @returns True if checkpointing is enabled, false otherwise.
   */
  getCheckpointingEnabled(): boolean {
    return this.checkpointing;
  }

  /**
   * Gets the proxy.
   * @returns The proxy.
   */
  getProxy(): string | undefined {
    return this.proxy;
  }

  /**
   * Gets the working directory.
   * @returns The working directory.
   */
  getWorkingDir(): string {
    return this.cwd;
  }

  /**
   * Gets the bug command settings.
   * @returns The bug command settings.
   */
  getBugCommand(): BugCommandSettings | undefined {
    return this.bugCommand;
  }

  /**
   * Gets the file discovery service.
   * @returns The file discovery service.
   */
  getFileService(): FileDiscoveryService {
    if (!this.fileDiscoveryService) {
      this.fileDiscoveryService = new FileDiscoveryService(this.targetDir);
    }
    return this.fileDiscoveryService;
  }

  /**
   * Gets whether usage statistics are enabled.
   * @returns True if usage statistics are enabled, false otherwise.
   */
  getUsageStatisticsEnabled(): boolean {
    return this.usageStatisticsEnabled;
  }

  /**
   * Gets the extension context file paths.
   * @returns The extension context file paths.
   */
  getExtensionContextFilePaths(): string[] {
    return this.extensionContextFilePaths;
  }

  /**
   * Gets the Git service.
   * @returns The Git service.
   */
  async getGitService(): Promise<GitService> {
    if (!this.gitService) {
      this.gitService = new GitService(this.targetDir);
      await this.gitService.initialize();
    }
    return this.gitService;
  }
}

/**
 * Creates a tool registry.
 * @param config The configuration.
 * @returns A promise that resolves to the tool registry.
 */
export function createToolRegistry(config: Config): Promise<ToolRegistry> {
  const registry = new ToolRegistry(config);
  const targetDir = config.getTargetDir();

  // helper to create & register core tools that are enabled
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registerCoreTool = (ToolClass: any, ...args: unknown[]) => {
    const className = ToolClass.name;
    const toolName = ToolClass.Name || className;
    const coreTools = config.getCoreTools();
    const excludeTools = config.getExcludeTools();

    let isEnabled = false;
    if (coreTools === undefined) {
      isEnabled = true;
    } else {
      isEnabled = coreTools.some(
        (tool) =>
          tool === className ||
          tool === toolName ||
          tool.startsWith(`${className}(`) ||
          tool.startsWith(`${toolName}(`),
      );
    }

    if (excludeTools?.includes(className) || excludeTools?.includes(toolName)) {
      isEnabled = false;
    }

    if (isEnabled) {
      registry.registerTool(new ToolClass(...args));
    }
  };

  registerCoreTool(LSTool, targetDir, config);
  registerCoreTool(ReadFileTool, targetDir, config);
  registerCoreTool(GrepTool, targetDir);
  registerCoreTool(GlobTool, targetDir, config);
  registerCoreTool(EditTool, config);
  registerCoreTool(WriteFileTool, config);
  registerCoreTool(WebFetchTool, config);
  registerCoreTool(ReadManyFilesTool, targetDir, config);
  registerCoreTool(ShellTool, config);
  registerCoreTool(MemoryTool);
  registerCoreTool(WebSearchTool, config);
  registerCoreTool(BackupTool, targetDir);
  return (async () => {
    await registry.discoverTools();
    return registry;
  })();
}

// Export model constants for use in CLI
export { DEFAULT_GEMINI_FLASH_MODEL };
