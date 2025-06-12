/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import process from 'node:process';
import {
  Config,
  loadEnvironment,
  loadServerHierarchicalMemory,
  setGeminiMdFilename as setServerGeminiMdFilename,
  getCurrentGeminiMdFilename,
  ApprovalMode,
  ContentGeneratorConfig,
} from '@gemini-cli/core';
import { Settings } from './settings.js';
import { getEffectiveModel } from '../utils/modelCheck.js';
import { ExtensionConfig } from './extension.js';

// Simple console logger for now - replace with actual logger if available
const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => console.debug('[DEBUG]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) => console.error('[ERROR]', ...args),
};

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro-preview-06-05';
export const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash-preview-05-20';
export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

interface CliArgs {
  model: string | undefined;
  sandbox: boolean | string | undefined;
  debug: boolean | undefined;
  prompt: string | undefined;
  all_files: boolean | undefined;
  show_memory_usage: boolean | undefined;
  yolo: boolean | undefined;
  telemetry: boolean | undefined;
  checkpoint: boolean | undefined;
}

async function parseArguments(): Promise<CliArgs> {
  const argv = await yargs(hideBin(process.argv))
    .option('model', {
      alias: 'm',
      type: 'string',
      description: `Model`,
      default: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    })
    .option('prompt', {
      alias: 'p',
      type: 'string',
      description: 'Prompt. Appended to input on stdin (if any).',
    })
    .option('sandbox', {
      alias: 's',
      type: 'boolean',
      description: 'Run in sandbox?',
    })
    .option('debug', {
      alias: 'd',
      type: 'boolean',
      description: 'Run in debug mode?',
      default: false,
    })
    .option('all_files', {
      alias: 'a',
      type: 'boolean',
      description: 'Include ALL files in context?',
      default: false,
    })
    .option('show_memory_usage', {
      type: 'boolean',
      description: 'Show memory usage in status bar',
      default: false,
    })
    .option('yolo', {
      alias: 'y',
      type: 'boolean',
      description:
        'Automatically accept all actions (aka YOLO mode, see https://www.youtube.com/watch?v=xvFZjo5PgG0 for more details)?',
      default: false,
    })
    .option('telemetry', {
      type: 'boolean',
      description: 'Enable telemetry?',
    })
    .option('checkpoint', {
      alias: 'c',
      type: 'boolean',
      description: 'Enables checkpointing of file edits',
      default: false,
    })
    .version(process.env.CLI_VERSION || '0.0.0') // This will enable the --version flag based on package.json
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
  extensionContextFilePaths: string[] = [],
): Promise<{ memoryContent: string; fileCount: number }> {
  if (debugMode) {
    logger.debug(
      `CLI: Delegating hierarchical memory load to server for CWD: ${currentWorkingDirectory}`,
    );
  }
  // Directly call the server function.
  // The server function will use its own homedir() for the global path.
  return loadServerHierarchicalMemory(
    currentWorkingDirectory,
    debugMode,
    extensionContextFilePaths,
  );
}

export async function loadCliConfig(
  settings: Settings,
  extensions: ExtensionConfig[],
  geminiIgnorePatterns: string[],
  sessionId: string,
): Promise<Config> {
  loadEnvironment();

  const argv = await parseArguments();
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

  const extensionContextFilePaths = extensions
    .map((e) => e.contextFileName)
    .filter((p): p is string => !!p);

  // Call the (now wrapper) loadHierarchicalGeminiMemory which calls the server's version
  const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
    process.cwd(),
    debugMode,
    extensionContextFilePaths,
  );

  const contentGeneratorConfig = await createContentGeneratorConfig(argv);

  const mcpServers = mergeMcpServers(settings, extensions);

  return new Config({
    sessionId,
    contentGeneratorConfig,
    embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
    sandbox: argv.sandbox ?? settings.sandbox,
    targetDir: process.cwd(),
    debugMode,
    question: argv.prompt || '',
    fullContext: argv.all_files || false,
    coreTools: settings.coreTools || undefined,
    excludeTools: settings.excludeTools || undefined,
    toolDiscoveryCommand: settings.toolDiscoveryCommand,
    toolCallCommand: settings.toolCallCommand,
    mcpServerCommand: settings.mcpServerCommand,
    mcpServers,
    userMemory: memoryContent,
    geminiMdFileCount: fileCount,
    approvalMode: argv.yolo || false ? ApprovalMode.YOLO : ApprovalMode.DEFAULT,
    showMemoryUsage:
      argv.show_memory_usage || settings.showMemoryUsage || false,
    geminiIgnorePatterns,
    accessibility: settings.accessibility,
    telemetry:
      argv.telemetry !== undefined
        ? argv.telemetry
        : (settings.telemetry ?? false),
    // Git-aware file filtering settings
    fileFilteringRespectGitIgnore: settings.fileFiltering?.respectGitIgnore,
    fileFilteringAllowBuildArtifacts:
      settings.fileFiltering?.allowBuildArtifacts,
    checkpoint: argv.checkpoint,
  });
}

function mergeMcpServers(settings: Settings, extensions: ExtensionConfig[]) {
  const mcpServers = settings.mcpServers || {};
  for (const extension of extensions) {
    Object.entries(extension.mcpServers || {}).forEach(([key, server]) => {
      if (mcpServers[key]) {
        logger.warn(
          `Skipping extension MCP config for server with key "${key}" as it already exists.`,
        );
        return;
      }
      mcpServers[key] = server;
    });
  }
  return mcpServers;
}

async function createContentGeneratorConfig(
  argv: CliArgs,
): Promise<ContentGeneratorConfig> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION;

  const hasGeminiApiKey = !!geminiApiKey;
  const hasGoogleApiKey = !!googleApiKey;
  const hasVertexProjectLocationConfig =
    !!googleCloudProject && !!googleCloudLocation;

  if (hasGeminiApiKey && hasGoogleApiKey) {
    logger.warn(
      'Both GEMINI_API_KEY and GOOGLE_API_KEY are set. Using GOOGLE_API_KEY.',
    );
  }
  if (!hasGeminiApiKey && !hasGoogleApiKey && !hasVertexProjectLocationConfig) {
    logger.error(
      'No valid API authentication configuration found. Please set ONE of the following combinations in your environment variables or .env file:\n' +
        '1. GEMINI_API_KEY (for Gemini API access).\n' +
        '2. GOOGLE_API_KEY (for Gemini API or Vertex AI Express Mode access).\n' +
        '3. GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION (for Vertex AI access).\n\n' +
        'For Gemini API keys, visit: https://ai.google.dev/gemini-api/docs/api-key\n' +
        'For Vertex AI authentication, visit: https://cloud.google.com/vertex-ai/docs/start/authentication\n' +
        'The GOOGLE_GENAI_USE_VERTEXAI environment variable can also be set to true/false to influence service selection when ambiguity exists.',
    );
    process.exit(1);
  }

  const config: ContentGeneratorConfig = {
    model: argv.model || DEFAULT_GEMINI_MODEL,
    apiKey: googleApiKey || geminiApiKey || '',
    vertexai: hasGeminiApiKey ? false : undefined,
    codeAssist: !!process.env.GEMINI_CODE_ASSIST,
  };

  if (config.apiKey) {
    config.model = await getEffectiveModel(config.apiKey, config.model);
  }

  return config;
}
