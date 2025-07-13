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
  // loadServerHierarchicalMemory, // Unused
  // setGeminiMdFilename as setServerGeminiMdFilename, // Unused
  // getCurrentGeminiMdFilename, // Unused
  ApprovalMode,
  GEMINI_CONFIG_DIR as GEMINI_DIR,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  // FileDiscoveryService, // Unused
  TelemetryTarget,
  // Settings as CoreSettings, // Unused
  // Extension, // Should be imported locally
} from '@google/gemini-cli-core';
import { Logger } from '@google/gemini-cli-core';
import { type Extension } from './extension.js'; // Import local Extension
import { loadSandboxConfig } from '../config/sandboxConfig.js';
// import { LoadedSettings, SettingsError, SettingsFile } from './settings.js'; // Unused in this file
// import { getPackageJson } from '../utils/package.js'; // Unused in this file
import { type Settings as LocalSettings } from './settings.js'; // Correctly import local Settings

export interface CliArgs { // Export CliArgs
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
  sandbox?: boolean | string; // Added
  'sandbox-image'?: string; // Added
}

export async function parseArguments(version: string): Promise<CliArgs> { // Added export
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
    .option('sandbox', {
      // Type can be boolean or string, yargs might handle this if not specified, or needs specific config
      // For now, let yargs infer or leave as default string and handle conversion if necessary
      description: 'Enable or specify sandbox type (e.g., true, false, "docker", "podman").',
    })
    .option('sandbox-image', {
      type: 'string',
      description: 'Specify custom sandbox image URI.',
    })
    .version(version) // Use the resolved version here
    .alias('v', 'version')
    .help()
    .alias('h', 'help')
    .strict().argv;

  return argv as unknown as CliArgs; // Cast to unknown first
}

/* Unused function:
async function mergeMcpServers(settings: LocalSettings, extensions: Extension[]) {
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
*/

/* Unused function:
function mergeExcludeTools(
  settings: LocalSettings,
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
*/

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

// TODO: Implement this function properly, especially regarding how CLI args and settings are merged.
export async function loadCliConfig(
  cliArgs: CliArgs, // Add CliArgs parameter
  localSettings: LocalSettings, // Use the imported LocalSettings type
  extensions: Extension[],
  sessionId: string,
): Promise<Config> {
  // const logger = new Logger('cli-config'); // Not used directly here anymore for loadSandboxConfig

  const currentDir = process.cwd();
  // Construct SandboxCliArgs from cliArgs
  const sandboxCliArgs: import('../config/sandboxConfig.js').SandboxCliArgs = {
    sandbox: cliArgs.sandbox, // Assuming cliArgs has a sandbox property
    'sandbox-image': cliArgs['sandbox-image'], // Assuming cliArgs has a sandbox-image property
  };
  // Pass localSettings and the new sandboxCliArgs to loadSandboxConfig
  const sandboxConfigForLoad = await loadSandboxConfig(localSettings, sandboxCliArgs);

  const params: import('@google/gemini-cli-core').ConfigParameters = {
    sessionId: sessionId,
    targetDir: currentDir,
    cwd: currentDir,
    model: cliArgs.model || DEFAULT_GEMINI_MODEL, // TODO: overlay with localSettings.model if exists
    embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL, // TODO: overlay with localSettings.embeddingModel if exists
    debugMode: cliArgs.debug || false, // TODO: overlay with localSettings.debugMode if exists
    question: cliArgs.prompt?.join(' '), // Assuming prompt from CLI args is the question
    fullContext: cliArgs.all_files || false, // TODO: overlay
    approvalMode: cliArgs.yolo ? ApprovalMode.YOLO : ApprovalMode.DEFAULT, // No approvalMode in LocalSettings

    coreTools: localSettings.coreTools,
    excludeTools: localSettings.excludeTools, // TODO: merge with extension.config.excludeTools
    mcpServers: localSettings.mcpServers, // TODO: merge with extension.config.mcpServers

    telemetry: {
      enabled: cliArgs.telemetry ?? localSettings.telemetry?.enabled ?? true,
      target: (cliArgs.telemetryTarget as TelemetryTarget) || localSettings.telemetry?.target || TelemetryTarget.LOCAL,
      otlpEndpoint: cliArgs.telemetryOtlpEndpoint || localSettings.telemetry?.otlpEndpoint,
      logPrompts: cliArgs.telemetryLogPrompts ?? localSettings.telemetry?.logPrompts ?? false,
    },

    checkpointing: cliArgs.checkpointing ?? localSettings.checkpointing?.enabled ?? true,
    sandbox: sandboxConfigForLoad, // Use the loaded sandbox config

    // These might come from localSettings or have specific CLI args if added
    // contextFileName: localSettings.contextFileName,
    // accessibility: localSettings.accessibility,
    // usageStatisticsEnabled: localSettings.usageStatisticsEnabled,
    // fileFiltering: localSettings.fileFiltering,
    // proxy: localSettings.proxy,
    // bugCommand: localSettings.bugCommand,
    // extensionContextFilePaths: [], // TODO: Collect from extensions
    // filePermissions: localSettings.filePermissions,

    // Properties from localSettings that don't directly map or are handled by other params
    // theme: localSettings.theme, (UI specific)
    // selectedAuthType: localSettings.selectedAuthType, (Handled by refreshAuth later)
    // toolDiscoveryCommand, toolCallCommand, mcpServerCommand from localSettings if they exist
  };

  const coreConfig = new Config(params);

  // Apply extensions - some of this might be better done by merging into params before Config construction
  // For now, using setters if they exist, but the errors indicate they might not.
  const tempLoggerForExtensions = new Logger('extension-loader'); // Temp logger
  for (const extension of extensions) {
    tempLoggerForExtensions.debug(`Processing extension: ${extension.config.name}`); // Use extension
    // Properties like model, embeddingModel are not on ExtensionConfig.
    // If extensions need to provide these, ExtensionConfig interface and this logic would need an update.
    // For now, removing attempts to access non-existent properties.
    // if (extension.config.model) coreConfig.setModel(extension.config.model);

    // TODO: Investigate how to correctly merge excludeTools and mcpServers from extensions
    // These properties *do* exist on ExtensionConfig.
    // However, coreConfig does not have simple setters like addExcludeTools or addMcpServers.
    // This merging should ideally happen when constructing the `params` for `new Config()`.
    // if (extension.config.excludeTools) { /* merge with params.excludeTools */ }
    // if (extension.config.mcpServers) { /* merge with params.mcpServers */ }
  }

  return coreConfig;
}
