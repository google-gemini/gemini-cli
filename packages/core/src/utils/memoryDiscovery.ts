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
import {
  DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
  type FileFilteringOptions,
} from '../config/constants.js';
import { GEMINI_DIR, homedir, normalizePath } from './paths.js';
import type { ExtensionLoader } from './extensionLoader.js';
import { debugLogger } from './debugLogger.js';
import type { Config } from '../config/config.js';
import type { HierarchicalMemory } from '../config/memory.js';
import { CoreEvent, coreEvents } from './events.js';
import { getErrorMessage } from './errors.js';

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

/**
 * Deduplicates file paths by file identity (device + inode) rather than string path.
 * This is necessary on case-insensitive filesystems where different case variants
 * of the same filename resolve to the same physical file but have different path strings.
 *
 * @param filePaths Array of file paths to deduplicate
 * @returns Object containing deduplicated file paths and a map of path to identity key
 */
export async function deduplicatePathsByFileIdentity(
  filePaths: string[],
): Promise<{
  paths: string[];
  identityMap: Map<string, string>;
}> {
  if (filePaths.length === 0) {
    return {
      paths: [],
      identityMap: new Map<string, string>(),
    };
  }

  // first deduplicate by string path to avoid redundant stat calls
  const uniqueFilePaths = Array.from(new Set(filePaths));

  const fileIdentityMap = new Map<string, string>();
  const deduplicatedPaths: string[] = [];

  const CONCURRENT_LIMIT = 20;
  const results: Array<{
    path: string;
    dev: bigint | number | null;
    ino: bigint | number | null;
  }> = [];

  for (let i = 0; i < uniqueFilePaths.length; i += CONCURRENT_LIMIT) {
    const batch = uniqueFilePaths.slice(i, i + CONCURRENT_LIMIT);
    const batchPromises = batch.map(async (filePath) => {
      try {
        // use stat() instead of lstat() to follow symlinks and get target file identity
        const stats = await fs.stat(filePath);
        return {
          path: filePath,
          dev: stats.dev,
          ino: stats.ino,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        logger.debug(
          `could not stat file for deduplication: ${filePath}. error: ${message}`,
        );
        return {
          path: filePath,
          dev: null,
          ino: null,
        };
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        const message = getErrorMessage(result.reason);
        debugLogger.debug(
          '[DEBUG] [MemoryDiscovery] unexpected error during deduplication stat:',
          message,
        );
      }
    }
  }

  const pathToIdentityMap = new Map<string, string>();
  for (const { path, dev, ino } of results) {
    if (dev !== null && ino !== null) {
      const identityKey = `${dev.toString()}:${ino.toString()}`;
      pathToIdentityMap.set(path, identityKey);
      if (!fileIdentityMap.has(identityKey)) {
        fileIdentityMap.set(identityKey, path);
        deduplicatedPaths.push(path);
        debugLogger.debug(
          '[DEBUG] [MemoryDiscovery] deduplication: keeping',
          path,
          `(dev: ${dev}, ino: ${ino})`,
        );
      } else {
        const existingPath = fileIdentityMap.get(identityKey);
        debugLogger.debug(
          '[DEBUG] [MemoryDiscovery] deduplication: skipping',
          path,
          `(same file as ${existingPath})`,
        );
      }
    } else {
      deduplicatedPaths.push(path);
    }
  }

  return {
    paths: deduplicatedPaths,
    identityMap: pathToIdentityMap,
  };
}

async function findProjectRoot(startDir: string): Promise<string | null> {
  let currentDir = normalizePath(startDir);
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        (error as { code: string }).code === 'ENOENT';

      // Only log unexpected errors in non-test environments
      // process.env['NODE_ENV'] === 'test' or VITEST are common test indicators
      const isTestEnv =
        process.env['NODE_ENV'] === 'test' || process.env['VITEST'];

      if (!isENOENT && !isTestEnv) {
        if (typeof error === 'object' && error !== null && 'code' in error) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
    const parentDir = normalizePath(path.dirname(currentDir));
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
  fileService: FileDiscoveryService,
  folderTrust: boolean,
  fileFilteringOptions: FileFilteringOptions,
  maxDirs: number,
): Promise<{ global: string[]; project: string[] }> {
  const dirs = new Set<string>([
    ...includeDirectoriesToReadGemini,
    currentWorkingDirectory,
  ]);

  // Process directories in parallel with concurrency limit to prevent EMFILE errors
  const CONCURRENT_LIMIT = 10;
  const dirsArray = Array.from(dirs);
  const globalPaths = new Set<string>();
  const projectPaths = new Set<string>();

  for (let i = 0; i < dirsArray.length; i += CONCURRENT_LIMIT) {
    const batch = dirsArray.slice(i, i + CONCURRENT_LIMIT);
    const batchPromises = batch.map((dir) =>
      getGeminiMdFilePathsInternalForEachDir(
        dir,
        userHomePath,
        fileService,
        folderTrust,
        fileFilteringOptions,
        maxDirs,
      ),
    );

    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        result.value.global.forEach((p) => globalPaths.add(p));
        result.value.project.forEach((p) => projectPaths.add(p));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const error = result.reason;
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Error discovering files in directory: ${message}`);
      }
    }
  }

  return {
    global: Array.from(globalPaths),
    project: Array.from(projectPaths),
  };
}

async function getGeminiMdFilePathsInternalForEachDir(
  dir: string,
  userHomePath: string,
  fileService: FileDiscoveryService,
  folderTrust: boolean,
  fileFilteringOptions: FileFilteringOptions,
  maxDirs: number,
): Promise<{ global: string[]; project: string[] }> {
  const globalPaths = new Set<string>();
  const projectPaths = new Set<string>();
  const geminiMdFilenames = getAllGeminiMdFilenames();

  for (const geminiMdFilename of geminiMdFilenames) {
    const resolvedHome = normalizePath(userHomePath);
    const globalGeminiDir = normalizePath(path.join(resolvedHome, GEMINI_DIR));
    const globalMemoryPath = normalizePath(
      path.join(globalGeminiDir, geminiMdFilename),
    );

    // This part that finds the global file always runs.
    try {
      await fs.access(globalMemoryPath, fsSync.constants.R_OK);
      globalPaths.add(globalMemoryPath);
      debugLogger.debug(
        '[DEBUG] [MemoryDiscovery] Found readable global',
        geminiMdFilename + ':',
        globalMemoryPath,
      );
    } catch {
      // It's okay if it's not found.
    }

    // FIX: Only perform the workspace search (upward and downward scans)
    // if a valid currentWorkingDirectory is provided.
    if (dir && folderTrust) {
      const resolvedCwd = normalizePath(dir);
      debugLogger.debug(
        '[DEBUG] [MemoryDiscovery] Searching for',
        geminiMdFilename,
        'starting from CWD:',
        resolvedCwd,
      );

      const projectRoot = await findProjectRoot(resolvedCwd);
      debugLogger.debug(
        '[DEBUG] [MemoryDiscovery] Determined project root:',
        projectRoot ?? 'None',
      );

      const upwardPaths: string[] = [];
      let currentDir = resolvedCwd;
      const ultimateStopDir = projectRoot
        ? normalizePath(path.dirname(projectRoot))
        : normalizePath(path.dirname(resolvedHome));

      while (
        currentDir &&
        currentDir !== normalizePath(path.dirname(currentDir))
      ) {
        if (currentDir === globalGeminiDir) {
          break;
        }

        const potentialPath = normalizePath(
          path.join(currentDir, geminiMdFilename),
        );
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

        currentDir = normalizePath(path.dirname(currentDir));
      }
      upwardPaths.forEach((p) => projectPaths.add(p));

      const mergedOptions: FileFilteringOptions = {
        ...DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
        ...fileFilteringOptions,
      };

      const downwardPaths = await bfsFileSearch(resolvedCwd, {
        fileName: geminiMdFilename,
        maxDirs,
        fileService,
        fileFilteringOptions: mergedOptions,
      });
      downwardPaths.sort();
      for (const dPath of downwardPaths) {
        projectPaths.add(normalizePath(dPath));
      }
    }
  }

  return {
    global: Array.from(globalPaths),
    project: Array.from(projectPaths),
  };
}

export async function readGeminiMdFiles(
  filePaths: string[],
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
            false,
            undefined,
            undefined,
            importFormat,
          );
          debugLogger.debug(
            '[DEBUG] [MemoryDiscovery] Successfully read and processed imports:',
            filePath,
            `(Length: ${processedResult.content.length})`,
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
          debugLogger.debug(
            '[DEBUG] [MemoryDiscovery] Failed to read:',
            filePath,
          );
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
  fileIdentities?: string[];
}

export async function getGlobalMemoryPaths(): Promise<string[]> {
  const userHome = homedir();
  const geminiMdFilenames = getAllGeminiMdFilenames();

  const accessChecks = geminiMdFilenames.map(async (filename) => {
    const globalPath = normalizePath(path.join(userHome, GEMINI_DIR, filename));
    try {
      await fs.access(globalPath, fsSync.constants.R_OK);
      debugLogger.debug(
        '[DEBUG] [MemoryDiscovery] Found global memory file:',
        globalPath,
      );
      return globalPath;
    } catch {
      return null;
    }
  });

  return (await Promise.all(accessChecks)).filter(
    (p): p is string => p !== null,
  );
}

export function getExtensionMemoryPaths(
  extensionLoader: ExtensionLoader,
): string[] {
  const extensionPaths = extensionLoader
    .getExtensions()
    .filter((ext) => ext.isActive)
    .flatMap((ext) => ext.contextFiles)
    .map((p) => normalizePath(p));

  return Array.from(new Set(extensionPaths)).sort();
}

export async function getEnvironmentMemoryPaths(
  trustedRoots: string[],
): Promise<string[]> {
  const allPaths = new Set<string>();

  // Trusted Roots Upward Traversal (Parallelized)
  const traversalPromises = trustedRoots.map(async (root) => {
    const resolvedRoot = normalizePath(root);
    debugLogger.debug(
      '[DEBUG] [MemoryDiscovery] Loading environment memory for trusted root:',
      resolvedRoot,
      '(Stopping exactly here)',
    );
    return findUpwardGeminiFiles(resolvedRoot, resolvedRoot);
  });

  const pathArrays = await Promise.all(traversalPromises);
  pathArrays.flat().forEach((p) => allPaths.add(p));

  return Array.from(allPaths).sort();
}

export function categorizeAndConcatenate(
  paths: { global: string[]; extension: string[]; project: string[] },
  contentsMap: Map<string, GeminiFileContent>,
  workingDir: string,
): HierarchicalMemory {
  const getConcatenated = (pList: string[]) =>
    concatenateInstructions(
      pList
        .map((p) => contentsMap.get(p))
        .filter((c): c is GeminiFileContent => !!c),
      workingDir,
    );

  return {
    global: getConcatenated(paths.global),
    extension: getConcatenated(paths.extension),
    project: getConcatenated(paths.project),
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
): Promise<string[]> {
  const upwardPaths: string[] = [];
  let currentDir = normalizePath(startDir);
  const resolvedStopDir = normalizePath(stopDir);
  const geminiMdFilenames = getAllGeminiMdFilenames();
  const globalGeminiDir = normalizePath(path.join(homedir(), GEMINI_DIR));

  debugLogger.debug(
    '[DEBUG] [MemoryDiscovery] Starting upward search from',
    currentDir,
    'stopping at',
    resolvedStopDir,
  );

  while (true) {
    if (currentDir === globalGeminiDir) {
      break;
    }

    // Parallelize checks for all filename variants in the current directory
    const accessChecks = geminiMdFilenames.map(async (filename) => {
      const potentialPath = normalizePath(path.join(currentDir, filename));
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

    const parentDir = normalizePath(path.dirname(currentDir));
    if (currentDir === resolvedStopDir || currentDir === parentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return upwardPaths;
}

export interface LoadServerHierarchicalMemoryResponse {
  memoryContent: HierarchicalMemory;
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
  fileService: FileDiscoveryService,
  extensionLoader: ExtensionLoader,
  folderTrust: boolean,
  importFormat: 'flat' | 'tree' = 'tree',
  fileFilteringOptions?: FileFilteringOptions,
  maxDirs: number = 200,
): Promise<LoadServerHierarchicalMemoryResponse> {
  // FIX: Use real, canonical paths for a reliable comparison to handle symlinks.
  const realCwd = normalizePath(
    await fs.realpath(path.resolve(currentWorkingDirectory)),
  );
  const realHome = normalizePath(await fs.realpath(path.resolve(homedir())));
  const isHomeDirectory = realCwd === realHome;

  // If it is the home directory, pass an empty string to the core memory
  // function to signal that it should skip the workspace search.
  currentWorkingDirectory = isHomeDirectory ? '' : currentWorkingDirectory;

  debugLogger.debug(
    '[DEBUG] [MemoryDiscovery] Loading server hierarchical memory for CWD:',
    currentWorkingDirectory,
    `(importFormat: ${importFormat})`,
  );

  // For the server, homedir() refers to the server process's home.
  // This is consistent with how MemoryTool already finds the global path.
  const userHomePath = homedir();

  // 1. SCATTER: Gather all paths
  const [discoveryResult, extensionPaths] = await Promise.all([
    getGeminiMdFilePathsInternal(
      currentWorkingDirectory,
      includeDirectoriesToReadGemini,
      userHomePath,
      fileService,
      folderTrust,
      fileFilteringOptions || DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
      maxDirs,
    ),
    Promise.resolve(getExtensionMemoryPaths(extensionLoader)),
  ]);

  const allFilePathsStringDeduped = Array.from(
    new Set([
      ...discoveryResult.global,
      ...discoveryResult.project,
      ...extensionPaths,
    ]),
  );

  if (allFilePathsStringDeduped.length === 0) {
    debugLogger.debug(
      '[DEBUG] [MemoryDiscovery] No GEMINI.md files found in hierarchy of the workspace.',
    );
    return {
      memoryContent: { global: '', extension: '', project: '' },
      fileCount: 0,
      filePaths: [],
    };
  }

  // deduplicate by file identity to handle case-insensitive filesystems
  const { paths: allFilePaths } = await deduplicatePathsByFileIdentity(
    allFilePathsStringDeduped,
  );

  if (allFilePaths.length === 0) {
    debugLogger.debug(
      '[DEBUG] [MemoryDiscovery] No unique GEMINI.md files found after deduplication by file identity.',
    );
    return {
      memoryContent: { global: '', extension: '', project: '' },
      fileCount: 0,
      filePaths: [],
    };
  }

  // 2. GATHER: Read all files in parallel
  const allContents = await readGeminiMdFiles(allFilePaths, importFormat);
  const contentsMap = new Map(allContents.map((c) => [c.filePath, c]));

  // 3. CATEGORIZE: Back into Global, Project, Extension
  const hierarchicalMemory = categorizeAndConcatenate(
    {
      global: discoveryResult.global,
      extension: extensionPaths,
      project: discoveryResult.project,
    },
    contentsMap,
    currentWorkingDirectory,
  );

  return {
    memoryContent: hierarchicalMemory,
    fileCount: allContents.filter((c) => c.content !== null).length,
    filePaths: allFilePaths,
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
    config.getFileService(),
    config.getExtensionLoader(),
    config.isTrustedFolder(),
    config.getImportFormat(),
    config.getFileFilteringOptions(),
    config.getDiscoveryMaxDirs(),
  );
  const mcpInstructions =
    config.getMcpClientManager()?.getMcpInstructions() || '';
  const finalMemory: HierarchicalMemory = {
    ...result.memoryContent,
    project: [result.memoryContent.project, mcpInstructions.trimStart()]
      .filter(Boolean)
      .join('\n\n'),
  };
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
  alreadyLoadedIdentities?: Set<string>,
): Promise<MemoryLoadResult> {
  const resolvedTarget = normalizePath(targetPath);
  let bestRoot: string | null = null;

  // Find the deepest trusted root that contains the target path
  for (const root of trustedRoots) {
    const resolvedRoot = normalizePath(root);
    const resolvedRootWithTrailing = resolvedRoot.endsWith(path.sep)
      ? resolvedRoot
      : resolvedRoot + path.sep;

    if (
      resolvedTarget === resolvedRoot ||
      resolvedTarget.startsWith(resolvedRootWithTrailing)
    ) {
      if (!bestRoot || resolvedRoot.length > bestRoot.length) {
        bestRoot = resolvedRoot;
      }
    }
  }

  if (!bestRoot) {
    debugLogger.debug(
      '[DEBUG] [MemoryDiscovery] JIT memory skipped:',
      resolvedTarget,
      'is not in any trusted root.',
    );
    return { files: [], fileIdentities: [] };
  }

  debugLogger.debug(
    '[DEBUG] [MemoryDiscovery] Loading JIT memory for',
    resolvedTarget,
    `(Trusted root: ${bestRoot})`,
  );

  // Resolve the target to a directory before traversing upward.
  // When the target is a file (e.g. /app/src/file.ts), start from its
  // parent directory to avoid a wasted fs.access check on a nonsensical
  // path like /app/src/file.ts/GEMINI.md.
  let startDir = resolvedTarget;
  try {
    const stat = await fs.stat(resolvedTarget);
    if (stat.isFile()) {
      startDir = normalizePath(path.dirname(resolvedTarget));
    }
  } catch {
    // If stat fails (e.g. file doesn't exist yet for write_file),
    // assume it's a file path and use its parent directory.
    startDir = normalizePath(path.dirname(resolvedTarget));
  }

  // Traverse from the resolved directory up to the trusted root
  const potentialPaths = await findUpwardGeminiFiles(startDir, bestRoot);

  if (potentialPaths.length === 0) {
    return { files: [], fileIdentities: [] };
  }

  // deduplicate by file identity to handle case-insensitive filesystems
  // this deduplicates within the current batch
  const { paths: deduplicatedNewPaths, identityMap: newPathsIdentityMap } =
    await deduplicatePathsByFileIdentity(potentialPaths);

  // Use cached file identities if provided, otherwise build from paths
  // This avoids redundant fs.stat() calls on already loaded files
  const cachedIdentities = alreadyLoadedIdentities ?? new Set<string>();
  if (!alreadyLoadedIdentities && alreadyLoadedPaths.size > 0) {
    const CONCURRENT_LIMIT = 20;
    const alreadyLoadedArray = Array.from(alreadyLoadedPaths);

    for (let i = 0; i < alreadyLoadedArray.length; i += CONCURRENT_LIMIT) {
      const batch = alreadyLoadedArray.slice(i, i + CONCURRENT_LIMIT);
      const batchPromises = batch.map(async (filePath) => {
        try {
          const stats = await fs.stat(filePath);
          const identityKey = `${stats.dev.toString()}:${stats.ino.toString()}`;
          cachedIdentities.add(identityKey);
        } catch {
          // ignore errors - if we can't stat it, we can't deduplicate by identity
        }
      });
      // Await each batch to properly limit concurrency and prevent EMFILE errors
      await Promise.allSettled(batchPromises);
    }
  }

  // filter out paths that match already loaded files by identity
  // reuse the identities from deduplicatePathsByFileIdentity to avoid redundant stat calls
  const newPaths: string[] = [];
  const newFileIdentities: string[] = [];
  for (const filePath of deduplicatedNewPaths) {
    const identityKey = newPathsIdentityMap.get(filePath);
    if (identityKey && cachedIdentities.has(identityKey)) {
      debugLogger.debug(
        '[DEBUG] [MemoryDiscovery] jit memory: skipping',
        filePath,
        '(already loaded with different case)',
      );
      continue;
    }
    // if we don't have an identity (stat failed), include it to be safe
    newPaths.push(filePath);
    if (identityKey) {
      newFileIdentities.push(identityKey);
    }
  }

  if (newPaths.length === 0) {
    return { files: [], fileIdentities: [] };
  }

  debugLogger.debug(
    '[DEBUG] [MemoryDiscovery] Found new JIT memory files:',
    JSON.stringify(newPaths),
  );

  const contents = await readGeminiMdFiles(newPaths, 'tree');

  return {
    files: contents
      .filter((item) => item.content !== null)
      .map((item) => ({
        path: item.filePath,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        content: item.content as string,
      })),
    fileIdentities: newFileIdentities,
  };
}
