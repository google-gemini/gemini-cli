/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { marked } from 'marked';

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
 * Interface representing a file in the import tree
 */
export interface MemoryFile {
  path: string;
  imports?: MemoryFile[]; // Direct imports, in the order they were imported
}

/**
 * Result of processing imports
 */
export interface ProcessImportsResult {
  content: string;
  importTree: MemoryFile;
}

// Helper to find the project root (looks for .git directory)
async function findProjectRoot(startDir: string): Promise<string> {
  let currentDir = path.resolve(startDir);
  while (true) {
    const gitPath = path.join(currentDir, '.git');
    try {
      const stats = await fs.lstat(gitPath);
      if (stats.isDirectory()) {
        return currentDir;
      }
    } catch {
      // .git not found, continue to parent
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

// Helper to find all code block and inline code regions using marked
/**
 * Finds all import statements in content without using regex
 * @returns Array of {start, _end, path} objects for each import found
 */
function findImports(
  content: string,
): Array<{ start: number; _end: number; path: string }> {
  const imports: Array<{ start: number; _end: number; path: string }> = [];
  let i = 0;
  const len = content.length;

  while (i < len) {
    // Find next @ symbol
    i = content.indexOf('@', i);
    if (i === -1) break;

    // Check if it's a word boundary (not part of another word)
    if (i > 0 && !isWhitespace(content[i - 1])) {
      i++;
      continue;
    }

    // Find the end of the import path (whitespace or newline)
    let j = i + 1;
    while (
      j < len &&
      !isWhitespace(content[j]) &&
      content[j] !== '\n' &&
      content[j] !== '\r'
    ) {
      j++;
    }

    // Extract the path (everything after @)
    const importPath = content.slice(i + 1, j);

    // Basic validation (starts with ./ or / or letter)
    if (
      importPath.length > 0 &&
      (importPath[0] === '.' ||
        importPath[0] === '/' ||
        isLetter(importPath[0]))
    ) {
      imports.push({
        start: i,
        _end: j,
        path: importPath,
      });
    }

    i = j + 1;
  }

  return imports;
}

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function isLetter(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122)
  ); // a-z
}

function findCodeRegions(content: string): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  const tokens = marked.lexer(content);

  // Map from raw content to a queue of its start indices in the original content.
  const rawContentIndices = new Map<string, number[]>();

  function walk(token: { type: string; raw: string; tokens?: unknown[] }) {
    if (token.type === 'code' || token.type === 'codespan') {
      if (!rawContentIndices.has(token.raw)) {
        const indices: number[] = [];
        let lastIndex = -1;
        while ((lastIndex = content.indexOf(token.raw, lastIndex + 1)) !== -1) {
          indices.push(lastIndex);
        }
        rawContentIndices.set(token.raw, indices);
      }

      const indices = rawContentIndices.get(token.raw);
      if (indices && indices.length > 0) {
        // Assume tokens are processed in order of appearance.
        // Dequeue the next available index for this raw content.
        const idx = indices.shift()!;
        regions.push([idx, idx + token.raw.length]);
      }
    }

    if ('tokens' in token && token.tokens) {
      for (const child of token.tokens) {
        walk(child as { type: string; raw: string; tokens?: unknown[] });
      }
    }
  }

  for (const token of tokens) {
    walk(token);
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
 * @param importFormat - The format of the import tree
 * @returns Processed content with imports resolved and import tree
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
  importFormat: 'flat' | 'tree' = 'tree',
): Promise<ProcessImportsResult> {
  if (!projectRoot) {
    projectRoot = await findProjectRoot(basePath);
  }

  if (importState.currentDepth >= importState.maxDepth) {
    if (debugMode) {
      logger.warn(
        `Maximum import depth (${importState.maxDepth}) reached. Stopping import processing.`,
      );
    }
    return {
      content,
      importTree: { path: importState.currentFile || 'unknown' },
    };
  }

  // --- FLAT FORMAT LOGIC ---
  if (importFormat === 'flat') {
    // Use a queue to process files in order of first encounter, and a set to avoid duplicates
    const flatFiles: Array<{ path: string; content: string }> = [];
    // Track processed files across the entire operation
    const processedFiles = new Set<string>();

    // Helper to recursively process imports
    async function processFlat(
      fileContent: string,
      fileBasePath: string,
      filePath: string,
      depth: number,
    ) {
      // Normalize the file path to ensure consistent comparison
      const normalizedPath = path.normalize(filePath);

      // Skip if already processed
      if (processedFiles.has(normalizedPath)) return;

      // Mark as processed before processing to prevent infinite recursion
      processedFiles.add(normalizedPath);

      // Add this file to the flat list
      flatFiles.push({ path: normalizedPath, content: fileContent });

      // Find imports in this file
      const codeRegions = findCodeRegions(fileContent);
      const imports = findImports(fileContent);

      // Process imports in reverse order to handle indices correctly
      for (let i = imports.length - 1; i >= 0; i--) {
        const { start, _end, path: importPath } = imports[i];

        // Skip if inside a code region
        if (
          codeRegions.some(
            ([regionStart, regionEnd]) =>
              start >= regionStart && start < regionEnd,
          )
        ) {
          continue;
        }

        // Validate import path
        if (
          !validateImportPath(importPath, fileBasePath, [projectRoot || ''])
        ) {
          continue;
        }

        const fullPath = path.resolve(fileBasePath, importPath);
        const normalizedFullPath = path.normalize(fullPath);

        // Skip if already processed
        if (processedFiles.has(normalizedFullPath)) continue;

        try {
          await fs.access(fullPath);
          const importedContent = await fs.readFile(fullPath, 'utf-8');

          // Process the imported file
          await processFlat(
            importedContent,
            path.dirname(fullPath),
            normalizedFullPath,
            depth + 1,
          );
        } catch (error) {
          if (debugMode) {
            logger.warn(
              `Failed to import ${fullPath}: ${hasMessage(error) ? error.message : 'Unknown error'}`,
            );
          }
          // Continue with other imports even if one fails
        }
      }
    }

    // Start with the root file (current file)
    const rootPath = path.normalize(
      importState.currentFile || path.resolve(basePath),
    );
    await processFlat(content, basePath, rootPath, 0);

    // Concatenate all unique files in order, Claude-style
    const flatContent = flatFiles
      .map(
        (f) =>
          `--- File: ${f.path} ---\n${f.content.trim()}\n--- End of File: ${f.path} ---`,
      )
      .join('\n\n');

    return {
      content: flatContent,
      importTree: { path: rootPath }, // Tree not meaningful in flat mode
    };
  }

  // --- TREE FORMAT LOGIC (existing) ---
  const codeRegions = findCodeRegions(content);
  let result = '';
  let lastIndex = 0;
  const imports: MemoryFile[] = [];
  const importsList = findImports(content);

  for (const { start, _end, path: importPath } of importsList) {
    // Add content before this import
    result += content.substring(lastIndex, start);
    lastIndex = _end;

    // Skip if inside a code region
    if (codeRegions.some(([s, e]) => start >= s && start < e)) {
      result += `@${importPath}`;
      continue;
    }
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
        importFormat,
      );
      result += `<!-- Imported from: ${importPath} -->\n${imported.content}\n<!-- End of import from: ${importPath} -->`;
      imports.push(imported.importTree);
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

  return {
    content: result,
    importTree: {
      path: importState.currentFile || 'unknown',
      imports: imports.length > 0 ? imports : undefined,
    },
  };
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
    const isSamePath = resolvedPath === normalizedAllowedDir;
    const isSubPath = resolvedPath.startsWith(normalizedAllowedDir + path.sep);
    return isSamePath || isSubPath;
  });
}
