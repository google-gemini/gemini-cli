/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as fsSync from 'fs';

// Simple console logger for import processing
const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) =>
    console.debug('[DEBUG] [ImportProcessor]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (...args: any[]) => console.warn('[WARN] [ImportProcessor]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) =>
    console.error('[ERROR] [ImportProcessor]', ...args),
};

/**
 * Interface for tracking import processing state to prevent circular imports
 */
interface ImportState {
  processedFiles: Set<string>;
  maxDepth: number;
  currentDepth: number;
  currentFile?: string; // Track the current file being processed
}

// Helper to find all code block and inline code regions
function findCodeRegions(content: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  const codeBlockRegex = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    regions.push([match.index, match.index + match[0].length]);
  }
  // Inline code (single backticks, not inside code blocks)
  const inlineCodeRegex = /`[^`\n]+`/g;
  while ((match = inlineCodeRegex.exec(content)) !== null) {
    // Only add if not inside a code block
    if (
      !regions.some(
        ([start, end]) => match!.index >= start && match!.index < end,
      )
    ) {
      regions.push([match.index, match.index + match[0].length]);
    }
  }
  return regions;
}

// Helper to find the project root (looks for .git directory)
async function findProjectRoot(startDir: string): Promise<string> {
  let currentDir = path.resolve(startDir);
  while (true) {
    const gitPath = path.join(currentDir, '.git');
    if (fsSync.existsSync(gitPath)) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached filesystem root
      break;
    }
    currentDir = parentDir;
  }
  // Fallback to startDir if .git not found
  return path.resolve(startDir);
}

/**
 * Processes import statements in GEMINI.md content
 * Supports @path/to/file syntax for importing content from other files
 *
 * @param content - The content to process for imports
 * @param basePath - The directory path where the current file is located
 * @param debugMode - Whether to enable debug logging
 * @param importState - State tracking for circular import prevention
 * @param projectRoot - The project root directory for allowed directories
 * @returns Processed content with imports resolved
 */
export async function processImports(
  content: string,
  basePath: string,
  debugMode: boolean = false,
  importState: ImportState = {
    processedFiles: new Set(),
    maxDepth: 5,
    currentDepth: 0,
  },
  projectRoot?: string,
): Promise<string> {
  if (!projectRoot) {
    projectRoot = await findProjectRoot(basePath);
  }
  if (importState.currentDepth >= importState.maxDepth) {
    if (debugMode) {
      logger.warn(
        `Maximum import depth (${importState.maxDepth}) reached. Stopping import processing.`,
      );
    }
    return content;
  }

  const importRegex = /@([./]?[^\s\n]+)/g;
  const codeRegions = findCodeRegions(content);
  let lastIndex = 0;
  const resultParts: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(content)) !== null) {
    const idx = match.index;
    // Add content before this match
    resultParts.push(content.substring(lastIndex, idx));
    lastIndex = importRegex.lastIndex;

    // Skip if inside a code region
    if (codeRegions.some(([start, end]) => idx >= start && idx < end)) {
      resultParts.push(match[0]);
      continue;
    }
    const importPath = match[1];

    // Validate import path to prevent path traversal attacks
    if (!validateImportPath(importPath, basePath, [projectRoot])) {
      resultParts.push(
        `<!-- Import failed: ${importPath} - Path traversal attempt -->`,
      );
      continue;
    }

    const fullPath = path.resolve(basePath, importPath);

    if (debugMode) {
      logger.debug(`Processing import: ${importPath} -> ${fullPath}`);
    }

    // Check for circular imports - if we've already processed this file in this import chain
    if (importState.processedFiles.has(fullPath)) {
      if (debugMode) {
        logger.warn(`File already processed in this chain: ${importPath}`);
      }
      resultParts.push(`<!-- File already processed: ${importPath} -->`);
      continue;
    }

    try {
      await fs.access(fullPath);
      const importedContent = await fs.readFile(fullPath, 'utf-8');
      if (debugMode) {
        logger.debug(`Successfully read imported file: ${fullPath}`);
      }
      const processedImportedContent = await processImports(
        importedContent,
        path.dirname(fullPath),
        debugMode,
        {
          ...importState,
          processedFiles: new Set([...importState.processedFiles, fullPath]),
          currentDepth: importState.currentDepth + 1,
          currentFile: fullPath,
        },
        projectRoot,
      );
      resultParts.push(
        `<!-- Imported from: ${importPath} -->\n${processedImportedContent}\n<!-- End of import from: ${importPath} -->`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (debugMode) {
        logger.error(`Failed to import ${importPath}: ${errorMessage}`);
      }
      resultParts.push(
        `<!-- Import failed: ${importPath} - ${errorMessage} -->`,
      );
    }
  }
  // Add any remaining content after the last match
  resultParts.push(content.substring(lastIndex));
  return resultParts.join('');
}

/**
 * Validates import paths to ensure they are safe and within allowed directories
 *
 * @param importPath - The import path to validate
 * @param basePath - The base directory for resolving relative paths
 * @param allowedDirectories - Array of allowed directory paths
 * @returns Whether the import path is valid
 */
export function validateImportPath(
  importPath: string,
  basePath: string,
  allowedDirectories: string[],
): boolean {
  // Reject URLs
  if (/^(file|https?):\/\//.test(importPath)) {
    return false;
  }

  const resolvedPath = path.resolve(basePath, importPath);

  return allowedDirectories.some((allowedDir) => {
    const normalizedAllowedDir = path.resolve(allowedDir);
    return resolvedPath.startsWith(normalizedAllowedDir);
  });
}
