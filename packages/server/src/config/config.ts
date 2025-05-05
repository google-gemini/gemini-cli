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
import { ShellTool } from '../tools/shell.js';
import { WriteFileTool } from '../tools/write-file.js';
import { WebFetchTool } from '../tools/web-fetch.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { BaseTool, ToolResult } from '../tools/tools.js';

export class Config {
  private toolRegistry: ToolRegistry;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly sandbox: boolean | string,
    private readonly targetDir: string,
    private readonly debugMode: boolean,
    private readonly question: string | undefined, // Keep undefined possibility
    private readonly fullContext: boolean = false, // Default value here
  ) {
    // toolRegistry still needs initialization based on the instance
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
  sandbox: boolean | string,
  targetDir: string,
  debugMode: boolean,
  question: string,
  fullContext?: boolean,
): Config {
  return new Config(
    apiKey,
    model,
    sandbox,
    path.resolve(targetDir),
    debugMode,
    question,
    fullContext,
  );
}

function createToolRegistry(config: Config): ToolRegistry {
  const registry = new ToolRegistry();
  const targetDir = config.getTargetDir();

  const tools: Array<BaseTool<unknown, ToolResult>> = [
    new LSTool(targetDir),
    new ReadFileTool(targetDir),
    new GrepTool(targetDir),
    new GlobTool(targetDir),
    new EditTool(targetDir),
    new WriteFileTool(targetDir),
    new WebFetchTool(), // Note: WebFetchTool takes no arguments
    new ReadManyFilesTool(targetDir),
  ];

  // if TERMINAL_TOOL is set, revert to deprecated TerminalTool
  if (process.env.TERMINAL_TOOL) {
    tools.push(new TerminalTool(targetDir, config));
  } else {
    tools.push(new ShellTool(config));
  }

  for (const tool of tools) {
    registry.registerTool(tool);
  }
  return registry;
}
