/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { ToolRegistry } from '../tools/tool-registry.js';
import { LSTool } from '../tools/ls.js';
import { ReadFileTool } from '../tools/read-file.js';
import { GrepTool } from '../tools/grep.js';
import { GlobTool } from '../tools/glob.js';
import { EditTool } from '../tools/edit.js';
import { TerminalTool } from '../tools/terminal.js';
import { WriteFileTool } from '../tools/write-file.js';
import { WebFetchTool } from '../tools/web-fetch.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';

const DEFAULT_PASSTHROUGH_COMMANDS = ['ls', 'git', 'npm'];

export class Config {
  private apiKey: string;
  private model: string;
  private targetDir: string;
  private toolRegistry: ToolRegistry;
  private debugMode: boolean;
  private question: string | undefined;
  private passthroughCommands: string[];

  constructor(
    apiKey: string,
    model: string,
    targetDir: string,
    debugMode: boolean,
    question: string,
    passthroughCommands?: string[],
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.targetDir = targetDir;
    this.debugMode = debugMode;
    this.question = question;
    this.passthroughCommands =
      passthroughCommands || DEFAULT_PASSTHROUGH_COMMANDS;

    this.toolRegistry = createToolRegistry(this);
  }

  getApiKey(): string {
    return this.apiKey;
  }

  getModel(): string {
    return this.model;
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

  getPassthroughCommands(): string[] {
    return this.passthroughCommands;
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

export function createServerConfig(
  apiKey: string,
  model: string,
  targetDir: string,
  debugMode: boolean,
  question: string,
  passthroughCommands?: string[],
): Config {
  return new Config(
    apiKey,
    model,
    path.resolve(targetDir),
    debugMode,
    question,
    passthroughCommands,
  );
}

function createToolRegistry(config: Config): ToolRegistry {
  const registry = new ToolRegistry();
  const targetDir = config.getTargetDir();

  const tools = [
    new LSTool(targetDir),
    new ReadFileTool(targetDir),
    new GrepTool(targetDir),
    new GlobTool(targetDir),
    new EditTool(targetDir),
    new TerminalTool(targetDir, config),
    new WriteFileTool(targetDir),
    new WebFetchTool(), // Note: WebFetchTool takes no arguments
    new ReadManyFilesTool(targetDir),
  ];
  for (const tool of tools) {
    registry.registerTool(tool);
  }
  return registry;
}
