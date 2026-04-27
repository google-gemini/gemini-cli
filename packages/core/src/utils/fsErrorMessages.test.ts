/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { getFsErrorMessage } from './fsErrorMessages.js';

/**
 * Helper to create a mock NodeJS.ErrnoException
 */
function createNodeError(
  code: string,
  message: string,
  path?: string,
): NodeJS.ErrnoException {
  const error = new Error(message) as NodeJS.ErrnoException;
  error.code = code;
  if (path) {
    error.path = path;
  }
  return error;
}

interface FsErrorCase {
  code: string;
  message: string;
  path?: string;
  expected: string;
}

interface FallbackErrorCase {
  value: unknown;
  expected: string;
}

describe('getFsErrorMessage', () => {
  describe('known filesystem error codes', () => {
    const testCases: FsErrorCase[] = [
      {
        code: 'EACCES',
        message: 'EACCES: permission denied',
        path: '/etc/gemini-cli/settings.json',
        expected:
          "Permission denied: cannot access '/etc/gemini-cli/settings.json'. Check file permissions or run with elevated privileges.",
      },
      {
        code: 'EACCES',
        message: 'EACCES: permission denied',
        expected:
          'Permission denied. Check file permissions or run with elevated privileges.',
      },
      {
        code: 'ENOENT',
        message: 'ENOENT: no such file or directory',
        path: '/nonexistent/file.txt',
        expected:
          "File or directory not found: '/nonexistent/file.txt'. Check if the path exists and is spelled correctly.",
      },
      {
        code: 'ENOENT',
        message: 'ENOENT: no such file or directory',
        expected:
          'File or directory not found. Check if the path exists and is spelled correctly.',
      },
      {
        code: 'ENOSPC',
        message: 'ENOSPC: no space left on device',
        expected:
          'No space left on device. Free up some disk space and try again.',
      },
      {
        code: 'EISDIR',
        message: 'EISDIR: illegal operation on a directory',
        path: '/some/directory',
        expected:
          "Path is a directory, not a file: '/some/directory'. Please provide a path to a file instead.",
      },
      {
        code: 'EISDIR',
        message: 'EISDIR: illegal operation on a directory',
        expected:
          'Path is a directory, not a file. Please provide a path to a file instead.',
      },
      {
        code: 'EROFS',
        message: 'EROFS: read-only file system',
        expected:
          'Read-only file system. Ensure the file system allows write operations.',
      },
      {
        code: 'EPERM',
        message: 'EPERM: operation not permitted',
        path: '/protected/file',
        expected:
          "Operation not permitted: '/protected/file'. Ensure you have the required permissions for this action.",
      },
      {
        code: 'EPERM',
        message: 'EPERM: operation not permitted',
        expected:
          'Operation not permitted. Ensure you have the required permissions for this action.',
      },
      {
        code: 'EEXIST',
        message: 'EEXIST: file already exists',
        path: '/existing/file',
        expected:
          "File or directory already exists: '/existing/file'. Try using a different name or path.",
      },
      {
        code: 'EEXIST',
        message: 'EEXIST: file already exists',
        expected:
          'File or directory already exists. Try using a different name or path.',
      },
      {
        code: 'EBUSY',
        message: 'EBUSY: resource busy or locked',
        path: '/locked/file',
        expected:
          "Resource busy or locked: '/locked/file'. Close any programs that might be using the file.",
      },
      {
        code: 'EBUSY',
        message: 'EBUSY: resource busy or locked',
        expected:
          'Resource busy or locked. Close any programs that might be using the file.',
      },
      {
        code: 'EMFILE',
        message: 'EMFILE: too many open files',
        expected:
          'Too many open files. Close some unused files or applications.',
      },
      {
        code: 'ENFILE',
        message: 'ENFILE: file table overflow',
        expected:
          'Too many open files in system. Close some unused files or applications.',
      },
      {
        code: 'ECONNRESET',
        message: 'ECONNRESET: connection reset by peer',
        expected:
          'Connection reset by peer. The network connection was unexpectedly closed.',
      },
      {
        code: 'ETIMEDOUT',
        message: 'ETIMEDOUT: operation timed out',
        expected:
          'Operation timed out. The network connection or filesystem operation took too long.',
      },
    ];

    it.each(testCases)(
      'returns friendly message for $code (path: $path)',
      ({ code, message, path, expected }) => {
        const error = createNodeError(code, message, path);
        expect(getFsErrorMessage(error)).toBe(expected);
      },
    );
  });

  describe('unknown node error codes', () => {
    const testCases: FsErrorCase[] = [
      {
        code: 'EUNKNOWN',
        message: 'Some unknown error occurred',
        expected: 'Some unknown error occurred (EUNKNOWN)',
      },
      {
        code: 'toString',
        message: 'Unexpected error',
        path: '/some/path',
        expected: 'Unexpected error (toString)',
      },
    ];

    it.each(testCases)(
      'includes code in fallback message for $code',
      ({ code, message, path, expected }) => {
        const error = createNodeError(code, message, path);
        expect(getFsErrorMessage(error)).toBe(expected);
      },
    );
  });

  describe('non-node and nullish errors', () => {
    const fallbackCases: FallbackErrorCase[] = [
      {
        value: new Error('Something went wrong'),
        expected: 'Something went wrong',
      },
      { value: 'string error', expected: 'string error' },
      { value: 12345, expected: '12345' },
      { value: null, expected: 'An unknown error occurred' },
      { value: undefined, expected: 'An unknown error occurred' },
    ];

    it.each(fallbackCases)(
      'returns a message for $value',
      ({ value, expected }) => {
        expect(getFsErrorMessage(value)).toBe(expected);
      },
    );

    it.each([null, undefined] as const)(
      'uses custom default for %s',
      (value) => {
        expect(getFsErrorMessage(value, 'Custom default')).toBe(
          'Custom default',
        );
      },
    );
  });
});
