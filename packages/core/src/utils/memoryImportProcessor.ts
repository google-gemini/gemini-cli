/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';

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

/**
 * Processes import statements in GEMINI.md content
 * Supports @path/to/file.md syntax for importing content from other files
 *
 * @param content - The content to process for imports
 * @param basePath - The directory path where the current file is located
 * @param debugMode - Whether to enable debug logging
 * @param importState - State tracking for circular import prevention
 * @returns Processed content with imports resolved
 */
export async function processImports(
  content: string,
  basePath: string,
  debugMode: boolean = false,
  importState: ImportState = {
    processedFiles: new Set(),
    maxDepth: 10,
    currentDepth: 0,
  },
): Promise<string> {
  if (importState.currentDepth >= importState.maxDepth) {
    if (debugMode) {
      logger.warn(
        `Maximum import depth (${importState.maxDepth}) reached. Stopping import processing.`,
      );
    }
    return content;
  }

  // Regex to match @path/to/file imports (supports any file extension)
  // Supports both @path/to/file.md and @./path/to/file.md syntax
  const importRegex = /@([./]?[^\s\n]+\.[^\s\n]+)/g;

  let processedContent = content;
  let match: RegExpExecArray | null;

  // Process all imports in the content
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];

    // Validate import path to prevent path traversal attacks
    if (!validateImportPath(importPath, basePath, [basePath])) {
      processedContent = processedContent.replace(
        match[0],
        `<!-- Import failed: ${importPath} - Path traversal attempt -->`,
      );
      continue;
    }

    // Check if the import is for a non-md file and warn
    if (!importPath.endsWith('.md')) {
      logger.warn(
        `Import processor only supports .md files. Attempting to import non-md file: ${importPath}. This will fail.`,
      );
      // Replace the import with a warning comment
      processedContent = processedContent.replace(
        match[0],
        `<!-- Import failed: ${importPath} - Only .md files are supported -->`,
      );
      continue;
    }

    const fullPath = path.resolve(basePath, importPath);

    if (debugMode) {
      logger.debug(`Processing import: ${importPath} -> ${fullPath}`);
    }

    // Check for circular imports - if we're already processing this file
    if (importState.currentFile === fullPath) {
      if (debugMode) {
        logger.warn(`Circular import detected: ${importPath}`);
      }
      // Replace the import with a warning comment
      processedContent = processedContent.replace(
        match[0],
        `<!-- Circular import detected: ${importPath} -->`,
      );
      continue;
    }

    // Check if we've already processed this file in this import chain
    if (importState.processedFiles.has(fullPath)) {
      if (debugMode) {
        logger.warn(`File already processed in this chain: ${importPath}`);
      }
      // Replace the import with a warning comment
      processedContent = processedContent.replace(
        match[0],
        `<!-- File already processed: ${importPath} -->`,
      );
      continue;
    }

    // Check for potential circular imports by looking at the import chain
    if (importState.currentFile) {
      const currentFileDir = path.dirname(importState.currentFile);
      const potentialCircularPath = path.resolve(currentFileDir, importPath);
      if (potentialCircularPath === importState.currentFile) {
        if (debugMode) {
          logger.warn(`Circular import detected: ${importPath}`);
        }
        // Replace the import with a warning comment
        processedContent = processedContent.replace(
          match[0],
          `<!-- Circular import detected: ${importPath} -->`,
        );
        continue;
      }
    }

    try {
      // Check if the file exists
      await fs.access(fullPath);

      // Read the imported file content
      const importedContent = await fs.readFile(fullPath, 'utf-8');

      if (debugMode) {
        logger.debug(`Successfully read imported file: ${fullPath}`);
      }

      // Recursively process imports in the imported content
      const processedImportedContent = await processImports(
        importedContent,
        path.dirname(fullPath),
        debugMode,
        {
          ...importState,
          processedFiles: new Set([...importState.processedFiles, fullPath]),
          currentDepth: importState.currentDepth + 1,
          currentFile: fullPath, // Set the current file being processed
        },
      );

      // Replace the import statement with the processed content
      processedContent = processedContent.replace(
        match[0],
        `<!-- Imported from: ${importPath} -->\n${processedImportedContent}\n<!-- End of import from: ${importPath} -->`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (debugMode) {
        logger.error(`Failed to import ${importPath}: ${errorMessage}`);
      }

      // Replace the import with an error comment
      processedContent = processedContent.replace(
        match[0],
        `<!-- Import failed: ${importPath} - ${errorMessage} -->`,
      );
    }
  }

  return processedContent;
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
