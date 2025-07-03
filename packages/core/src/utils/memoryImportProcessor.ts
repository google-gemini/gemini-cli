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

// Helper to find the project root (looks for .git directory)
function findProjectRoot(startDir: string): string {
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

// Add a type guard for error objects
function hasMessage(err: unknown): err is { message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string'
  );
}

// Helper to find all code block and inline code regions
function findCodeRegions(content: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  // Fenced code blocks (``` or ~~~, any number of backticks/tilde)
  const codeBlockRegex = /(^|\n)([`~]{3,})([\s\S]*?)(\2)(?=\n|$)/g;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    regions.push([match.index, match.index + match[0].length]);
  }
  // Indented code blocks (4 spaces or 1 tab at line start)
  const indentedBlockRegex = /(^|\n)(( {4})|\t)[^\n]*(\n(( {4})|\t)[^\n]*)+/g;
  while ((match = indentedBlockRegex.exec(content)) !== null) {
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

/**
 * Processes import statements in GEMINI.md content
 * Supports @path/to/file syntax for importing content from other files
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

  const importRegex = /(?<!\S)@([./]?[^\s\n]+)/g;
  const codeRegions = findCodeRegions(content);
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const idx = match.index;
    // Add content before this match
    result += content.substring(lastIndex, idx);
    lastIndex = importRegex.lastIndex;
    // Skip if inside a code region
    if (codeRegions.some(([start, end]) => idx >= start && idx < end)) {
      result += match[0];
      continue;
    }
    const importPath = match[1];
    // Validate import path to prevent path traversal attacks
    if (!validateImportPath(importPath, basePath, [projectRoot || ''])) {
      result += `<!-- Import failed: ${importPath} - Path traversal attempt -->`;
      continue;
    }
    const fullPath = path.resolve(basePath, importPath);
    if (importState.processedFiles.has(fullPath)) {
      result += `<!-- File already processed: ${importPath} -->`;
      continue;
    }
    try {
      await fs.access(fullPath);
      const fileContent = await fs.readFile(fullPath, 'utf-8');
      // Mark this file as processed for this import chain
      const newImportState: ImportState = {
        ...importState,
        processedFiles: new Set(importState.processedFiles),
        currentDepth: importState.currentDepth + 1,
        currentFile: fullPath,
      };
      newImportState.processedFiles.add(fullPath);
      const imported = await processImports(
        fileContent,
        path.dirname(fullPath),
        debugMode,
        newImportState,
        projectRoot,
      );
      result += `<!-- Imported from: ${importPath} -->\n${imported}\n<!-- End of import from: ${importPath} -->`;
    } catch (err: unknown) {
      let message = 'Unknown error';
      if (hasMessage(err)) {
        message = err.message;
      } else if (typeof err === 'string') {
        message = err;
      }
      logger.error(`Failed to import ${importPath}: ${message}`);
      result += `<!-- Import failed: ${importPath} - ${message} -->`;
    }
  }
  // Add any remaining content after the last match
  result += content.substring(lastIndex);
  return result;
}

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
