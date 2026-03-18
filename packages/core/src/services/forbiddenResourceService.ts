/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import ignore from 'ignore';
import { fdir } from 'fdir';
import { isNodeError } from '../utils/errors.js';

type IgnoreManager = ReturnType<typeof ignore>;

export interface ForbiddenResource {
  absolutePath: string;
  isDirectory: boolean;
}

const IGNORE_FILES = ['.gitignore', '.geminiignore'];

/**
 * Resolves patterns from ignore files into absolute paths of resources in
 * the workspace.
 */
export async function resolveForbiddenResources(
  workspacePath: string,
): Promise<ForbiddenResource[]> {
  const ignoreManager = await buildIgnoreManager(workspacePath);
  return findForbiddenResources(workspacePath, ignoreManager);
}

/**
 * Parses all configured ignore files into a single ignore manager instance.
 */
async function buildIgnoreManager(
  workspacePath: string,
): Promise<IgnoreManager> {
  const ignoreManager = ignore();
  for (const fileName of IGNORE_FILES) {
    const content = await readFile(workspacePath, fileName);
    if (content) {
      ignoreManager.add(content);
    }
  }
  return ignoreManager;
}

/**
 * Reads a file and returns its content, or null if the file does not exist.
 */
async function readFile(
  workspacePath: string,
  fileName: string,
): Promise<string | null> {
  try {
    const filePath = path.join(workspacePath, fileName);
    return await fs.readFile(filePath, 'utf-8');
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Traverses the workspace to find all resources that match the ignore rules.
 */
async function findForbiddenResources(
  workspacePath: string,
  ignoreManager: IgnoreManager,
): Promise<ForbiddenResource[]> {
  const forbiddenResources: ForbiddenResource[] = [];

  const crawler = new fdir()
    .withBasePath()
    .withPathSeparator('/')
    .withDirs()
    // Exclude directories that match ignore rules. This completely stops fdir
    // from crawling inside them.
    .exclude((dirName, dirPath) =>
      recordIfForbidden(
        workspacePath,
        path.join(dirPath, dirName),
        true, // isDirectory
        ignoreManager,
        forbiddenResources,
      ),
    )
    // Filter everything else against the ignore rules.
    .filter((resourcePath, isDirectory) =>
      recordIfForbidden(
        workspacePath,
        resourcePath,
        isDirectory,
        ignoreManager,
        forbiddenResources,
      ),
    );

  await crawler.crawl(workspacePath).withPromise();

  return forbiddenResources;
}

/**
 * Checks if a resource is forbidden, and if so, records it in the array.
 * Returns true if the resource was forbidden.
 */
function recordIfForbidden(
  workspacePath: string,
  resourcePath: string,
  isDirectory: boolean,
  ignoreManager: IgnoreManager,
  forbiddenResources: ForbiddenResource[],
): boolean {
  const isForbidden = isResourceForbidden(
    workspacePath,
    resourcePath,
    isDirectory,
    ignoreManager,
  );
  if (isForbidden) {
    forbiddenResources.push({
      absolutePath: resourcePath,
      isDirectory,
    });
  }
  return isForbidden;
}

/**
 * Checks a single resource to see if it's forbidden by the ignore rules.
 */
function isResourceForbidden(
  workspacePath: string,
  resourcePath: string,
  isDirectory: boolean,
  ignoreManager: IgnoreManager,
): boolean {
  // The `ignore` package expects paths to be relative to the workspace root.
  let relativePath = path.relative(workspacePath, resourcePath);

  // Directories must end with a trailing slash to correctly match
  // directory-only rules.
  if (isDirectory && !relativePath.endsWith('/')) {
    relativePath += '/';
  }

  // The workspace root itself cannot be ignored.
  if (relativePath === '' || relativePath === '/') {
    return false;
  }

  return ignoreManager.ignores(relativePath);
}
