/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import { bfsFileSearch } from './bfsFileSearch.js';
import {
  GEMINI_CONFIG_DIR,
  getAllGeminiMdFilenames,
} from '../tools/memoryTool.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { processImports } from './memoryImportProcessor.js';
import {
  DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
  FileFilteringOptions,
} from '../config/config.js';

// Simple console logger, similar to the one previously in CLI's config.ts
// TODO: Integrate with a more robust server-side logger if available/appropriate.
const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) =>
    console.debug('[DEBUG] [MemoryDiscovery]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (...args: any[]) => console.warn('[WARN] [MemoryDiscovery]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) =>
    console.error('[ERROR] [MemoryDiscovery]', ...args),
};

interface GeminiFileContent {
  filePath: string;
  content: string | null;
}

/**
 * Attempts to read a file and process its content immediately.
 * This avoids TOCTOU vulnerabilities by combining check and use.
 * @returns The file content if successful, null otherwise
 */
async function tryReadGeminiFile(
  filePath: string,
  context: string,
  geminiMdFilename: string,
  debugMode: boolean,
): Promise<GeminiFileContent | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Process imports in the content
    const processedContent = await processImports(
      content,
      path.dirname(filePath),
      debugMode,
    );

    if (debugMode)
      logger.debug(
        `Successfully read ${context} ${geminiMdFilename}: ${filePath} (Length: ${processedContent.length})`,
      );

    return { filePath, content: processedContent };
  } catch (error) {
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST;

    if (error instanceof Error && 'code' in error) {
      const fsError = error as { code: string; message: string };
      // EISDIR and ENOENT are expected conditions, so only log them in debug mode.
      if (fsError.code === 'EISDIR' || fsError.code === 'ENOENT') {
        if (debugMode) {
          logger.debug(
            `Skipping path during file read (${fsError.code}): ${filePath}`,
          );
        }
      } else {
        // For other errors like EACCES, it's useful to warn the user.
        if (!isTestEnv) {
          logger.warn(
            `Could not read ${context} ${geminiMdFilename} at ${filePath}. Error: ${fsError.message}`,
          );
        }
        if (debugMode) {
          logger.debug(
            `Error reading ${context} ${geminiMdFilename} at ${filePath}: ${fsError.code}`,
          );
        }
      }
    } else {
      // Also log unexpected, non-fs errors
      if (!isTestEnv) {
        logger.warn(
          `Unexpected error reading ${context} ${geminiMdFilename} at ${filePath}: ${String(error)}`,
        );
      }
      if (debugMode) {
        logger.debug(
          `Unexpected error reading ${context} ${geminiMdFilename} at ${filePath}: ${String(error)}`,
        );
      }
    }
  }
  return null;
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
      // Don't log ENOENT errors as they're expected when .git doesn't exist
      // Also don't log errors in test environments, which often have mocked fs
      const isENOENT =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'ENOENT';

      // Only log unexpected errors in non-test environments
      // process.env.NODE_ENV === 'test' or VITEST are common test indicators
      const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST;

      if (!isENOENT && !isTestEnv) {
        if (typeof error === 'object' && error !== null && 'code' in error) {
          const fsError = error as { code: string; message: string };
          logger.warn(
            `Error checking for .git directory at ${gitPath}: ${fsError.message}`,
          );
        } else {
          logger.warn(
            `Non-standard error checking for .git directory at ${gitPath}: ${String(error)}`,
          );
        }
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

async function getGeminiMdFileContentsInternal(
  currentWorkingDirectory: string,
  userHomePath: string,
  debugMode: boolean,
  fileService: FileDiscoveryService,
  extensionContextFilePaths: string[] = [],
  fileFilteringOptions: FileFilteringOptions,
  maxDirs: number,
): Promise<GeminiFileContent[]> {
  const allContents: GeminiFileContent[] = [];
  const geminiMdFilenames = getAllGeminiMdFilenames();

  for (const geminiMdFilename of geminiMdFilenames) {
    const resolvedCwd = path.resolve(currentWorkingDirectory);
    const resolvedHome = path.resolve(userHomePath);
    const globalMemoryPath = path.join(
      resolvedHome,
      GEMINI_CONFIG_DIR,
      geminiMdFilename,
    );

    if (debugMode)
      logger.debug(
        `Searching for ${geminiMdFilename} starting from CWD: ${resolvedCwd}`,
      );
    if (debugMode) logger.debug(`User home directory: ${resolvedHome}`);

    const globalContent = await tryReadGeminiFile(
      globalMemoryPath,
      'global',
      geminiMdFilename,
      debugMode,
    );
    if (globalContent) {
      allContents.push(globalContent);
    }

    const projectRoot = await findProjectRoot(resolvedCwd);
    if (debugMode)
      logger.debug(`Determined project root: ${projectRoot ?? 'None'}`);

    const upwardContents: GeminiFileContent[] = [];
    let currentDir = resolvedCwd;
    // Determine the directory that signifies the top of the project or user-specific space.
    const ultimateStopDir = projectRoot
      ? path.dirname(projectRoot)
      : path.dirname(resolvedHome);

    while (currentDir && currentDir !== path.dirname(currentDir)) {
      // Loop until filesystem root or currentDir is empty
      if (debugMode) {
        logger.debug(
          `Checking for ${geminiMdFilename} in (upward scan): ${currentDir}`,
        );
      }

      // Skip the global .gemini directory itself during upward scan from CWD,
      // as global is handled separately and explicitly first.
      if (currentDir === path.join(resolvedHome, GEMINI_CONFIG_DIR)) {
        if (debugMode) {
          logger.debug(
            `Upward scan reached global config dir path, stopping upward search here: ${currentDir}`,
          );
        }
        break;
      }

      const potentialPath = path.join(currentDir, geminiMdFilename);
      // Skip if it's the same as global path
      if (potentialPath !== globalMemoryPath) {
        const upwardContent = await tryReadGeminiFile(
          potentialPath,
          'upward',
          geminiMdFilename,
          debugMode,
        );
        if (upwardContent) {
          upwardContents.unshift(upwardContent);
        }
      }

      // Stop condition: if currentDir is the ultimateStopDir, break after this iteration.
      if (currentDir === ultimateStopDir) {
        if (debugMode)
          logger.debug(
            `Reached ultimate stop directory for upward scan: ${currentDir}`,
          );
        break;
      }

      currentDir = path.dirname(currentDir);
    }
    allContents.push(...upwardContents);

    // Merge options with memory defaults, with options taking precedence
    const mergedOptions = {
      ...DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
      ...fileFilteringOptions,
    };

    const downwardPaths = await bfsFileSearch(resolvedCwd, {
      fileName: geminiMdFilename,
      maxDirs,
      debug: debugMode,
      fileService,
      fileFilteringOptions: mergedOptions, // Pass merged options as fileFilter
    });
    downwardPaths.sort();
    // Read downward files immediately to avoid TOCTOU
    const processedPaths = new Set<string>(
      allContents.map((content) => content.filePath),
    );

    for (const dPath of downwardPaths) {
      // Skip if already processed
      if (!processedPaths.has(dPath)) {
        processedPaths.add(dPath);
        const downwardContent = await tryReadGeminiFile(
          dPath,
          'downward',
          geminiMdFilename,
          debugMode,
        );
        if (downwardContent) {
          allContents.push(downwardContent);
        }
      }
    }
  }

  // Read extension context files
  // Create a final set of all processed paths to avoid duplicates
  const finalProcessedPaths = new Set(allContents.map((c) => c.filePath));
  for (const extensionPath of extensionContextFilePaths) {
    // Skip if already processed
    if (finalProcessedPaths.has(extensionPath)) {
      if (debugMode) {
        logger.debug(`Skipping duplicate extension path: ${extensionPath}`);
      }
      continue;
    }

    finalProcessedPaths.add(extensionPath);
    const extensionContent = await tryReadGeminiFile(
      extensionPath,
      'extension',
      path.basename(extensionPath),
      debugMode,
    );
    if (extensionContent) {
      allContents.push(extensionContent);
    }
  }

  if (debugMode)
    logger.debug(
      `Successfully read ${allContents.length} ${getAllGeminiMdFilenames()} files`,
    );
  return allContents;
}

// This function is no longer needed - reading is done immediately during discovery

function concatenateInstructions(
  instructionContents: GeminiFileContent[],
  // CWD is needed to resolve relative paths for display markers
  currentWorkingDirectoryForDisplay: string,
): string {
  return instructionContents
    .filter((item) => typeof item.content === 'string')
    .map((item) => {
      const trimmedContent = (item.content as string).trim();
      if (trimmedContent.length === 0) {
        return null;
      }
      const displayPath = path.isAbsolute(item.filePath)
        ? path.relative(currentWorkingDirectoryForDisplay, item.filePath)
        : item.filePath;
      return `--- Context from: ${displayPath} ---\n${trimmedContent}\n--- End of Context from: ${displayPath} ---`;
    })
    .filter((block): block is string => block !== null)
    .join('\n\n');
}

/**
 * Loads hierarchical GEMINI.md files and concatenates their content.
 * This function is intended for use by the server.
 */
export async function loadServerHierarchicalMemory(
  currentWorkingDirectory: string,
  debugMode: boolean,
  fileService: FileDiscoveryService,
  extensionContextFilePaths: string[] = [],
  fileFilteringOptions?: FileFilteringOptions,
  maxDirs: number = 200,
): Promise<{ memoryContent: string; fileCount: number }> {
  if (debugMode)
    logger.debug(
      `Loading server hierarchical memory for CWD: ${currentWorkingDirectory}`,
    );

  // For the server, homedir() refers to the server process's home.
  // This is consistent with how MemoryTool already finds the global path.
  const userHomePath = homedir();
  const contentsWithPaths = await getGeminiMdFileContentsInternal(
    currentWorkingDirectory,
    userHomePath,
    debugMode,
    fileService,
    extensionContextFilePaths,
    fileFilteringOptions || DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
    maxDirs,
  );
  if (contentsWithPaths.length === 0) {
    if (debugMode) logger.debug('No GEMINI.md files found in hierarchy.');
    return { memoryContent: '', fileCount: 0 };
  }
  // Pass CWD for relative path display in concatenated content
  const combinedInstructions = concatenateInstructions(
    contentsWithPaths,
    currentWorkingDirectory,
  );
  if (debugMode)
    logger.debug(
      `Combined instructions length: ${combinedInstructions.length}`,
    );
  if (debugMode && combinedInstructions.length > 0)
    logger.debug(
      `Combined instructions (snippet): ${combinedInstructions.substring(0, 500)}...`,
    );
  return {
    memoryContent: combinedInstructions,
    fileCount: contentsWithPaths.length,
  };
}
