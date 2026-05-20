/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import {
  getAllGeminiMdFilenames,
  PROJECT_MEMORY_INDEX_FILENAME,
} from '../tools/memoryTool.js';
import { processImports } from './memoryImportProcessor.js';
import {
  GEMINI_DIR,
  homedir,
  isSubpath,
  normalizePath,
  toAbsolutePath,
} from './paths.js';
import type { ExtensionLoader } from './extensionLoader.js';
import { debugLogger } from './debugLogger.js';
import type { HierarchicalMemory } from '../config/memory.js';
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

async function findProjectRoot(
  startDir: string,
  boundaryMarkers: readonly string[] = ['.git'],
): Promise<string | null> {
  if (boundaryMarkers.length === 0) {
    return null;
  }

  let currentDir = toAbsolutePath(startDir);
  while (true) {
    for (const marker of boundaryMarkers) {
      // Sanitize: skip markers with path traversal or absolute paths
      if (path.isAbsolute(marker) || marker.includes('..')) {
        continue;
      }
      const markerPath = path.join(currentDir, marker);
      try {
        // Check for existence only — marker can be a directory (normal repos)
        // or a file (submodules / worktrees).
        await fs.access(markerPath);
        return currentDir;
      } catch (error: unknown) {
        // Don't log ENOENT errors as they're expected when marker doesn't exist
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
              `Error checking for ${marker} at ${markerPath}: ${fsError.message}`,
            );
          } else {
            logger.warn(
              `Non-standard error checking for ${marker} at ${markerPath}: ${String(error)}`,
            );
          }
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

export async function readGeminiMdFiles(
  filePaths: string[],
  importFormat: 'flat' | 'tree' = 'tree',
  boundaryMarkers: readonly string[] = ['.git'],
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
            boundaryMarkers,
          );
          debugLogger.debug(
            '[DEBUG] [MemoryDiscovery] Successfully read and processed imports:',
            filePath,
            `(Length: ${processedResult.content.length})`,
          );

          return { filePath, content: processedResult.content };
        } catch (error: unknown) {
          const isEISDIR =
            error instanceof Error &&
            (error as NodeJS.ErrnoException).code === 'EISDIR';

          if (isEISDIR) {
            // A directory exists where a GEMINI.md file is expected.
            // This is valid in some project structures (e.g. a folder named
            // GEMINI.md held for organisational purposes) — skip it silently
            // instead of surfacing a confusing warning to the user.
            debugLogger.debug(
              '[DEBUG] [MemoryDiscovery] Skipping directory at GEMINI.md path:',
              filePath,
            );
          } else {
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
          }
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
): string {
  return instructionContents
    .filter((item) => typeof item.content === 'string')
    .map((item) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const trimmedContent = (item.content as string).trim();
      if (trimmedContent.length === 0) {
        return null;
      }
      return `--- Context from: ${item.filePath} ---\n${trimmedContent}\n--- End of Context from: ${item.filePath} ---`;
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
    const globalPath = toAbsolutePath(
      path.join(userHome, GEMINI_DIR, filename),
    );
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

export async function getUserProjectMemoryPaths(
  projectMemoryDir: string,
): Promise<string[]> {
  const preferredMemoryPath = toAbsolutePath(
    path.join(projectMemoryDir, PROJECT_MEMORY_INDEX_FILENAME),
  );

  try {
    await fs.access(preferredMemoryPath, fsSync.constants.R_OK);
    debugLogger.debug(
      '[DEBUG] [MemoryDiscovery] Found user project memory index:',
      preferredMemoryPath,
    );
    return [preferredMemoryPath];
  } catch {
    // Fall back to the legacy private GEMINI.md file if the project has not
    // been migrated to MEMORY.md yet.
  }

  const geminiMdFilenames = getAllGeminiMdFilenames();
  const accessChecks = geminiMdFilenames.map(async (filename) => {
    const legacyMemoryPath = toAbsolutePath(
      path.join(projectMemoryDir, filename),
    );
    try {
      await fs.access(legacyMemoryPath, fsSync.constants.R_OK);
      debugLogger.debug(
        '[DEBUG] [MemoryDiscovery] Found legacy user project memory file:',
        legacyMemoryPath,
      );
      return legacyMemoryPath;
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
    .map((p) => toAbsolutePath(p));

  // Deduplicate case-insensitively (so macOS/Windows don't keep two casings of
  // the same file) while preserving the first encountered casing for display.
  const seenKeys = new Set<string>();
  const unique: string[] = [];
  for (const p of extensionPaths) {
    const key = normalizePath(p);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    unique.push(p);
  }
  return unique.sort();
}

export async function getEnvironmentMemoryPaths(
  trustedRoots: string[],
  boundaryMarkers: readonly string[] = ['.git'],
): Promise<string[]> {
  // Trusted Roots Upward Traversal (Parallelized)
  const traversalPromises = trustedRoots.map(async (root) => {
    const resolvedRoot = toAbsolutePath(root);
    const gitRoot = await findProjectRoot(resolvedRoot, boundaryMarkers);
    const ceiling = gitRoot ?? resolvedRoot;
    debugLogger.debug(
      '[DEBUG] [MemoryDiscovery] Loading environment memory for trusted root:',
      resolvedRoot,
      '(Stopping at',
      gitRoot
        ? `git root: ${ceiling})`
        : `trusted root: ${ceiling} — no git root found)`,
    );
    return findUpwardGeminiFiles(resolvedRoot, ceiling);
  });

  const pathArrays = await Promise.all(traversalPromises);

  const { paths: unique } = await deduplicatePathsByFileIdentity(
    pathArrays.flat(),
  );
  return unique.sort();
}

export function categorizeAndConcatenate(
  paths: {
    global: string[];
    extension: string[];
    project: string[];
    userProjectMemory?: string[];
  },
  contentsMap: Map<string, GeminiFileContent>,
): HierarchicalMemory {
  const getConcatenated = (pList: string[]) =>
    concatenateInstructions(
      pList
        .map((p) => contentsMap.get(p))
        .filter((c): c is GeminiFileContent => !!c),
    );

  return {
    global: getConcatenated(paths.global),
    extension: getConcatenated(paths.extension),
    project: getConcatenated(paths.project),
    userProjectMemory: getConcatenated(paths.userProjectMemory ?? []),
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
  let currentDir = toAbsolutePath(startDir);
  const resolvedStopDirKey = normalizePath(stopDir);
  const geminiMdFilenames = getAllGeminiMdFilenames();
  const globalGeminiDirKey = normalizePath(path.join(homedir(), GEMINI_DIR));

  debugLogger.debug(
    '[DEBUG] [MemoryDiscovery] Starting upward search from',
    currentDir,
    'stopping at',
    stopDir,
  );

  while (true) {
    if (normalizePath(currentDir) === globalGeminiDirKey) {
      break;
    }

    // Parallelize checks for all filename variants in the current directory
    const accessChecks = geminiMdFilenames.map(async (filename) => {
      const potentialPath = toAbsolutePath(path.join(currentDir, filename));
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

    const parentDir = path.dirname(currentDir);
    const currentKey = normalizePath(currentDir);
    if (currentKey === resolvedStopDirKey || currentDir === parentDir) {
      break;
    }
    currentDir = parentDir;
  }
  return upwardPaths;
}

export async function loadJitSubdirectoryMemory(
  targetPath: string,
  trustedRoots: string[],
  alreadyLoadedPaths: Set<string>,
  alreadyLoadedIdentities?: Set<string>,
  boundaryMarkers: readonly string[] = ['.git'],
): Promise<MemoryLoadResult> {
  const resolvedTarget = toAbsolutePath(targetPath);
  let bestRoot: string | null = null;
  let bestRootKeyLength = -1;

  // Find the deepest trusted root that contains the target path
  for (const root of trustedRoots) {
    if (isSubpath(root, targetPath)) {
      const resolvedRoot = toAbsolutePath(root);
      const rootKeyLength = normalizePath(resolvedRoot).length;
      if (rootKeyLength > bestRootKeyLength) {
        bestRoot = resolvedRoot;
        bestRootKeyLength = rootKeyLength;
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

  // Find the git root to use as the traversal ceiling.
  // If no git root exists, fall back to the trusted root as the ceiling.
  const gitRoot = await findProjectRoot(bestRoot, boundaryMarkers);
  const resolvedCeiling = gitRoot ?? bestRoot;

  debugLogger.debug(
    '[DEBUG] [MemoryDiscovery] Loading JIT memory for',
    resolvedTarget,
    `(Trusted root: ${bestRoot}, Ceiling: ${resolvedCeiling}${gitRoot ? ' [git root]' : ' [trusted root, no git]'})`,
  );

  // Resolve the target to a directory before traversing upward.
  // When the target is a file (e.g. /app/src/file.ts), start from its
  // parent directory to avoid a wasted fs.access check on a nonsensical
  // path like /app/src/file.ts/GEMINI.md.
  let startDir = resolvedTarget;
  try {
    const stat = await fs.stat(resolvedTarget);
    if (stat.isFile()) {
      startDir = path.dirname(resolvedTarget);
    }
  } catch {
    // If stat fails (e.g. file doesn't exist yet for write_file),
    // assume it's a file path and use its parent directory.
    startDir = path.dirname(resolvedTarget);
  }

  // Traverse from the resolved directory up to the ceiling
  const potentialPaths = await findUpwardGeminiFiles(startDir, resolvedCeiling);

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

  const contents = await readGeminiMdFiles(newPaths, 'tree', boundaryMarkers);

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
