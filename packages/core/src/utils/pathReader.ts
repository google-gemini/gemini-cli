/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import type { PartUnion } from '@google/genai';
import { processSingleFileContent } from './fileUtils.js';
import type { Config } from '../config/config.js';

/**
 * Reads the content of a file or recursively expands a directory from
 * within the workspace, returning content suitable for LLM input.
 *
 * @param pathStr The path to read (can be absolute or relative).
 * @param config The application configuration, providing workspace context and services.
 * @returns A promise that resolves to an array of PartUnion (string | Part).
 * @throws An error if the path is not found or is outside the workspace.
 */
export async function readPathFromWorkspace(
  pathStr: string,
  config: Config,
): Promise<PartUnion[]> {
  const workspace = config.getWorkspaceContext();
  const fileService = config.getFileService();
  let absolutePath: string | null = null;

  if (path.isAbsolute(pathStr)) {
    if (!workspace.isPathWithinWorkspace(pathStr)) {
      throw new Error(
        `Absolute path is outside of the allowed workspace: ${pathStr}`,
      );
    }
    absolutePath = pathStr;
  } else {
    // Prioritized search for relative paths.
    const searchDirs = workspace.getDirectories();
    for (const dir of searchDirs) {
      const potentialPath = path.resolve(dir, pathStr);
      try {
        await fs.access(potentialPath);
        absolutePath = potentialPath;
        break; // Found the first match.
      } catch {
        // Not found, continue to the next directory.
      }
    }
  }

  if (!absolutePath) {
    throw new Error(`Path not found in workspace: ${pathStr}`);
  }

  const stats = await fs.stat(absolutePath);
  if (stats.isDirectory()) {
    const allParts: PartUnion[] = [];
    allParts.push({
      text: `--- Start of content for directory: ${pathStr} ---\n`,
    });

    // Use glob to recursively find all files within the directory.
    const files = await glob('**/*', {
      cwd: absolutePath,
      nodir: true, // We only want files
      dot: true, // Include dotfiles
      absolute: true,
    });

    const relativeFiles = files.map((p) =>
      path.relative(config.getTargetDir(), p),
    );
    const filteredFiles = fileService.filterFiles(relativeFiles, {
      respectGitIgnore: true,
      respectGeminiIgnore: true,
    });
    const finalFiles = filteredFiles.map((p) =>
      path.resolve(config.getTargetDir(), p),
    );

    for (const filePath of finalFiles) {
      const relativePathForDisplay = path.relative(absolutePath, filePath);
      allParts.push({ text: `--- ${relativePathForDisplay} ---\n` });
      const result = await processSingleFileContent(
        filePath,
        config.getTargetDir(),
        config.getFileSystemService(),
      );
      allParts.push(result.llmContent);
      allParts.push({ text: '\n' }); // Add a newline for separation
    }

    allParts.push({ text: `--- End of content for directory: ${pathStr} ---` });
    return allParts;
  } else {
    // It's a single file, check if it's ignored.
    const relativePath = path.relative(config.getTargetDir(), absolutePath);
    const filtered = fileService.filterFiles([relativePath], {
      respectGitIgnore: true,
      respectGeminiIgnore: true,
    });

    if (filtered.length === 0) {
      // File is ignored, return empty array to silently skip.
      return [];
    }

    // It's a single file, process it directly.
    const result = await processSingleFileContent(
      absolutePath,
      config.getTargetDir(),
      config.getFileSystemService(),
    );
    return [result.llmContent];
  }
}
