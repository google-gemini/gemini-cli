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
import { MemoryTool, setGeminiMdFilename } from '../tools/memoryTool.js';
import { WebSearchTool } from '../tools/web-search.js';
import { GeminiClient } from '../core/client.js';
import { GEMINI_CONFIG_DIR as GEMINI_DIR } from '../tools/memoryTool.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { GitService } from '../services/gitService.js';
import {
  initializeTelemetry,
  DEFAULT_TELEMETRY_TARGET,
  DEFAULT_OTLP_ENDPOINT,
  TelemetryTarget,
} from '../telemetry/index.js';
import { DEFAULT_GEMINI_EMBEDDING_MODEL } from './models.js';

export enum ApprovalMode {
  DEFAULT = 'default',
  AUTO_EDIT = 'autoEdit',
  YOLO = 'yolo',
}

export interface AccessibilitySettings {
  disableLoadingPhrases?: boolean;
}

export interface BugCommandSettings {
  urlTemplate: string;
}

export interface TelemetrySettings {
  enabled?: boolean;
  target?: TelemetryTarget;
  otlpEndpoint?: string;
  logPrompts?: boolean;
}

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
    // For websocket transport
    readonly tcp?: string,
    // Common
    readonly timeout?: number,
    readonly trust?: boolean,
    // Metadata
    readonly description?: string,
  ) {}
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
  fullContext?: boolean;
  coreTools?: string[];
  excludeTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  userMemory?: string;
  geminiMdFileCount?: number;
  approvalMode?: ApprovalMode;
  showMemoryUsage?: boolean;
  contextFileName?: string | string[];
  accessibility?: AccessibilitySettings;
  telemetry?: TelemetrySettings;
  fileFilteringRespectGitIgnore?: boolean;
  checkpoint?: boolean;
  proxy?: string;
  cwd: string;
  fileDiscoveryService?: FileDiscoveryService;
  bugCommand?: BugCommandSettings;
  model: string;
}

export class Config {
  private toolRegistry: Promise<ToolRegistry>;
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
  private geminiClient!: GeminiClient;
  private readonly fileFilteringRespectGitIgnore: boolean;
  private fileDiscoveryService: FileDiscoveryService | null = null;
  private gitService: GitService | undefined = undefined;
  private readonly checkpoint: boolean;
  private readonly proxy: string | undefined;
  private readonly cwd: string;
  private readonly bugCommand: BugCommandSettings | undefined;
  private readonly model: string;

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

    this.fileFilteringRespectGitIgnore =
      params.fileFilteringRespectGitIgnore ?? true;
    this.checkpoint = params.checkpoint ?? false;
    this.proxy = params.proxy;
    this.cwd = params.cwd ?? process.cwd();
    this.fileDiscoveryService = params.fileDiscoveryService ?? null;
    this.bugCommand = params.bugCommand;
    this.model = params.model;

    if (params.contextFileName) {
      setGeminiMdFilename(params.contextFileName);
    }

    this.toolRegistry = createToolRegistry(this);

    if (this.telemetrySettings.enabled) {
      initializeTelemetry(this);
    }
  }

  async refreshAuth(authMethod: AuthType) {
    const contentConfig = await createContentGeneratorConfig(
      this.getModel(),
      authMethod,
    );

    const gc = new GeminiClient(this);
    await gc.initialize(contentConfig);

    this.contentGeneratorConfig = contentConfig;
    this.geminiClient = gc;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getContentGeneratorConfig(): ContentGeneratorConfig {
    return this.contentGeneratorConfig;
  }

  getModel(): string {
    return this.contentGeneratorConfig?.model || this.model;
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  getSandbox(): SandboxConfig | undefined {
    return this.sandbox;
  }

  getTargetDir(): string {
    return this.targetDir;
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  async getToolRegistry(): Promise<ToolRegistry> {
    return this.toolRegistry;
  }

  getDebugMode(): boolean {
    return this.debugMode;
  }
  getQuestion(): string | undefined {
    return this.question;
  }

  getFullContext(): boolean {
    return this.fullContext;
  }

  getCoreTools(): string[] | undefined {
    return this.coreTools;
  }

  getExcludeTools(): string[] | undefined {
    return this.excludeTools;
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

  getMcpServers(): Record<string, MCPServerConfig> | undefined {
    return this.mcpServers;
  }

  getUserMemory(): string {
    return this.userMemory;
  }

  setUserMemory(newUserMemory: string): void {
    this.userMemory = newUserMemory;
  }

  getGeminiMdFileCount(): number {
    return this.geminiMdFileCount;
  }

  setGeminiMdFileCount(count: number): void {
    this.geminiMdFileCount = count;
  }

  getApprovalMode(): ApprovalMode {
    return this.approvalMode;
  }

  setApprovalMode(mode: ApprovalMode): void {
    this.approvalMode = mode;
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

  getTelemetryTarget(): TelemetryTarget {
    return this.telemetrySettings.target ?? DEFAULT_TELEMETRY_TARGET;
  }

  getGeminiClient(): GeminiClient {
    return this.geminiClient;
  }

  getGeminiDir(): string {
    return path.join(this.targetDir, GEMINI_DIR);
  }

  getFileFilteringRespectGitIgnore(): boolean {
    return this.fileFilteringRespectGitIgnore;
  }

  getCheckpointEnabled(): boolean {
    return this.checkpoint;
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

  async getGitService(): Promise<GitService> {
    if (!this.gitService) {
      this.gitService = new GitService(this.targetDir);
      await this.gitService.initialize();
    }
    return this.gitService;
  }
}

export function createToolRegistry(config: Config): Promise<ToolRegistry> {
  const registry = new ToolRegistry(config);
  const targetDir = config.getTargetDir();
  const tools = config.getCoreTools()
    ? new Set(config.getCoreTools())
    : undefined;
  const excludeTools = config.getExcludeTools()
    ? new Set(config.getExcludeTools())
    : undefined;

  // helper to create & register core tools that are enabled
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registerCoreTool = (ToolClass: any, ...args: unknown[]) => {
    // check both the tool name (.Name) and the class name (.name)
    if (
      // coreTools contain tool name
      (!tools || tools.has(ToolClass.Name) || tools.has(ToolClass.name)) &&
      // excludeTools don't contain tool name
      (!excludeTools ||
        (!excludeTools.has(ToolClass.Name) &&
          !excludeTools.has(ToolClass.name)))
    ) {
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
  return (async () => {
    await registry.discoverTools();
    return registry;
  })();
}
