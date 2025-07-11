/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import dotenv from 'dotenv';
import {
  Config,
  loadServerHierarchicalMemory,
  setGeminiMdFilename as setServerGeminiMdFilename,
  getCurrentGeminiMdFilename,
  ApprovalMode,
  GEMINI_CONFIG_DIR as GEMINI_DIR,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  FileDiscoveryService,
  TelemetryTarget,
  Settings,
  Extension,
} from '@google/gemini-cli-core';
import { Logger } from '@google/gemini-cli-core';
import { loadSandboxConfig } from '../config/sandboxConfig.js';
import { getPackageJson } from '../utils/package.js';

interface CliArgs {
  prompt?: string[];
  debug: boolean;
  all_files: boolean;
  model: string;
  yolo: boolean;
  show_memory_usage: boolean;
  telemetry?: boolean;
  telemetryTarget?: string;
  telemetryOtlpEndpoint?: string;
  telemetryLogPrompts?: boolean;
  checkpointing?: boolean;
  version: boolean;
  help: boolean;
}

async function parseArguments(version: string): Promise<CliArgs> {
  const argv = await yargs(hideBin(process.argv))
    .command(
      '$0 [prompt...]',
      'Ask Gemini a question or ask it to perform a task.',
      (yargs) => {
        yargs.positional('prompt', {
          describe: 'The prompt to send to Gemini.',
          type: 'string',
        });
      },
    )
    .option('debug', {
      type: 'boolean',
      default: false,
      description: 'Enable debug logging.',
    })
    .option('all_files', {
      type: 'boolean',
      default: false,
      description: 'Include all files in the current directory as context.',
    })
    .option('model', {
      type: 'string',
      default: DEFAULT_GEMINI_MODEL,
      description: 'The model to use for generating content.',
    })
    .option('yolo', {
      type: 'boolean',
      default: false,
      description: 'Skip approval for tool calls.',
    })
    .option('show_memory_usage', {
      type: 'boolean',
      default: false,
      description: 'Show memory usage statistics.',
    })
    .option('telemetry', {
      type: 'boolean',
      description: 'Enable or disable telemetry.',
    })
    .option('telemetryTarget', {
      type: 'string',
      description: 'Telemetry target (e.g., "gcp", "console").',
    })
    .option('telemetryOtlpEndpoint', {
      type: 'string',
      description: 'OTLP endpoint for telemetry.',
    })
    .option('telemetryLogPrompts', {
      type: 'boolean',
      description: 'Log prompts to telemetry.',
    })
    .option('checkpointing', {
      type: 'boolean',
      description: 'Enable or disable checkpointing.',
    })
    .version(version) // Use the resolved version here
    .alias('v', 'version')
    .help()
    .alias('h', 'help')
    .strict().argv;

  return argv as CliArgs;
}

async function mergeMcpServers(settings: Settings, extensions: Extension[]) {
  const mcpServers = { ...(settings.mcpServers || {}) };
  for (const extension of extensions) {
    for (const [key, server] of Object.entries(
      extension.config.mcpServers || {},
    )) {
      if (mcpServers[key]) {
        await new Logger('cli-config').warn(
          `Skipping extension MCP config for server with key "${key}" as it already exists.`,
        );
        continue;
      }
      mcpServers[key] = server;
    }
  }
  return mcpServers;
}

function mergeExcludeTools(
  settings: Settings,
  extensions: Extension[],
): string[] {
  const allExcludeTools = new Set(settings.excludeTools || []);
  for (const extension of extensions) {
    for (const tool of extension.config.excludeTools || []) {
      allExcludeTools.add(tool);
    }
  }
  return [...allExcludeTools];
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
