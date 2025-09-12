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
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';

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
  // Note: File discovery rules (gitignore/.geminiignore) are evaluated relative
  // to the root workspace directory that contains the file, not always the
  // primary target directory. We therefore resolve the correct workspace root
  // for each file and construct a FileDiscoveryService for that root.
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

  // Determine all workspace roots once and share helper across branches
  const workspaceRoots = workspace.getDirectories();
  const findRootFor = (absPath: string): string | undefined => {
    for (const root of workspaceRoots) {
      const rel = path.relative(root, absPath);
      if (
        rel !== '' &&
        !rel.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(rel)
      ) {
        return root;
      }
      if (rel === '') {
        // absPath equals the root path
        return root;
      }
    }
    return undefined;
  };

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

    // Cache a FileDiscoveryService per root
    const fileServices = new Map<string, FileDiscoveryService>();
    const getServiceForRoot = (rootDir: string) => {
      // Reuse the config's file service if the root matches the targetDir
      if (rootDir === config.getTargetDir()) {
        // Cast to concrete type for caching
        const existing = fileServices.get(rootDir);
        if (existing) return existing;
        const svc = config.getFileService();
        fileServices.set(rootDir, svc);
        return svc;
      }
      let svc = fileServices.get(rootDir);
      if (!svc) {
        svc = new FileDiscoveryService(rootDir);
        fileServices.set(rootDir, svc);
      }
      return svc;
    };

    const finalFiles: string[] = [];
    for (const filePath of files) {
      const root = findRootFor(filePath) ?? config.getTargetDir();
      const svc = getServiceForRoot(root);
      const rel = path.relative(root, filePath);
      const kept = svc.filterFiles([rel], {
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      });
      if (kept.length > 0) {
        finalFiles.push(filePath);
      }
    }

    for (const filePath of finalFiles) {
      // Compute display path relative to the expanded directory for readability
      const relativePathForDisplay = path.relative(absolutePath, filePath);
      allParts.push({ text: `--- ${relativePathForDisplay} ---\n` });
      // Resolve workspace root for correct ignore rules and processing
      const root = findRootFor(filePath) ?? config.getTargetDir();
      const result = await processSingleFileContent(
        filePath,
        root,
        config.getFileSystemService(),
      );
      allParts.push(result.llmContent);
      allParts.push({ text: '\n' }); // Add a newline for separation
    }

    allParts.push({ text: `--- End of content for directory: ${pathStr} ---` });
    return allParts;
  } else {
    // It's a single file, check if it's ignored.
    const root = findRootFor(absolutePath) ?? config.getTargetDir();
    const singleFileService =
      root === config.getTargetDir()
        ? config.getFileService()
        : new FileDiscoveryService(root);
    const relativePath = path.relative(root, absolutePath);
    const filtered = singleFileService.filterFiles([relativePath], {
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
      root,
      config.getFileSystemService(),
    );
    return [result.llmContent];
  }
}
