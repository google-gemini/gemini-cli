/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { logPathTraversalBlocked } from './security-audit-logger.js';

/**
 * Advanced path validation and sanitization utilities.
 *
 * SECURITY NOTE: Path traversal vulnerabilities occur when user-supplied
 * input is used to construct file paths without proper validation.
 * This module provides comprehensive path validation to prevent:
 * - Directory traversal attacks (../, ..\)
 * - Symbolic link attacks
 * - Absolute path injection
 * - Null byte injection
 */

export enum PathValidationError {
  PATH_TRAVERSAL = 'PATH_TRAVERSAL',
  ABSOLUTE_PATH_NOT_ALLOWED = 'ABSOLUTE_PATH_NOT_ALLOWED',
  INVALID_CHARACTERS = 'INVALID_CHARACTERS',
  NULL_BYTE = 'NULL_BYTE',
  SYMLINK_NOT_ALLOWED = 'SYMLINK_NOT_ALLOWED',
  OUTSIDE_BASE_DIR = 'OUTSIDE_BASE_DIR',
  PATH_TOO_LONG = 'PATH_TOO_LONG',
  RESERVED_NAME = 'RESERVED_NAME',
}

export class PathSecurityError extends Error {
  constructor(
    public readonly type: PathValidationError,
    message: string,
    public readonly path?: string,
  ) {
    super(message);
    this.name = 'PathSecurityError';
  }
}

/**
 * Reserved Windows filenames that should not be allowed.
 */
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

/**
 * Dangerous path patterns.
 */
const DANGEROUS_PATH_PATTERNS = [
  /\.\./,  // Parent directory traversal
  /~/, // Home directory expansion
  /\0/, // Null byte
  /[\x00-\x1f\x7f]/, // Control characters
];

/**
 * Maximum safe path length (to prevent DoS via extremely long paths).
 */
const MAX_PATH_LENGTH = 4096;

/**
 * Validates a path against security constraints.
 *
 * @param inputPath Path to validate
 * @param baseDir Base directory to resolve against
 * @param options Validation options
 * @returns Sanitized absolute path
 * @throws PathSecurityError if validation fails
 */
export function validateSecurePath(
  inputPath: string,
  baseDir: string,
  options: {
    allowAbsolute?: boolean;
    allowSymlinks?: boolean;
    serverName?: string;
  } = {},
): string {
  const { allowAbsolute = false, allowSymlinks = false, serverName } = options;

  // Check for null bytes
  if (inputPath.includes('\0')) {
    logPathTraversalBlocked(inputPath, serverName);
    throw new PathSecurityError(
      PathValidationError.NULL_BYTE,
      'Path contains null byte',
      inputPath,
    );
  }

  // Check path length
  if (inputPath.length > MAX_PATH_LENGTH) {
    throw new PathSecurityError(
      PathValidationError.PATH_TOO_LONG,
      `Path length ${inputPath.length} exceeds maximum ${MAX_PATH_LENGTH}`,
      inputPath,
    );
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATH_PATTERNS) {
    if (pattern.test(inputPath)) {
      logPathTraversalBlocked(inputPath, serverName);
      throw new PathSecurityError(
        PathValidationError.PATH_TRAVERSAL,
        `Path contains dangerous pattern: ${pattern}`,
        inputPath,
      );
    }
  }

  // Check if absolute path is allowed
  if (path.isAbsolute(inputPath) && !allowAbsolute) {
    throw new PathSecurityError(
      PathValidationError.ABSOLUTE_PATH_NOT_ALLOWED,
      'Absolute paths are not allowed',
      inputPath,
    );
  }

  // Resolve the path
  const resolvedPath = path.resolve(baseDir, inputPath);
  const normalizedBase = path.normalize(baseDir);
  const normalizedPath = path.normalize(resolvedPath);

  // Ensure the resolved path is within the base directory
  if (!normalizedPath.startsWith(normalizedBase + path.sep) &&
      normalizedPath !== normalizedBase) {
    logPathTraversalBlocked(inputPath, serverName);
    throw new PathSecurityError(
      PathValidationError.OUTSIDE_BASE_DIR,
      `Path '${inputPath}' resolves outside base directory '${baseDir}'`,
      inputPath,
    );
  }

  // Check for Windows reserved names
  const basename = path.basename(normalizedPath).toUpperCase();
  const nameWithoutExt = basename.split('.')[0];
  if (WINDOWS_RESERVED_NAMES.has(nameWithoutExt)) {
    throw new PathSecurityError(
      PathValidationError.RESERVED_NAME,
      `Path uses reserved Windows filename: ${nameWithoutExt}`,
      inputPath,
    );
  }

  // Check for symlinks if not allowed
  if (!allowSymlinks && fs.existsSync(resolvedPath)) {
    const stats = fs.lstatSync(resolvedPath);
    if (stats.isSymbolicLink()) {
      logPathTraversalBlocked(inputPath, serverName);
      throw new PathSecurityError(
        PathValidationError.SYMLINK_NOT_ALLOWED,
        'Symbolic links are not allowed',
        inputPath,
      );
    }
  }

  return normalizedPath;
}

/**
 * Sanitizes a filename by removing dangerous characters.
 *
 * @param filename Filename to sanitize
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators
  let sanitized = filename.replace(/[/\\]/g, '_');

  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');

  // Remove dangerous characters
  sanitized = sanitized.replace(/[<>:"|?*]/g, '_');

  // Remove leading/trailing dots and spaces
  sanitized = sanitized.replace(/^[. ]+|[. ]+$/g, '');

  // Limit length
  if (sanitized.length > 255) {
    const ext = path.extname(sanitized);
    const basename = path.basename(sanitized, ext);
    sanitized = basename.substring(0, 255 - ext.length) + ext;
  }

  // Ensure it's not empty
  if (sanitized.length === 0) {
    sanitized = 'file';
  }

  return sanitized;
}

/**
 * Checks if a path is safe (doesn't contain traversal attempts).
 *
 * @param inputPath Path to check
 * @returns True if the path appears safe
 */
export function isPathSafe(inputPath: string): boolean {
  try {
    // Check for dangerous patterns
    for (const pattern of DANGEROUS_PATH_PATTERNS) {
      if (pattern.test(inputPath)) {
        return false;
      }
    }

    // Check for Windows reserved names
    const basename = path.basename(inputPath).toUpperCase();
    const nameWithoutExt = basename.split('.')[0];
    if (WINDOWS_RESERVED_NAMES.has(nameWithoutExt)) {
      return false;
    }

    // Check for null bytes
    if (inputPath.includes('\0')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validates multiple paths at once.
 *
 * @param paths Paths to validate
 * @param baseDir Base directory
 * @param options Validation options
 * @returns Array of validated paths
 * @throws PathSecurityError if any path is invalid
 */
export function validateMultiplePaths(
  paths: string[],
  baseDir: string,
  options: {
    allowAbsolute?: boolean;
    allowSymlinks?: boolean;
    serverName?: string;
  } = {},
): string[] {
  return paths.map((p) => validateSecurePath(p, baseDir, options));
}

/**
 * Checks if a resolved path is within allowed directories.
 *
 * @param resolvedPath The resolved absolute path
 * @param allowedDirs List of allowed base directories
 * @returns True if path is within allowed directories
 */
export function isWithinAllowedDirectories(
  resolvedPath: string,
  allowedDirs: string[],
): boolean {
  const normalized = path.normalize(resolvedPath);

  for (const allowedDir of allowedDirs) {
    const normalizedAllowed = path.normalize(allowedDir);
    if (
      normalized.startsWith(normalizedAllowed + path.sep) ||
      normalized === normalizedAllowed
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Gets the real path, resolving symlinks, and validates it's within base.
 *
 * @param inputPath Path to resolve
 * @param baseDir Base directory
 * @returns Real absolute path
 * @throws PathSecurityError if path is invalid or outside base
 */
export function getSecureRealPath(
  inputPath: string,
  baseDir: string,
): string {
  const resolvedPath = path.resolve(baseDir, inputPath);

  // Get real path (resolves symlinks)
  let realPath: string;
  try {
    realPath = fs.realpathSync(resolvedPath);
  } catch {
    // File doesn't exist yet, use resolved path
    realPath = resolvedPath;
  }

  const normalizedBase = path.normalize(baseDir);
  const normalizedReal = path.normalize(realPath);

  // Ensure real path is still within base directory
  if (!normalizedReal.startsWith(normalizedBase + path.sep) &&
      normalizedReal !== normalizedBase) {
    logPathTraversalBlocked(inputPath);
    throw new PathSecurityError(
      PathValidationError.OUTSIDE_BASE_DIR,
      `Real path '${realPath}' is outside base directory '${baseDir}'`,
      inputPath,
    );
  }

  return normalizedReal;
}
