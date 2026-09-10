/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { resolveToRealPath } from './paths.js';

/**
 * Exact build file basenames that define build targets, dependencies,
 * compilation scripts, or lifecycle hooks.
 */
export const EXACT_BUILD_FILENAMES: ReadonlySet<string> = new Set([
  // Bazel / Blaze
  'BUILD',
  'BUILD.bazel',
  'WORKSPACE',
  'WORKSPACE.bazel',
  'MODULE.bazel',
  '.bazelrc',
  '.blazerc',

  // Make & CMake
  'Makefile',
  'makefile',
  'GNUmakefile',
  'CMakeLists.txt',

  // Node.js
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',

  // Python
  'setup.py',
  'setup.cfg',
  'pyproject.toml',

  // Go
  'go.mod',
  'go.sum',

  // Rust
  'Cargo.toml',
  'Cargo.lock',

  // Java / Kotlin / Gradle / Maven
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',

  // Containers
  'Dockerfile',
  'Containerfile',
]);

/**
 * Extensions indicating build or build-configuration logic.
 */
export const BUILD_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.bzl',
  '.bazel',
  '.bzlmod',
  '.mk',
  '.cmake',
]);

/**
 * Deterministically checks whether a given file path corresponds to a build
 * configuration or definition file.
 *
 * @param filePath The file path (relative or absolute).
 * @returns True if the file is a recognized build file.
 */
export function isBuildFile(filePath: string): boolean {
  if (!filePath) {
    return false;
  }

  // Sanitize null byte characters (\0) and trailing dots/spaces on Windows to prevent path injection bypasses
  let cleanPath = filePath.replace(/\0/g, '');
  if (process.platform === 'win32') {
    let end = cleanPath.length;
    while (
      end > 0 &&
      (cleanPath[end - 1] === '.' || cleanPath[end - 1] === ' ')
    ) {
      end--;
    }
    cleanPath = cleanPath.slice(0, end);
  }

  // Normalize backslashes to forward slashes first to support cross-platform path parsing (e.g. Windows paths on POSIX)
  const normalizedPath = cleanPath.replace(/\\/g, '/');
  // Consistent path resolution using a single, robust helper to handle traversals (. or ..) and absolute/relative conversions
  let resolvedPath = normalizedPath;
  try {
    resolvedPath = resolveToRealPath(normalizedPath);
  } catch {
    resolvedPath = path.resolve(normalizedPath);
  }
  const basename = path.basename(resolvedPath);

  if (EXACT_BUILD_FILENAMES.has(basename)) {
    return true;
  }

  // Handle Dockerfile.<suffix> and Containerfile.<suffix>
  if (
    basename.startsWith('Dockerfile.') ||
    basename.startsWith('Containerfile.')
  ) {
    return true;
  }

  const ext = path.extname(basename).toLowerCase();
  if (BUILD_FILE_EXTENSIONS.has(ext)) {
    return true;
  }

  return false;
}

interface FilePathLike {
  file_path?: unknown;
  path?: unknown;
  filePath?: unknown;
  file?: unknown;
}

/****************************************************************ESLint-Bypass****************************************************************/
function isFilePathLike(value: unknown): value is FilePathLike {
  return typeof value === 'object' && value !== null;
}

/**
 * Extracts a target file path from tool invocation arguments if present.
 */
export function extractFilePathFromArgs(args: unknown): string | undefined {
  if (!isFilePathLike(args)) {
    return undefined;
  }
  const target = args.file_path ?? args.path ?? args.filePath ?? args.file;
  return typeof target === 'string' ? target : undefined;
}
