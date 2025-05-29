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
import { MemoryTool } from '../tools/memoryTool.js';
import { WebSearchTool } from '../tools/web-search.js';

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
  ) {}
}

export interface ConfigParameters {
  apiKey: string;
  model: string;
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
  userAgent: string;
  userMemory?: string;
  geminiMdFileCount?: number;
  alwaysSkipModificationConfirmation?: boolean;
  vertexai?: boolean;
}

export class Config {
  private toolRegistry: ToolRegistry;
  private readonly apiKey: string;
  private readonly model: string;
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
  private readonly userAgent: string;
  private userMemory: string;
  private geminiMdFileCount: number;
  private alwaysSkipModificationConfirmation: boolean;
  private readonly vertexai: boolean | undefined;

  constructor(params: ConfigParameters) {
    this.apiKey = params.apiKey;
    this.model = params.model;
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
    this.userAgent = params.userAgent;
    this.userMemory = params.userMemory ?? '';
    this.geminiMdFileCount = params.geminiMdFileCount ?? 0;
    this.alwaysSkipModificationConfirmation =
      params.alwaysSkipModificationConfirmation ?? false;
    this.vertexai = params.vertexai;

    this.toolRegistry = createToolRegistry(this);
  }

  getApiKey(): string {
    return this.apiKey;
  }

  getModel(): string {
    return this.model;
  }

  getSandbox(): boolean | string {
    return this.sandbox;
  }

  getTargetDir(): string {
    return this.targetDir;
  }

  getToolRegistry(): ToolRegistry {
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

  getUserAgent(): string {
    return this.userAgent;
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

  getAlwaysSkipModificationConfirmation(): boolean {
    return this.alwaysSkipModificationConfirmation;
  }

  setAlwaysSkipModificationConfirmation(skip: boolean): void {
    this.alwaysSkipModificationConfirmation = skip;
  }

  getVertexAI(): boolean | undefined {
    return this.vertexai;
  }
}

function findEnvFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  while (true) {
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || !parentDir) {
      // check ~/.env as fallback
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
  if (!envFilePath) {
    return;
  }
  dotenv.config({ path: envFilePath });
}

export function createServerConfig(params: ConfigParameters): Config {
  return new Config({
    ...params,
    targetDir: path.resolve(params.targetDir), // Ensure targetDir is resolved
    userAgent: params.userAgent ?? 'GeminiCLI/unknown', // Default user agent
  });
}

export function createToolRegistry(config: Config): ToolRegistry {
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

  registerCoreTool(LSTool, targetDir);
  registerCoreTool(ReadFileTool, targetDir);
  registerCoreTool(GrepTool, targetDir);
  registerCoreTool(GlobTool, targetDir);
  registerCoreTool(EditTool, config);
  registerCoreTool(WriteFileTool, config);
  registerCoreTool(WebFetchTool);
  registerCoreTool(ReadManyFilesTool, targetDir);
  registerCoreTool(ShellTool, config);
  registerCoreTool(MemoryTool);
  registerCoreTool(WebSearchTool, config);
  registry.discoverTools();
  return registry;
}
