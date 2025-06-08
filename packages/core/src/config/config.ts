/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import * as os from 'node:os';
import { ContentGeneratorConfig } from '../core/contentGenerator.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { CodeParserTool } from '../tools/code_parser.js'; // Added CodeParserTool
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
import { initializeTelemetry } from '../telemetry/index.js';

export enum ApprovalMode {
  DEFAULT = 'default',
  AUTO_EDIT = 'autoEdit',
  YOLO = 'yolo',
}

export interface AccessibilitySettings {
  disableLoadingPhrases?: boolean;
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
    // Common
    readonly timeout?: number,
    readonly trust?: boolean,
    // Metadata
    readonly description?: string,
  ) {}
}

export interface ConfigParameters {
  contentGeneratorConfig: ContentGeneratorConfig;
  embeddingModel: string;
  sandbox: boolean | string;
  targetDir: string;
  debugMode: boolean;
  question?: string;
  fullContext?: boolean;
  coreTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  userMemory?: string;
  geminiMdFileCount?: number;
  approvalMode?: ApprovalMode;
  showMemoryUsage?: boolean;
  contextFileName?: string;
  geminiIgnorePatterns?: string[];
  accessibility?: AccessibilitySettings;
  telemetry?: boolean;
  telemetryLogUserPromptsEnabled?: boolean;
  fileFilteringRespectGitIgnore?: boolean;
  fileFilteringAllowBuildArtifacts?: boolean;
  enableModifyWithExternalEditors?: boolean;
}

export class Config {
  private toolRegistry: Promise<ToolRegistry>;
  private readonly contentGeneratorConfig: ContentGeneratorConfig;
  private readonly embeddingModel: string;
  private readonly sandbox: boolean | string;
  private readonly targetDir: string;
  private readonly debugMode: boolean;
  private readonly question: string | undefined;
  private readonly fullContext: boolean;
  private readonly coreTools: string[] | undefined;
  private readonly toolDiscoveryCommand: string | undefined;
  private readonly toolCallCommand: string | undefined;
  private readonly mcpServerCommand: string | undefined;
  private readonly mcpServers: Record<string, MCPServerConfig> | undefined;
  private userMemory: string;
  private geminiMdFileCount: number;
  private approvalMode: ApprovalMode;
  private readonly showMemoryUsage: boolean;
  private readonly accessibility: AccessibilitySettings;
  private readonly telemetry: boolean;
  private readonly telemetryLogUserPromptsEnabled: boolean;
  private readonly telemetryOtlpEndpoint: string;
  private readonly geminiClient: GeminiClient;
  private readonly geminiIgnorePatterns: string[] = [];
  private readonly fileFilteringRespectGitIgnore: boolean;
  private readonly fileFilteringAllowBuildArtifacts: boolean;
  private readonly enableModifyWithExternalEditors: boolean;
  private fileDiscoveryService: FileDiscoveryService | null = null;

  constructor(params: ConfigParameters) {
    this.contentGeneratorConfig = params.contentGeneratorConfig;
    this.embeddingModel = params.embeddingModel;
    this.sandbox = params.sandbox;
    this.targetDir = path.resolve(params.targetDir);
    this.debugMode = params.debugMode;
    this.question = params.question;
    this.fullContext = params.fullContext ?? false;
    this.coreTools = params.coreTools;
    this.toolDiscoveryCommand = params.toolDiscoveryCommand;
    this.toolCallCommand = params.toolCallCommand;
    this.mcpServerCommand = params.mcpServerCommand;
    this.mcpServers = params.mcpServers;
    this.userMemory = params.userMemory ?? '';
    this.geminiMdFileCount = params.geminiMdFileCount ?? 0;
    this.approvalMode = params.approvalMode ?? ApprovalMode.DEFAULT;
    this.showMemoryUsage = params.showMemoryUsage ?? false;
    this.accessibility = params.accessibility ?? {};
    this.telemetry = params.telemetry ?? false;
    this.telemetryLogUserPromptsEnabled =
      params.telemetryLogUserPromptsEnabled ?? true;
    this.telemetryOtlpEndpoint =
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317';
    this.fileFilteringRespectGitIgnore =
      params.fileFilteringRespectGitIgnore ?? true;
    this.fileFilteringAllowBuildArtifacts =
      params.fileFilteringAllowBuildArtifacts ?? false;
    this.enableModifyWithExternalEditors =
      params.enableModifyWithExternalEditors ?? false;

    if (params.contextFileName) {
      setGeminiMdFilename(params.contextFileName);
    }
    if (params.geminiIgnorePatterns) {
      this.geminiIgnorePatterns = params.geminiIgnorePatterns;
    }

    this.toolRegistry = createToolRegistry(this);
    this.geminiClient = new GeminiClient(this);

    if (this.telemetry) {
      initializeTelemetry(this);
    }
  }

  getContentGeneratorConfig(): ContentGeneratorConfig {
    return this.contentGeneratorConfig;
  }

  getModel(): string {
    return this.contentGeneratorConfig.model;
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  getSandbox(): boolean | string {
    return this.sandbox;
  }

  getTargetDir(): string {
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
    return this.telemetry;
  }

  getTelemetryLogUserPromptsEnabled(): boolean {
    return this.telemetryLogUserPromptsEnabled;
  }

  getTelemetryOtlpEndpoint(): string {
    return this.telemetryOtlpEndpoint;
  }

  getGeminiClient(): GeminiClient {
    return this.geminiClient;
  }

  getGeminiIgnorePatterns(): string[] {
    return this.geminiIgnorePatterns;
  }

  getFileFilteringRespectGitIgnore(): boolean {
    return this.fileFilteringRespectGitIgnore;
  }

  getFileFilteringAllowBuildArtifacts(): boolean {
    return this.fileFilteringAllowBuildArtifacts;
  }

  getEnableModifyWithExternalEditors(): boolean {
    return this.enableModifyWithExternalEditors;
  }

  async getFileService(): Promise<FileDiscoveryService> {
    if (!this.fileDiscoveryService) {
      this.fileDiscoveryService = new FileDiscoveryService(this.targetDir);
      await this.fileDiscoveryService.initialize({
        respectGitIgnore: this.fileFilteringRespectGitIgnore,
        includeBuildArtifacts: this.fileFilteringAllowBuildArtifacts,
      });
    }
    return this.fileDiscoveryService;
  }
}

function findEnvFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  while (true) {
    // prefer gemini-specific .env under GEMINI_DIR
    const geminiEnvPath = path.join(currentDir, GEMINI_DIR, '.env');
    if (fs.existsSync(geminiEnvPath)) {
      return geminiEnvPath;
    }
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || !parentDir) {
      // check .env under home as fallback, again preferring gemini-specific .env
      const homeGeminiEnvPath = path.join(os.homedir(), GEMINI_DIR, '.env');
      if (fs.existsSync(homeGeminiEnvPath)) {
        return homeGeminiEnvPath;
      }
      const homeEnvPath = path.join(os.homedir(), '.env');
      if (fs.existsSync(homeEnvPath)) {
        return homeEnvPath;
      }
      return null;
    }
    currentDir = parentDir;
  }
}

export function loadEnvironment(): void {
  const envFilePath = findEnvFile(process.cwd());
  if (envFilePath) {
    dotenv.config({ path: envFilePath });
  }
}

export function createToolRegistry(config: Config): Promise<ToolRegistry> {
  const registry = new ToolRegistry(config);
  const targetDir = config.getTargetDir();
  const tools = config.getCoreTools()
    ? new Set(config.getCoreTools())
    : undefined;

  // helper to create & register core tools that are enabled
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registerCoreTool = (ToolClass: any, ...args: unknown[]) => {
    // check both the tool name (.Name) and the class name (.name)
    if (!tools || tools.has(ToolClass.Name) || tools.has(ToolClass.name)) {
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
  registerCoreTool(CodeParserTool, targetDir, config); // Added CodeParserTool
  return (async () => {
    await registry.discoverTools();
    return registry;
  })();
}
