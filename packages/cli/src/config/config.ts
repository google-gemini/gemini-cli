/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// --- Foundational Imports ---
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import process from 'node:process';
import * as dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
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

// --- Local Module Imports ---
import { Settings } from './settings.js';
import { Extension } from './extension.js';
import { getCliVersion } from '../utils/version.js';
import { loadSandboxConfig } from './sandboxConfig.js';

// Improvement 1: An enchanted logger, imbued with the colors of the ether.
const logger = {
  debug: (...args: unknown[]) => console.debug(' [36m[DEBUG] [0m', ...args),
  warn: (...args: unknown[]) => console.warn(' [33m[WARN] [0m', ...args),
  error: (...args: unknown[]) => console.error(' [31m[ERROR] [0m', ...args),
};

// Improvement 2: A clear interface for the runes cast from the command line.
interface CliArgs {
  model: string | undefined;
  sandbox: boolean | string | undefined;
  'sandbox-image': string | undefined;
  
  prompt: string | undefined;
  all_files: boolean | undefined;
  show_memory_usage: boolean | undefined;
  yolo: boolean | undefined;
  telemetry: boolean | undefined;
  checkpointing: boolean | undefined;
  telemetryTarget: string | undefined;
  telemetryOtlpEndpoint: string | undefined;
  telemetryLogPrompts: boolean | undefined;
  targetDir: string | undefined;
}

/**
 * Improvement 3: A spell to parse the arguments whispered to the CLI at invocation.
 * It uses the ancient power of 'yargs' to interpret these commands.
 */
async function parseArguments(): Promise<CliArgs> {
  // `hideBin` is a helper to remove the initial 'node' and script path from argv.
  const argv = await yargs(hideBin(process.argv))
    // --- Core Behavior Options ---
    .option('model', {
      alias: 'm',
      type: 'string',
      description: 'Summons a specific model by name.',
      default: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
    })
    .option('prompt', {
      alias: 'p',
      type: 'string',
      description:
        'A direct prompt, appended to any input from the stdin stream.',
    })
    .option('all_files', {
      alias: 'a',
      type: 'boolean',
      description: 'A powerful ward to include ALL files in the context.',
      default: false,
    })
    .option('targetDir', {
      type: 'string',
      description: 'Sets the sacred ground for all file operations.',
    })

    // --- Execution Environment Options ---
    .option('sandbox', {
      alias: 's',
      type: 'boolean',
      description: 'Confines the execution to a protective sandbox.',
    })
    .option('sandbox-image', {
      type: 'string',
      description: 'Specifies the ethereal image for the sandbox.',
    })
    .option('yolo', {
      alias: 'y',
      type: 'boolean',
      description:
        'The incantation for "You Only Live Once" mode. Accepts all actions automatically.',
      default: false,
    })

    // --- Telemetry & Debugging Options ---
    .option('debug', {
      alias: 'd',
      type: 'boolean',
      description: 'Activates debug mode, revealing hidden knowledge.',
      default: false,
    })
    .option('telemetry', {
      type: 'boolean',
      description: 'Enables the flow of telemetry data.',
    })
    .option('telemetry-target', {
      type: 'string',
      choices: ['local', 'gcp'],
      description: 'Directs telemetry to a specific realm (local or gcp).',
    })
    .option('telemetry-otlp-endpoint', {
      type: 'string',
      description: 'Sets the OTLP endpoint for telemetry, a direct conduit.',
    })
    .option('telemetry-log-prompts', {
      type: 'boolean',
      description:
        'A ward to control the logging of user prompts for telemetry.',
    })

    // --- Feature Flag Options ---
    .option('checkpointing', {
      alias: 'c',
      type: 'boolean',
      description: 'Enables the sacred art of checkpointing for file edits.',
      default: false,
    })
    .option('show_memory_usage', {
      type: 'boolean',
      description:
        'Reveals memory usage in the status bar, a glimpse into the ether.',
      default: false,
    })

    // --- Standard Options ---
    .version(await getCliVersion()) // The --version rune
    .alias('v', 'version')
    .help() // The --help rune
    .alias('h', 'help')
    .strict().argv; // Enforces strict parsing of the runes.

  return argv;
}

/**
 * Improvement 4: A spell to find the sacred .env scroll, searching from the current directory upwards.
 * This incantation respects the sanctity of the `.gemini` directory first.
 */
function findEnvFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  const homeDir = os.homedir();

  // Search from current directory up to the root.
  while (true) {
    // Prefer the .env scroll within the sacred .gemini directory.
    const geminiEnvPath = path.join(currentDir, GEMINI_DIR, '.env');
    if (fs.existsSync(geminiEnvPath)) return geminiEnvPath;

    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) return envPath;

    const parentDir = path.dirname(currentDir);
    // If we have reached the root, stop the search.
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  // As a final ward, check the user's home directory.
  const homeGeminiEnvPath = path.join(homeDir, GEMINI_DIR, '.env');
  if (fs.existsSync(homeGeminiEnvPath)) return homeGeminiEnvPath;

  const homeEnvPath = path.join(homeDir, '.env');
  if (fs.existsSync(homeEnvPath)) return homeEnvPath;

  return null;
}

/**
 * Improvement 5: A spell to load the environment variables from the found .env scroll.
 */
export function loadEnvironment(): void {
  const envFilePath = findEnvFile(process.cwd());
  if (envFilePath) {
    // The `quiet` ward prevents dotenv from complaining if the scroll is empty.
    dotenv.config({ path: envFilePath, quiet: true });
  }
}

/**
 * Improvement 6: A spell to merge MCP server configurations from settings and extensions.
 * The base settings hold dominion; extension configurations do not overwrite existing keys.
 */
function mergeMcpServers(settings: Settings, extensions: Extension[]) {
  const mcpServers = { ...(settings.mcpServers || {}) };
  for (const extension of extensions) {
    Object.entries(extension.config.mcpServers || {}).forEach(
      ([key, server]) => {
        if (mcpServers[key]) {
          logger.warn(
            `An extension tried to register an MCP server for key "${key}", but it is already claimed. The extension's configuration will be ignored.`,
          );
          return;
        }
        mcpServers[key] = server;
      },
    );
  }
  return mcpServers;
}

/**
 * Improvement 7: This function is a conduit, delegating the complex task of memory weaving to the core library.
 * It remains here as a known entry point for other parts of the CLI.
 */
export async function loadHierarchicalGeminiMemory(
  currentWorkingDirectory: string,
  debugMode: boolean,
  fileService: FileDiscoveryService,
  extensionContextFilePaths: string[] = [],
): Promise<{ memoryContent: string; fileCount: number }> {
  if (debugMode) {
    logger.debug(
      `Delegating hierarchical memory load to core for CWD: ${currentWorkingDirectory}`,
    );
  }
  // Directly invoke the core library's spell.
  return loadServerHierarchicalMemory(
    currentWorkingDirectory,
    debugMode,
    fileService,
    extensionContextFilePaths,
  );
}

/**
 * Improvement 8: The grand orchestration spell that forges the final CLI configuration.
 * It weaves together settings, arguments, extensions, and environment variables.
 */
export async function loadCliConfig(
  settings: Settings,
  extensions: Extension[],
  sessionId: string,
): Promise<Config> {
  // --- 1. Summon the Environment ---
  loadEnvironment();

  // --- 2. Parse Arcane Arguments ---
  const argv = await parseArguments();
  const debugMode = argv.debug || settings.debug || false;

  // --- 3. Set the Context Scroll Name ---
  // This must be done before memory is loaded.
  // TODO(b/343434939): This is a temporary enchantment. This logic should be moved to the core library.
  setServerGeminiMdFilename(
    settings.contextFileName || getCurrentGeminiMdFilename(),
  );

  // --- 4. Weave the Hierarchical Memory ---
  const extensionContextFilePaths = extensions.flatMap((e) => e.contextFiles);
  const fileService = new FileDiscoveryService(process.cwd());
  const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
    process.cwd(),
    debugMode,
    fileService,
    extensionContextFilePaths,
  );

  // --- 5. Conjure Supporting Configurations ---
  const mcpServers = mergeMcpServers(settings, extensions);
  const sandboxConfig = await loadSandboxConfig(settings, argv);

  // --- 6. Forge the Final Configuration ---
  // Here, all sources of truth are merged into a single, powerful Config object.
  return new Config({
    // --- Core Identity & Models ---
    sessionId,
    model: argv.model!, // The '!' asserts that a default is always present.
    embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,

    // --- Execution & Context ---
    targetDir: argv.targetDir || process.cwd(),
    question: argv.prompt || '',
    fullContext: argv.all_files || false,
    userMemory: memoryContent,
    geminiMdFileCount: fileCount,
    cwd: process.cwd(),
    proxy:
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy,

    // --- Tools & Extensions ---
    coreTools: settings.coreTools,
    excludeTools: settings.excludeTools,
    toolDiscoveryCommand: settings.toolDiscoveryCommand,
    toolCallCommand: settings.toolCallCommand,
    mcpServerCommand: settings.mcpServerCommand,
    mcpServers,
    extensionContextFilePaths,

    // --- Behavior & Modes ---
    debugMode,
    sandbox: sandboxConfig,
    approvalMode: argv.yolo ? ApprovalMode.YOLO : ApprovalMode.DEFAULT,
    checkpointing: argv.checkpointing || settings.checkpointing?.enabled,

    // --- UI & Accessibility ---
    showMemoryUsage:
      argv.show_memory_usage || settings.showMemoryUsage || false,
    accessibility: settings.accessibility,

    // --- Telemetry & Statistics ---
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

    // --- File System Integration ---
    fileDiscoveryService: fileService,
    fileFiltering: {
      respectGitIgnore: settings.fileFiltering?.respectGitIgnore,
      enableRecursiveFileSearch:
        settings.fileFiltering?.enableRecursiveFileSearch,
    },

    // --- Miscellaneous ---
    bugCommand: settings.bugCommand,
  });
}
