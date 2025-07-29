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
import {
  ImportNode,
  MemorySource,
  processImports,
} from './memoryImportProcessor.js';
import {
  DEFAULT_MEMORY_FILE_FILTERING_OPTIONS,
  FileFilteringOptions,
} from '../config/config.js';

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
  importTree: ImportNode | null;
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
      const isENOENT =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'ENOENT';

      const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST;

      if (!isENOENT && !isTestEnv) {
        if (typeof error === 'object' && error !== null && 'code' in error) {
          const fsError = error as { code: string; message: string };
          logger.warn(
            `Error checking for .git directory at ${gitPath}: ${fsError.message}`,
          );
        } else {
          logger.warn(
            `Non-standard error checking for .git directory at ${gitPath}: ${String(
              error,
            )}`,
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
    const ultimateStopDir = projectRoot
      ? path.dirname(projectRoot)
      : path.dirname(resolvedHome);

    while (currentDir && currentDir !== path.dirname(currentDir)) {
      if (debugMode) {
        logger.debug(
          `Checking for ${geminiMdFilename} in (upward scan): ${currentDir}`,
        );
      }

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

    const mergedOptions = {
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
    if (debugMode && downwardPaths.length > 0)
      logger.debug(
        `Found downward ${geminiMdFilename} files (sorted): ${JSON.stringify(
          downwardPaths,
        )}`,
      );
    for (const dPath of downwardPaths) {
      allPaths.add(dPath);
    }
  }

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
  rootPath: string,
  debugMode: boolean,
): Promise<GeminiFileContent[]> {
  const results: GeminiFileContent[] = [];
  for (const filePath of filePaths) {
    try {
      const { content, importTree } = await processImports(
        filePath,
        rootPath,
        debugMode,
      );

      results.push({ filePath, content, importTree });
      if (debugMode)
        logger.debug(
          `Successfully read and processed imports: ${filePath} (Length: ${content.length})`,
        );
    } catch (error: unknown) {
      const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST;
      if (!isTestEnv) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(
          `Warning: Could not read ${getAllGeminiMdFilenames()} file at ${filePath}. Error: ${message}`,
        );
      }
      results.push({ filePath, content: null, importTree: null });
      if (debugMode) logger.debug(`Failed to read: ${filePath}`);
    }
  }
  return results;
}

function concatenateInstructions(
  instructionContents: GeminiFileContent[],
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

export interface HierarchicalMemory {
  memoryContent: string;
  fileCount: number;
  sources: MemorySource[];
}

export async function loadServerHierarchicalMemory(
  currentWorkingDirectory: string,
  debugMode: boolean,
  fileService: FileDiscoveryService,
  extensionContextFilePaths: string[] = [],
  fileFilteringOptions?: FileFilteringOptions,
  maxDirs: number = 200,
): Promise<HierarchicalMemory> {
  if (debugMode)
    logger.debug(
      `Loading server hierarchical memory for CWD: ${currentWorkingDirectory}`,
    );

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

  const projectRoot = await findProjectRoot(currentWorkingDirectory);
  if (!projectRoot) {
    if (debugMode)
      logger.debug(
        'Could not determine project root. Using CWD as root for imports.',
      );
  }
  const rootPath = projectRoot || currentWorkingDirectory;

  if (filePaths.length === 0) {
    if (debugMode) logger.debug('No GEMINI.md files found in hierarchy.');
    return { memoryContent: '', fileCount: 0, sources: [] };
  }

  const contentsWithPaths = await readGeminiMdFiles(
    filePaths,
    rootPath,
    debugMode,
  );

  const combinedInstructions = concatenateInstructions(
    contentsWithPaths,
    currentWorkingDirectory,
  );

  const sources: MemorySource[] = contentsWithPaths.map((item) => ({
    filePath: item.filePath,
    importTree: item.importTree,
  }));

  if (debugMode)
    logger.debug(
      `Combined instructions length: ${combinedInstructions.length}`,
    );
  if (debugMode && combinedInstructions.length > 0)
    logger.debug(
      `Combined instructions (snippet): ${combinedInstructions.substring(
        0,
        500,
      )}...`,
    );

  return {
    memoryContent: combinedInstructions,
    fileCount: filePaths.length,
    sources,
  };
}
