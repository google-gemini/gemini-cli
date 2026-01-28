/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { bfsFileSearch } from './bfsFileSearch.js';
import { getAllGeminiMdFilenames } from '../tools/memoryTool.js';
import type { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { processImports } from './memoryImportProcessor.js';
import type { FileFilteringOptions } from '../config/constants.js';
import { DEFAULT_MEMORY_FILE_FILTERING_OPTIONS } from '../config/constants.js';
import { GEMINI_DIR, homedir } from './paths.js';
import type { ExtensionLoader } from './extensionLoader.js';
import { debugLogger } from './debugLogger.js';
import type { Config } from '../config/config.js';
import { CoreEvent, coreEvents } from './events.js';

// Simple console logger, similar to the one previously in CLI's config.ts
// TODO: Integrate with a more robust server-side logger if available/appropriate.
const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) =>
    debugLogger.debug('[DEBUG] [MemoryDiscovery]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (...args: any[]) =>
    debugLogger.warn('[WARN] [MemoryDiscovery]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) =>
    debugLogger.error('[ERROR] [MemoryDiscovery]', ...args),
};

export interface GeminiFileContent {
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
      // process.env['NODE_ENV'] === 'test' or VITEST are common test indicators
      const isTestEnv =
        process.env['NODE_ENV'] === 'test' || process.env['VITEST'];

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
  includeDirectoriesToReadGemini: readonly string[],
  userHomePath: string,
  debugMode: boolean,
  fileService: FileDiscoveryService,
  folderTrust: boolean,
  fileFilteringOptions: FileFilteringOptions,
  maxDirs: number,
): Promise<string[]> {
  const dirs = new Set<string>([
    ...includeDirectoriesToReadGemini,
    currentWorkingDirectory,
  ]);

  // Process directories in parallel with concurrency limit to prevent EMFILE errors
  const CONCURRENT_LIMIT = 10;
  const dirsArray = Array.from(dirs);
  const pathsArrays: string[][] = [];

  for (let i = 0; i < dirsArray.length; i += CONCURRENT_LIMIT) {
    const batch = dirsArray.slice(i, i + CONCURRENT_LIMIT);
    const batchPromises = batch.map((dir) =>
      getGeminiMdFilePathsInternalForEachDir(
        dir,
        userHomePath,
        debugMode,
        fileService,
        folderTrust,
        fileFilteringOptions,
        maxDirs,
      ),
    );

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        pathsArrays.push(result.value);
      } else {
        const error = result.reason;
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error discovering files in directory: ${message}`);
        // Continue processing other directories
      }
    }
  }

  const paths = pathsArrays.flat();
  return Array.from(new Set<string>(paths));
}

async function getGeminiMdFilePathsInternalForEachDir(
  dir: string,
  userHomePath: string,
  debugMode: boolean,
  fileService: FileDiscoveryService,
  folderTrust: boolean,
  fileFilteringOptions: FileFilteringOptions,
  maxDirs: number,
): Promise<string[]> {
  const allPaths = new Set<string>();
  const geminiMdFilenames = getAllGeminiMdFilenames();

  for (const geminiMdFilename of geminiMdFilenames) {
    const resolvedHome = path.resolve(userHomePath);
    const globalMemoryPath = path.join(
      resolvedHome,
      GEMINI_DIR,
      geminiMdFilename,
    );

    // This part that finds the global file always runs.
    try {
      await fs.access(globalMemoryPath, fsSync.constants.R_OK);
      allPaths.add(globalMemoryPath);
      if (debugMode)
        logger.debug(
          `Found readable global ${geminiMdFilename}: ${globalMemoryPath}`,
        );
    } catch {
      // It's okay if it's not found.
    }

    // FIX: Only perform the workspace search (upward and downward scans)
    // if a valid currentWorkingDirectory is provided.
    if (dir && folderTrust) {
      const resolvedCwd = path.resolve(dir);
      if (debugMode)
        logger.debug(
          `Searching for ${geminiMdFilename} starting from CWD: ${resolvedCwd}`,
        );

      const projectRoot = await findProjectRoot(resolvedCwd);
      if (debugMode)
        logger.debug(`Determined project root: ${projectRoot ?? 'None'}`);

      const upwardPaths: string[] = [];
      let currentDir = resolvedCwd;
      const ultimateStopDir = projectRoot
        ? path.dirname(projectRoot)
        : path.dirname(resolvedHome);

      while (currentDir && currentDir !== path.dirname(currentDir)) {
        if (currentDir === path.join(resolvedHome, GEMINI_DIR)) {
          break;
        }

        const potentialPath = path.join(currentDir, geminiMdFilename);
        try {
          await fs.access(potentialPath, fsSync.constants.R_OK);
          if (potentialPath !== globalMemoryPath) {
            upwardPaths.unshift(potentialPath);
          }
        } catch {
          // Not found, continue.
        }

        if (currentDir === ultimateStopDir) {
          break;
        }

        currentDir = path.dirname(currentDir);
      }
      upwardPaths.forEach((p) => allPaths.add(p));

      const mergedOptions: FileFilteringOptions = {
        ...DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
        ...fileFilteringOptions,
      };

      const downwardPaths = await bfsFileSearch(resolvedCwd, {
        fileName: geminiMdFilename,
        maxDirs,
        debug: debugMode,
        fileService,
        fileFilteringOptions: mergedOptions,
      });
      downwardPaths.sort();
      for (const dPath of downwardPaths) {
        allPaths.add(dPath);
      }
    }
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
  // Process files in parallel with concurrency limit to prevent EMFILE errors
  const CONCURRENT_LIMIT = 20; // Higher limit for file reads as they're typically faster
  const results: GeminiFileContent[] = [];

  for (let i = 0; i < filePaths.length; i += CONCURRENT_LIMIT) {
    const batch = filePaths.slice(i, i + CONCURRENT_LIMIT);
    const batchPromises = batch.map(
      async (filePath): Promise<GeminiFileContent> => {
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
          if (debugMode)
            logger.debug(
              `Successfully read and processed imports: ${filePath} (Length: ${processedResult.content.length})`,
            );

          return { filePath, content: processedResult.content };
        } catch (error: unknown) {
          const isTestEnv =
            process.env['NODE_ENV'] === 'test' || process.env['VITEST'];
          if (!isTestEnv) {
            const message =
              error instanceof Error ? error.message : String(error);
            logger.warn(
              `Warning: Could not read ${getAllGeminiMdFilenames()} file at ${filePath}. Error: ${message}`,
            );
          }
          if (debugMode) logger.debug(`Failed to read: ${filePath}`);
          return { filePath, content: null }; // Still include it with null content
        }
      },
    );

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // This case shouldn't happen since we catch all errors above,
        // but handle it for completeness
        const error = result.reason;
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Unexpected error processing file: ${message}`);
      }
    }
  }

  return results;
}

export function concatenateInstructions(
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

export interface MemoryLoadResult {
  files: Array<{ path: string; content: string }>;
}

export async function loadGlobalMemory(
  debugMode: boolean = false,
): Promise<MemoryLoadResult> {
  const userHome = homedir();
  const geminiMdFilenames = getAllGeminiMdFilenames();

  const accessChecks = geminiMdFilenames.map(async (filename) => {
    const globalPath = path.join(userHome, GEMINI_DIR, filename);
    try {
      await fs.access(globalPath, fsSync.constants.R_OK);
      if (debugMode) {
        logger.debug(`Found global memory file: ${globalPath}`);
      }
      return globalPath;
    } catch {
      debugLogger.debug('A global memory file was not found.');
      return null;
    }
  });

  const foundPaths = (await Promise.all(accessChecks)).filter(
    (p): p is string => p !== null,
  );

  const contents = await readGeminiMdFiles(foundPaths, debugMode, 'tree');

  return {
    files: contents
      .filter((item) => item.content !== null)
      .map((item) => ({
        path: item.filePath,
        content: item.content as string,
      })),
  };
}

/**
 * Traverses upward from startDir to stopDir, finding all GEMINI.md variants.
 *
 * Files are ordered by directory level (root to leaf), with all filename
 * variants grouped together per directory.
 */
async function findUpwardGeminiFiles(
  startDir: string,
  stopDir: string,
  debugMode: boolean,
): Promise<string[]> {
  const upwardPaths: string[] = [];
  let currentDir = path.resolve(startDir);
  const resolvedStopDir = path.resolve(stopDir);
  const geminiMdFilenames = getAllGeminiMdFilenames();
  const globalGeminiDir = path.join(homedir(), GEMINI_DIR);

  if (debugMode) {
    logger.debug(
      `Starting upward search from ${currentDir} stopping at ${resolvedStopDir}`,
    );
  }

  while (true) {
    if (currentDir === globalGeminiDir) {
      break;
    }

    // Parallelize checks for all filename variants in the current directory
    const accessChecks = geminiMdFilenames.map(async (filename) => {
      const potentialPath = path.join(currentDir, filename);
      try {
        await fs.access(potentialPath, fsSync.constants.R_OK);
        return potentialPath;
      } catch {
        return null;
      }
    });

    const foundPathsInDir = (await Promise.all(accessChecks)).filter(
      (p): p is string => p !== null,
    );

    upwardPaths.unshift(...foundPathsInDir);

    if (
      currentDir === resolvedStopDir ||
      currentDir === path.dirname(currentDir)
    ) {
      break;
    }
    currentDir = path.dirname(currentDir);
  }
  return upwardPaths;
}

export async function loadEnvironmentMemory(
  trustedRoots: string[],
  extensionLoader: ExtensionLoader,
  debugMode: boolean = false,
): Promise<MemoryLoadResult> {
  const allPaths = new Set<string>();

  // Trusted Roots Upward Traversal (Parallelized)
  const traversalPromises = trustedRoots.map(async (root) => {
    const resolvedRoot = path.resolve(root);
    if (debugMode) {
      logger.debug(
        `Loading environment memory for trusted root: ${resolvedRoot} (Stopping exactly here)`,
      );
    }
    return findUpwardGeminiFiles(resolvedRoot, resolvedRoot, debugMode);
  });

  const pathArrays = await Promise.all(traversalPromises);
  pathArrays.flat().forEach((p) => allPaths.add(p));

  // Extensions
  const extensionPaths = extensionLoader
    .getExtensions()
    .filter((ext) => ext.isActive)
    .flatMap((ext) => ext.contextFiles);
  extensionPaths.forEach((p) => allPaths.add(p));

  const sortedPaths = Array.from(allPaths).sort();
  const contents = await readGeminiMdFiles(sortedPaths, debugMode, 'tree');

  return {
    files: contents
      .filter((item) => item.content !== null)
      .map((item) => ({
        path: item.filePath,
        content: item.content as string,
      })),
  };
}

export interface LoadServerHierarchicalMemoryResponse {
  memoryContent: string;
  fileCount: number;
  filePaths: string[];
}

/**
 * Loads hierarchical GEMINI.md files and concatenates their content.
 * This function is intended for use by the server.
 */
export async function loadServerHierarchicalMemory(
  currentWorkingDirectory: string,
  includeDirectoriesToReadGemini: readonly string[],
  debugMode: boolean,
  fileService: FileDiscoveryService,
  extensionLoader: ExtensionLoader,
  folderTrust: boolean,
  importFormat: 'flat' | 'tree' = 'tree',
  fileFilteringOptions?: FileFilteringOptions,
  maxDirs: number = 200,
): Promise<LoadServerHierarchicalMemoryResponse> {
  // FIX: Use real, canonical paths for a reliable comparison to handle symlinks.
  const realCwd = await fs.realpath(path.resolve(currentWorkingDirectory));
  const realHome = await fs.realpath(path.resolve(homedir()));
  const isHomeDirectory = realCwd === realHome;

  // If it is the home directory, pass an empty string to the core memory
  // function to signal that it should skip the workspace search.
  currentWorkingDirectory = isHomeDirectory ? '' : currentWorkingDirectory;

  if (debugMode)
    logger.debug(
      `Loading server hierarchical memory for CWD: ${currentWorkingDirectory} (importFormat: ${importFormat})`,
    );

  // For the server, homedir() refers to the server process's home.
  // This is consistent with how MemoryTool already finds the global path.
  const userHomePath = homedir();
  const filePaths = await getGeminiMdFilePathsInternal(
    currentWorkingDirectory,
    includeDirectoriesToReadGemini,
    userHomePath,
    debugMode,
    fileService,
    folderTrust,
    fileFilteringOptions || DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
    maxDirs,
  );

  // Add extension file paths separately since they may be conditionally enabled.
  filePaths.push(
    ...extensionLoader
      .getExtensions()
      .filter((ext) => ext.isActive)
      .flatMap((ext) => ext.contextFiles),
  );

  if (filePaths.length === 0) {
    if (debugMode)
      logger.debug('No GEMINI.md files found in hierarchy of the workspace.');
    return { memoryContent: '', fileCount: 0, filePaths: [] };
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
  return {
    memoryContent: combinedInstructions,
    fileCount: contentsWithPaths.length,
    filePaths,
  };
}

/**
 * Loads the hierarchical memory and resets the state of `config` as needed such
 * that it reflects the new memory.
 *
 * Returns the result of the call to `loadHierarchicalGeminiMemory`.
 */
export async function refreshServerHierarchicalMemory(config: Config) {
  const result = await loadServerHierarchicalMemory(
    config.getWorkingDir(),
    config.shouldLoadMemoryFromIncludeDirectories()
      ? config.getWorkspaceContext().getDirectories()
      : [],
    config.getDebugMode(),
    config.getFileService(),
    config.getExtensionLoader(),
    config.isTrustedFolder(),
    config.getImportFormat(),
    config.getFileFilteringOptions(),
    config.getDiscoveryMaxDirs(),
  );
  const mcpInstructions =
    config.getMcpClientManager()?.getMcpInstructions() || '';
  const finalMemory = [result.memoryContent, mcpInstructions.trimStart()]
    .filter(Boolean)
    .join('\n\n');
  config.setUserMemory(finalMemory);
  config.setGeminiMdFileCount(result.fileCount);
  config.setGeminiMdFilePaths(result.filePaths);
  coreEvents.emit(CoreEvent.MemoryChanged, { fileCount: result.fileCount });
  return result;
}

export async function loadJitSubdirectoryMemory(
  targetPath: string,
  trustedRoots: string[],
  alreadyLoadedPaths: Set<string>,
  debugMode: boolean = false,
): Promise<MemoryLoadResult> {
  const resolvedTarget = path.resolve(targetPath);
  let bestRoot: string | null = null;

  // Find the deepest trusted root that contains the target path
  for (const root of trustedRoots) {
    const resolvedRoot = path.resolve(root);
    if (
      resolvedTarget.startsWith(resolvedRoot) &&
      (!bestRoot || resolvedRoot.length > bestRoot.length)
    ) {
      bestRoot = resolvedRoot;
    }
  }

  if (!bestRoot) {
    if (debugMode) {
      logger.debug(
        `JIT memory skipped: ${resolvedTarget} is not in any trusted root.`,
      );
    }
    return { files: [] };
  }

  if (debugMode) {
    logger.debug(
      `Loading JIT memory for ${resolvedTarget} (Trusted root: ${bestRoot})`,
    );
  }

  // Traverse from target up to the trusted root
  const potentialPaths = await findUpwardGeminiFiles(
    resolvedTarget,
    bestRoot,
    debugMode,
  );

  // Filter out already loaded paths
  const newPaths = potentialPaths.filter((p) => !alreadyLoadedPaths.has(p));

  if (newPaths.length === 0) {
    return { files: [] };
  }

  if (debugMode) {
    logger.debug(`Found new JIT memory files: ${JSON.stringify(newPaths)}`);
  }

  const contents = await readGeminiMdFiles(newPaths, debugMode, 'tree');

  return {
    files: contents
      .filter((item) => item.content !== null)
      .map((item) => ({
        path: item.filePath,
        content: item.content as string,
      })),
  };
}
