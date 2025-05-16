/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs'; // For synchronous checks like existsSync
import * as path from 'path';
import { homedir } from 'os';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import process from 'node:process';
import {
  Config,
  loadEnvironment,
  createServerConfig,
} from '@gemini-code/server';
import { Settings } from './settings.js';
import { readPackageUp } from 'read-package-up';

// Simple console logger for now - replace with actual logger if available
const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => console.debug('[DEBUG]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) => console.error('[ERROR]', ...args),
};

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro-preview-05-06';
const GEMINI_MD_FILENAME = 'GEMINI.md';
const GEMINI_CONFIG_DIR = '.gemini';
// TODO(adh): Refactor to use a shared ignore list with other tools like glob and read-many-files.
const DEFAULT_IGNORE_DIRECTORIES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.vscode',
  '.idea',
  '.DS_Store',
];

interface CliArgs {
  model: string | undefined;
  sandbox: boolean | string | undefined;
  debug: boolean | undefined;
  prompt: string | undefined;
  all_files: boolean | undefined;
}

async function parseArguments(): Promise<CliArgs> {
  const argv = await yargs(hideBin(process.argv))
    .option('model', {
      alias: 'm',
      type: 'string',
      description: `Model`,
      default: process.env.GEMINI_CODE_MODEL || DEFAULT_GEMINI_MODEL,
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
    .help()
    .alias('h', 'help')
    .strict().argv;

  const finalArgv: CliArgs = {
    ...argv,
    sandbox: argv.sandbox,
  };

  return finalArgv;
}

async function findProjectRoot(startDir: string): Promise<string | null> {
  let currentDir = path.resolve(startDir);
  while (true) {
    const gitPath = path.join(currentDir, '.git');
    try {
      const stats = await fs.stat(gitPath);
      if (stats.isDirectory()) {
        return currentDir;
      }
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        const fsError = error as { code: string; message: string };
        if (fsError.code !== 'ENOENT') {
          logger.warn(
            `Error checking for .git directory at ${gitPath}: ${fsError.message}`,
          );
        }
      } else {
        logger.warn(
          `Non-standard error checking for .git directory at ${gitPath}: ${String(error)}`,
        );
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

async function collectDownwardGeminiFiles(
  directory: string,
  debugMode: boolean,
  ignoreDirs: string[],
): Promise<string[]> {
  if (debugMode) logger.debug(`Recursively scanning downward in: ${directory}`);
  const collectedPaths: string[] = [];
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (ignoreDirs.includes(entry.name)) {
          if (debugMode)
            logger.debug(`Skipping ignored directory: ${fullPath}`);
          continue;
        }
        const subDirPaths = await collectDownwardGeminiFiles(
          fullPath,
          debugMode,
          ignoreDirs,
        );
        collectedPaths.push(...subDirPaths);
      } else if (entry.isFile() && entry.name === GEMINI_MD_FILENAME) {
        try {
          await fs.access(fullPath, fsSync.constants.R_OK);
          collectedPaths.push(fullPath);
          if (debugMode)
            logger.debug(`Found readable downward GEMINI.md: ${fullPath}`);
        } catch {
          if (debugMode)
            logger.debug(
              `Downward GEMINI.md not readable, skipping: ${fullPath}`,
            );
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Error scanning directory ${directory}: ${message}`);
    if (debugMode) logger.debug(`Failed to scan directory: ${directory}`);
  }
  return collectedPaths;
}

export async function getGeminiMdFilePaths(
  currentWorkingDirectory: string,
  userHomePath: string,
  debugMode: boolean,
): Promise<string[]> {
  const resolvedCwd = path.resolve(currentWorkingDirectory);
  const resolvedHome = path.resolve(userHomePath);
  const globalMemoryPath = path.join(
    resolvedHome,
    GEMINI_CONFIG_DIR,
    GEMINI_MD_FILENAME,
  );
  const paths: string[] = [];

  if (debugMode)
    logger.debug(`Searching for GEMINI.md starting from CWD: ${resolvedCwd}`);
  if (debugMode) logger.debug(`User home directory: ${resolvedHome}`);

  try {
    await fs.access(globalMemoryPath, fsSync.constants.R_OK);
    paths.push(globalMemoryPath);
    if (debugMode)
      logger.debug(`Found readable global GEMINI.md: ${globalMemoryPath}`);
  } catch {
    if (debugMode)
      logger.debug(
        `Global GEMINI.md not found or not readable: ${globalMemoryPath}`,
      );
  }

  const projectRoot = await findProjectRoot(resolvedCwd);
  if (debugMode)
    logger.debug(`Determined project root: ${projectRoot ?? 'None'}`);

  const upwardPaths: string[] = [];
  let currentDir = resolvedCwd;
  const stopDir = projectRoot ? path.dirname(projectRoot) : resolvedHome;

  while (
    currentDir &&
    currentDir !== stopDir &&
    currentDir !== path.dirname(currentDir)
  ) {
    if (debugMode)
      logger.debug(`Checking for GEMINI.md in (upward scan): ${currentDir}`);
    if (currentDir === path.join(resolvedHome, GEMINI_CONFIG_DIR)) {
      if (debugMode)
        logger.debug(`Skipping check inside global config dir: ${currentDir}`);
      break;
    }
    const potentialPath = path.join(currentDir, GEMINI_MD_FILENAME);
    try {
      await fs.access(potentialPath, fsSync.constants.R_OK);
      upwardPaths.unshift(potentialPath);
      if (debugMode)
        logger.debug(`Found readable upward GEMINI.md: ${potentialPath}`);
    } catch {
      if (debugMode)
        logger.debug(
          `Upward GEMINI.md not found or not readable in: ${currentDir}`,
        );
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      if (debugMode)
        logger.debug(`Reached filesystem root, stopping upward search.`);
      break;
    }
    currentDir = parentDir;
  }
  paths.push(...upwardPaths);

  if (debugMode)
    logger.debug(`Starting downward scan from CWD: ${resolvedCwd}`);
  const downwardPaths = await collectDownwardGeminiFiles(
    resolvedCwd,
    debugMode,
    DEFAULT_IGNORE_DIRECTORIES,
  );
  downwardPaths.sort();
  if (debugMode && downwardPaths.length > 0)
    logger.debug(
      `Found downward GEMINI.md files (sorted): ${JSON.stringify(downwardPaths)}`,
    );
  for (const dPath of downwardPaths) {
    if (!paths.includes(dPath)) {
      paths.push(dPath);
    }
  }

  if (debugMode)
    logger.debug(
      `Final ordered GEMINI.md paths to read: ${JSON.stringify(paths)}`,
    );
  return paths;
}

interface GeminiFileContent {
  filePath: string;
  content: string | null;
}

async function readGeminiMdFiles(
  filePaths: string[],
  debugMode: boolean,
): Promise<GeminiFileContent[]> {
  const results: GeminiFileContent[] = [];
  for (const filePath of filePaths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      results.push({ filePath, content });
      if (debugMode)
        logger.debug(
          `Successfully read: ${filePath} (Length: ${content.length})`,
        );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(
        `Warning: Could not read GEMINI.md file at ${filePath}. Error: ${message}`,
      );
      results.push({ filePath, content: null });
      if (debugMode) logger.debug(`Failed to read: ${filePath}`);
    }
  }
  return results;
}

function concatenateInstructions(
  instructionContents: GeminiFileContent[],
): string {
  return instructionContents
    .filter((item) => typeof item.content === 'string')
    .map((item) => {
      const trimmedContent = (item.content as string).trim();
      if (trimmedContent.length === 0) {
        return null; // Filter out empty content after trimming
      }
      // Use a relative path for the marker if possible, otherwise full path.
      // This assumes process.cwd() is the project root or a relevant base.
      const displayPath = path.isAbsolute(item.filePath)
        ? path.relative(process.cwd(), item.filePath)
        : item.filePath;
      return `--- Context from: ${displayPath} ---\n${trimmedContent}\n--- End of Context from: ${displayPath} ---`;
    })
    .filter((block): block is string => block !== null)
    .join('\n\n');
}

export async function loadHierarchicalGeminiMemory(
  currentWorkingDirectory: string,
  debugMode: boolean,
): Promise<{ memoryContent: string; fileCount: number }> {
  if (debugMode)
    logger.debug(
      `Loading hierarchical memory for CWD: ${currentWorkingDirectory}`,
    );
  const userHomePath = homedir();
  const filePaths = await getGeminiMdFilePaths(
    currentWorkingDirectory,
    userHomePath,
    debugMode,
  );
  if (filePaths.length === 0) {
    if (debugMode) logger.debug('No GEMINI.md files found in hierarchy.');
    return { memoryContent: '', fileCount: 0 };
  }
  const contentsWithPaths = await readGeminiMdFiles(filePaths, debugMode);
  const combinedInstructions = concatenateInstructions(contentsWithPaths);
  if (debugMode)
    logger.debug(
      `Combined instructions length: ${combinedInstructions.length}`,
    );
  if (debugMode && combinedInstructions.length > 0)
    logger.debug(
      `Combined instructions (snippet): ${combinedInstructions.substring(0, 500)}...`,
    );
  return { memoryContent: combinedInstructions, fileCount: filePaths.length };
}

export async function loadCliConfig(settings: Settings): Promise<Config> {
  // Load .env file using logic from server package
  loadEnvironment();

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION;

  const hasGeminiApiKey = !!geminiApiKey;
  const hasGoogleApiKey = !!googleApiKey;
  const hasVertexProjectLocationConfig =
    !!googleCloudProject && !!googleCloudLocation;

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

  const argv = await parseArguments();
  const debugMode = argv.debug || false;

  const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
    process.cwd(),
    debugMode,
  );

  const userAgent = await createUserAgent();

  // Gemini Developer API or GCP Express or Vertex AI
  const apiKeyForServer = geminiApiKey || googleApiKey || '';

  // Create config using factory from server package
  return createServerConfig(
    apiKeyForServer,
    argv.model || DEFAULT_GEMINI_MODEL,
    argv.sandbox ?? settings.sandbox ?? false,
    process.cwd(),
    debugMode,
    argv.prompt || '',
    argv.all_files || false,
    settings.toolDiscoveryCommand,
    settings.toolCallCommand,
    settings.mcpServerCommand,
    userAgent,
    memoryContent,
    fileCount,
  );
}

async function createUserAgent(): Promise<string> {
  try {
    const packageJsonInfo = await readPackageUp({ cwd: import.meta.url });
    const cliVersion = packageJsonInfo?.packageJson.version || 'unknown';
    return `GeminiCLI/${cliVersion} Node.js/${process.version} (${process.platform}; ${process.arch})`;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      `Could not determine package version for User-Agent: ${message}`,
    );
    return `GeminiCLI/unknown Node.js/${process.version} (${process.platform}; ${process.arch})`;
  }
}
