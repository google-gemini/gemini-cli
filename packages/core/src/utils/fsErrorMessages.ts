/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { isNodeError, getErrorMessage } from './errors.js';

/**
 * Map of Node.js filesystem error codes to user-friendly message generators.
 * Each function takes the path (if available) and returns a descriptive message.
 */
const errorMessageGenerators: Record<string, (path?: string) => string> = {
  EACCES: (path) =>
    (path
      ? `Permission denied: cannot access '${path}'. `
      : 'Permission denied. ') +
    'Check file permissions or run with elevated privileges.',
  ENOENT: (path) =>
    (path
      ? `File or directory not found: '${path}'. `
      : 'File or directory not found. ') +
    'Check if the path exists and is spelled correctly.',
  ENOSPC: () =>
    'No space left on device. Free up some disk space and try again.',
  EISDIR: (path) =>
    (path
      ? `Path is a directory, not a file: '${path}'. `
      : 'Path is a directory, not a file. ') +
    'Please provide a path to a file instead.',
  EROFS: () =>
    'Read-only file system. Ensure the file system allows write operations.',
  EPERM: (path) =>
    (path
      ? `Operation not permitted: '${path}'. `
      : 'Operation not permitted. ') +
    'Ensure you have the required permissions for this action.',
  EEXIST: (path) =>
    (path
      ? `File or directory already exists: '${path}'. `
      : 'File or directory already exists. ') +
    'Try using a different name or path.',
  EBUSY: (path) =>
    (path
      ? `Resource busy or locked: '${path}'. `
      : 'Resource busy or locked. ') +
    'Close any programs that might be using the file.',
  EMFILE: () => 'Too many open files. Close some unused files or applications.',
  ENFILE: () =>
    'Too many open files in system. Close some unused files or applications.',
};

/**
 * Converts a Node.js filesystem error to a user-friendly message.
 *
 * @param error - The error to convert
 * @param defaultMessage - Optional default message if error cannot be interpreted
 * @returns A user-friendly error message
 */
export function getFsErrorMessage(
  error: unknown,
  defaultMessage = 'An unknown error occurred',
): string {
  if (error == null) {
    return defaultMessage;
  }

  if (isNodeError(error)) {
    const code = error.code;
    const path = error.path;

    if (code && Object.hasOwn(errorMessageGenerators, code)) {
      return errorMessageGenerators[code](path);
    }

    // For unknown error codes, include the code in the message
    if (code) {
      const baseMessage = error.message || defaultMessage;
      return `${baseMessage} (${code})`;
    }
  }

  // For non-Node errors, return the error message or string representation
  return getErrorMessage(error);
}
