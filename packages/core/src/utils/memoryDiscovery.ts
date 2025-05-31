/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import {
  GEMINI_CONFIG_DIR,
  getCurrentGeminiMdFilename,
} from '../tools/memoryTool.js';

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

const MAX_DIRECTORIES_TO_SCAN_FOR_MEMORY = 200;

interface GeminiFileContent {
  filePath: string;
  content: string | null;
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
  scannedDirCount: { count: number },
  maxScanDirs: number,
): Promise<string[]> {
  if (scannedDirCount.count >= maxScanDirs) {
    if (debugMode)
      logger.debug(
        `Max directory scan limit (${maxScanDirs}) reached. Stopping downward scan at: ${directory}`,
      );
    return [];
  }
  scannedDirCount.count++;

  if (debugMode)
    logger.debug(
      `Scanning downward for ${getCurrentGeminiMdFilename()} files in: ${directory} (scanned: ${scannedDirCount.count}/${maxScanDirs})`,
    );
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
          scannedDirCount,
          maxScanDirs,
        );
        collectedPaths.push(...subDirPaths);
      } else if (
        entry.isFile() &&
        entry.name === getCurrentGeminiMdFilename()
      ) {
        try {
          await fs.access(fullPath, fsSync.constants.R_OK);
          collectedPaths.push(fullPath);
          if (debugMode)
            logger.debug(
              `Found readable downward ${getCurrentGeminiMdFilename()}: ${fullPath}`,
            );
        } catch {
          if (debugMode)
            logger.debug(
              `Downward ${getCurrentGeminiMdFilename()} not readable, skipping: ${fullPath}`,
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

async function getGeminiMdFilePathsInternal(
  currentWorkingDirectory: string,
  userHomePath: string,
  debugMode: boolean,
): Promise<string[]> {
  const resolvedCwd = path.resolve(currentWorkingDirectory);
  const resolvedHome = path.resolve(userHomePath);
  const globalMemoryPath = path.join(
    resolvedHome,
    GEMINI_CONFIG_DIR,
    getCurrentGeminiMdFilename(),
  );
  const paths: string[] = [];

  if (debugMode)
    logger.debug(
      `Searching for ${getCurrentGeminiMdFilename()} starting from CWD: ${resolvedCwd}`,
    );
  if (debugMode) logger.debug(`User home directory: ${resolvedHome}`);

  try {
    await fs.access(globalMemoryPath, fsSync.constants.R_OK);
    paths.push(globalMemoryPath);
    if (debugMode)
      logger.debug(
        `Found readable global ${getCurrentGeminiMdFilename()}: ${globalMemoryPath}`,
      );
  } catch {
    if (debugMode)
      logger.debug(
        `Global ${getCurrentGeminiMdFilename()} not found or not readable: ${globalMemoryPath}`,
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
        `Checking for ${getCurrentGeminiMdFilename()} in (upward scan): ${currentDir}`,
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

    const potentialPath = path.join(currentDir, getCurrentGeminiMdFilename());
    try {
      await fs.access(potentialPath, fsSync.constants.R_OK);
      // Add to upwardPaths only if it's not the already added globalMemoryPath
      if (potentialPath !== globalMemoryPath) {
        upwardPaths.unshift(potentialPath);
        if (debugMode) {
          logger.debug(
            `Found readable upward ${getCurrentGeminiMdFilename()}: ${potentialPath}`,
          );
        }
      }
    } catch {
      if (debugMode) {
        logger.debug(
          `Upward ${getCurrentGeminiMdFilename()} not found or not readable in: ${currentDir}`,
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
  paths.push(...upwardPaths);

  if (debugMode)
    logger.debug(`Starting downward scan from CWD: ${resolvedCwd}`);
  const scannedDirCount = { count: 0 };
  const downwardPaths = await collectDownwardGeminiFiles(
    resolvedCwd,
    debugMode,
    DEFAULT_IGNORE_DIRECTORIES,
    scannedDirCount,
    MAX_DIRECTORIES_TO_SCAN_FOR_MEMORY,
  );
  downwardPaths.sort(); // Sort for consistent ordering, though hierarchy might be more complex
  if (debugMode && downwardPaths.length > 0)
    logger.debug(
      `Found downward ${getCurrentGeminiMdFilename()} files (sorted): ${JSON.stringify(downwardPaths)}`,
    );
  // Add downward paths only if they haven't been included already (e.g. from upward scan)
  for (const dPath of downwardPaths) {
    if (!paths.includes(dPath)) {
      paths.push(dPath);
    }
  }

  if (debugMode)
    logger.debug(
      `Final ordered ${getCurrentGeminiMdFilename()} paths to read: ${JSON.stringify(paths)}`,
    );
  return paths;
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
        `Warning: Could not read ${getCurrentGeminiMdFilename()} file at ${filePath}. Error: ${message}`,
      );
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
): Promise<{ memoryContent: string; fileCount: number }> {
  if (debugMode)
    logger.debug(
      `Loading server hierarchical memory for CWD: ${currentWorkingDirectory}`,
    );
  // For the server, homedir() refers to the server process's home.
  // This is consistent with how MemoryTool already finds the global path.
  const userHomePath = homedir();
  const filePaths = await getGeminiMdFilePathsInternal(
    currentWorkingDirectory,
    userHomePath,
    debugMode,
  );
  if (filePaths.length === 0) {
    if (debugMode) logger.debug('No GEMINI.md files found in hierarchy.');
    return { memoryContent: '', fileCount: 0 };
  }
  const contentsWithPaths = await readGeminiMdFiles(filePaths, debugMode);
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
