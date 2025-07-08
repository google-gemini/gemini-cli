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
} from '@google/gemini-cli-core';
import { Logger } from '@google/gemini-cli-core';
import { loadSandboxConfig } from '../config/sandboxConfig.js';
import { getPackageJson } from '../utils/package.js';
    .version(version) // Use the resolved version here
    .alias('v', 'version')
    .help()
    .alias('h', 'help')
    .strict().argv;

  return argv;
}

function parseArguments(version: string) {
  const argv = yargs(hideBin(process.argv))
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
    });

  const yargsWithVersion = yargsInstance.version(version); // Use the resolved version here

  const argv = yargsWithVersion
    .alias('v', 'version')
    .help()
    .alias('h', 'help')
    .strict().argv;

  return argv;
}

// This function is now a thin wrapper around the server's implementation.
// It's kept in the CLI for now as App.tsx directly calls it for memory refresh.
// TODO: Consider if App.tsx should get memory via a server call or if Config should refresh itself.
export async function loadHierarchicalGeminiMemory(
  currentWorkingDirectory: string,
  debugMode: boolean,
  fileService: FileDiscoveryService,
  extensionContextFilePaths: string[] = [],
): Promise<{ memoryContent: string; fileCount: number }> {
  if (debugMode) {
    new Logger('cli-config').debug(
      `CLI: Delegating hierarchical memory load to server for CWD: ${currentWorkingDirectory}`,
    );
  }
  // Directly call the server function.
  // The server function will use its own homedir() for the global path.
  return loadServerHierarchicalMemory(
    currentWorkingDirectory,
    debugMode,
    fileService,
    extensionContextFilePaths,
  );
}

export async function loadCliConfig(
  settings: Settings,
  extensions: Extension[],
  sessionId: string,
): Promise<Config> {
  loadEnvironment();

  const packageJson = await getPackageJson();
  const version = packageJson?.version || 'unknown';

  const argv = parseArguments(version);
  const debugMode = argv.debug || false;

  // Set the context filename in the server's memoryTool module BEFORE loading memory
  // TODO(b/343434939): This is a bit of a hack. The contextFileName should ideally be passed
  // directly to the Config constructor in core, and have core handle setGeminiMdFilename.
  // However, loadHierarchicalGeminiMemory is called *before* createServerConfig.
  if (settings.contextFileName) {
    setServerGeminiMdFilename(settings.contextFileName);
  } else {
    // Reset to default if not provided in settings.
    setServerGeminiMdFilename(getCurrentGeminiMdFilename());
  }

  const extensionContextFilePaths = extensions.flatMap((e) => e.contextFiles);

  const fileService = new FileDiscoveryService(process.cwd());
  // Call the (now wrapper) loadHierarchicalGeminiMemory which calls the server's version
  const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
    process.cwd(),
    debugMode,
    fileService,
    extensionContextFilePaths,
  );

  const mcpServers = mergeMcpServers(settings, extensions);
  const excludeTools = mergeExcludeTools(settings, extensions);

  const sandboxConfig = await loadSandboxConfig(settings, argv);

  return new Config({
    sessionId,
    embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
    sandbox: sandboxConfig,
    targetDir: process.cwd(),
    debugMode,
    question: argv.prompt || '',
    fullContext: argv.all_files || false,
    coreTools: settings.coreTools || undefined,
    excludeTools,
    toolDiscoveryCommand: settings.toolDiscoveryCommand,
    toolCallCommand: settings.toolCallCommand,
    mcpServerCommand: settings.mcpServerCommand,
    mcpServers,
    userMemory: memoryContent,
    geminiMdFileCount: fileCount,
    approvalMode: argv.yolo || false ? ApprovalMode.YOLO : ApprovalMode.DEFAULT,
    showMemoryUsage:
      argv.show_memory_usage || settings.showMemoryUsage || false,
    accessibility: settings.accessibility,
    telemetry: {
      enabled: argv.telemetry ?? settings.telemetry?.enabled,
      target: (argv.telemetryTarget ??
        settings.telemetry?.target) as TelemetryTarget,
      otlpEndpoint:
        argv.telemetryOtlpEndpoint ??
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
        settings.telemetry?.otlpEndpoint,
      logPrompts: argv.telemetryLogPrompts ?? settings.telemetry?.logPrompts,
    },
    usageStatisticsEnabled: settings.usageStatisticsEnabled ?? true,
    // Git-aware file filtering settings
    fileFiltering: {
      respectGitIgnore: settings.fileFiltering?.respectGitIgnore,
      enableRecursiveFileSearch:
        settings.fileFiltering?.enableRecursiveFileSearch,
    },
    checkpointing: argv.checkpointing || settings.checkpointing?.enabled,
    proxy:
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy,
    cwd: process.cwd(),
    fileDiscoveryService: fileService,
    bugCommand: settings.bugCommand,
    model: argv.model!,
    extensionContextFilePaths,
    filePermissions: settings.filePermissions, // Pass the loaded rules
  });
}

async function mergeMcpServers(settings: Settings, extensions: Extension[]) {
  const mcpServers = { ...(settings.mcpServers || {}) };
  for (const extension of extensions) {
    for (const [key, server] of Object.entries(extension.config.mcpServers || {})) {
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
