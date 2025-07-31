/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
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

async function findProjectRoot(startDir: string): Promise<string | null> {
  let currentDir = path.resolve(startDir);
  while (true) {
    const gitPath = path.join(currentDir, '.git');
    try {
      const stats = await fs.lstat(gitPath);
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

async function getGeminiMdFilePathsInternal(
  currentWorkingDirectory: string,
  userHomePath: string,
  debugMode: boolean,
  fileService: FileDiscoveryService,
  extensionContextFilePaths: string[] = [],
  fileFilteringOptions: FileFilteringOptions,
  maxDirs: number,
): Promise<string[]> {
  const allPaths = new Set<string>();
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

    try {
      await fs.access(globalMemoryPath, fsSync.constants.R_OK);
      allPaths.add(globalMemoryPath);
      if (debugMode)
        logger.debug(
          `Found readable global ${geminiMdFilename}: ${globalMemoryPath}`,
        );
    } catch {
      if (debugMode)
        logger.debug(
          `Global ${geminiMdFilename} not found or not readable: ${globalMemoryPath}`,
        );
    }

    const projectRoot = await findProjectRoot(resolvedCwd);
    if (debugMode)
      logger.debug(`Determined project root: ${projectRoot ?? 'None'}`);

    const upwardPaths: string[] = [];
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
      try {
        await fs.access(potentialPath, fsSync.constants.R_OK);
        // Add to upwardPaths only if it's not the already added globalMemoryPath
        if (potentialPath !== globalMemoryPath) {
          upwardPaths.unshift(potentialPath);
          if (debugMode) {
            logger.debug(
              `Found readable upward ${geminiMdFilename}: ${potentialPath}`,
            );
          }
        }
      } catch {
        if (debugMode) {
          logger.debug(
            `Upward ${geminiMdFilename} not found or not readable in: ${currentDir}`,
          );
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
    upwardPaths.forEach((p) => allPaths.add(p));

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
    downwardPaths.sort(); // Sort for consistent ordering, though hierarchy might be more complex
    if (debugMode && downwardPaths.length > 0)
      logger.debug(
        `Found downward ${geminiMdFilename} files (sorted): ${JSON.stringify(
          downwardPaths,
        )}`,
      );
    // Add downward paths only if they haven't been included already (e.g. from upward scan)
    for (const dPath of downwardPaths) {
      allPaths.add(dPath);
    }
  }

  // Add extension context file paths
  for (const extensionPath of extensionContextFilePaths) {
    allPaths.add(extensionPath);
  }

  const finalPaths = Array.from(allPaths);

  if (debugMode)
    logger.debug(
      `Final ordered ${getAllGeminiMdFilenames()} paths to read: ${JSON.stringify(
        finalPaths,
      )}`,
    );
  return finalPaths;
}

async function readGeminiMdFiles(
  filePaths: string[],
  debugMode: boolean,
  importFormat: 'flat' | 'tree' = 'tree',
): Promise<GeminiFileContent[]> {
  const results: GeminiFileContent[] = [];
  for (const filePath of filePaths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // Process imports in the content
      const processedResult = await processImports(
        content,
        path.dirname(filePath),
        debugMode,
        undefined,
        undefined,
        importFormat,
      );

      results.push({ filePath, content: processedResult.content });
      if (debugMode)
        logger.debug(
          `Successfully read and processed imports: ${filePath} (Length: ${processedResult.content.length})`,
        );
    } catch (error: unknown) {
      const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST;
      if (!isTestEnv) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
          `Warning: Could not read ${getAllGeminiMdFilenames()} file at ${filePath}. Error: ${message}`,
        );
      }
      results.push({ filePath, content: null }); // Still include it with null content
      if (debugMode) logger.debug(`Failed to read: ${filePath}`);
    }
  }
  return results;
}

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
  importFormat: 'flat' | 'tree' = 'tree',
  fileFilteringOptions?: FileFilteringOptions,
  maxDirs: number = 200,
): Promise<{ memoryContent: string; fileCount: number }> {
  if (debugMode)
    logger.debug(
      `Loading server hierarchical memory for CWD: ${currentWorkingDirectory} (importFormat: ${importFormat})`,
    );

  // For the server, homedir() refers to the server process's home.
  // This is consistent with how MemoryTool already finds the global path.
  const userHomePath = homedir();
  const filePaths = await getGeminiMdFilePathsInternal(
    currentWorkingDirectory,
    userHomePath,
    debugMode,
    fileService,
    extensionContextFilePaths,
    fileFilteringOptions || DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
    maxDirs,
  );
  if (filePaths.length === 0) {
    if (debugMode) logger.debug('No GEMINI.md files found in hierarchy.');
    return { memoryContent: '', fileCount: 0 };
  }
  const contentsWithPaths = await readGeminiMdFiles(
    filePaths,
    debugMode,
    importFormat,
  );
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
  return { memoryContent: combinedInstructions, fileCount: filePaths.length };
}
