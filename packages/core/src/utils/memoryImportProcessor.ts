/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { parseMarkdown } from './markdownParser.js';

export interface ImportNode {
  path: string;
  children: ImportNode[];
}

export interface ProcessImportsResult {
  content: string;
  importTree: ImportNode;
}

export interface MemorySource {
  filePath: string;
  importTree: ImportNode | null;
}

const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) =>
    console.debug('[DEBUG] [ImportProcessor]', ...args),
};

async function _recursiveProcess(
  filePath: string,
  rootPath: string,
  parentNode: ImportNode,
  processedFiles: Set<string>,
  depth: number,
  debugMode: boolean,
): Promise<string> {
  if (depth > 5) {
    if (debugMode) {
      logger.debug(`Max import depth reached for ${filePath}`);
    }
    return ''; // Silently ignore
  }

  let fileContent;
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      if (debugMode) {
        logger.debug(`Skipping import of directory: ${filePath}`);
      }
      return '';
    }
    fileContent = await fs.readFile(filePath, 'utf-8');
  } catch (e: unknown) {
    if (debugMode) {
      const err = e as Error;
      logger.debug(`Skipping missing file: ${filePath} (${err.message})`);
    }
    return ''; // Silently ignore missing files
  }

  const ast = parseMarkdown(fileContent);
  const contentParts: string[] = [];

  for (const node of ast) {
    if (node.type === 'text') {
      const importRegex = /@((?:[^\s\\]|\\ )+)/g;
      let lastIndex = 0;
      let match;
      const textParts: string[] = [];

      while ((match = importRegex.exec(node.content)) !== null) {
        textParts.push(node.content.slice(lastIndex, match.index));
        const importPath = match[1].replace(/\\ /g, ' ');
        const resolvedPath = path.resolve(path.dirname(filePath), importPath);

        if (!resolvedPath.startsWith(rootPath)) {
          if (debugMode) {
            logger.debug(
              `Skipping import outside of project root: ${resolvedPath}`,
            );
          }
          textParts.push('');
          lastIndex = match.index + match[0].length;
          continue;
        }

        if (!processedFiles.has(resolvedPath)) {
          processedFiles.add(resolvedPath);
          const childNode: ImportNode = { path: resolvedPath, children: [] };

          const importedContent = await _recursiveProcess(
            resolvedPath,
            rootPath,
            childNode,
            processedFiles,
            depth + 1,
            debugMode,
          );
          if (importedContent || childNode.children.length > 0) {
            parentNode.children.push(childNode);
          }
          textParts.push(importedContent);
        }
        lastIndex = match.index + match[0].length;
      }
      textParts.push(node.content.slice(lastIndex));
      contentParts.push(textParts.join(''));
    } else {
      contentParts.push(node.content);
    }
  }
  return contentParts.join('');
}

export async function processImports(
  filePath: string,
  rootPath: string,
  debugMode = false,
): Promise<ProcessImportsResult> {
  const absoluteFilePath = path.resolve(filePath);
  const rootNode: ImportNode = { path: absoluteFilePath, children: [] };
  const processedFiles = new Set<string>([absoluteFilePath]);

  const content = await _recursiveProcess(
    absoluteFilePath,
    rootPath,
    rootNode,
    processedFiles,
    1,
    debugMode,
  );

  return { content, importTree: rootNode };
}
