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

describe('getFsErrorMessage', () => {
  describe('EACCES errors', () => {
    it('should return permission denied message with path', () => {
      const error = createNodeError(
        'EACCES',
        'EACCES: permission denied',
        '/etc/gemini-cli/settings.json',
      );
      expect(getFsErrorMessage(error)).toBe(
        "Permission denied: cannot access '/etc/gemini-cli/settings.json'",
      );
    });

    it('should return permission denied message without path', () => {
      const error = createNodeError('EACCES', 'EACCES: permission denied');
      expect(getFsErrorMessage(error)).toBe('Permission denied');
    });
  });

  describe('ENOENT errors', () => {
    it('should return file not found message with path', () => {
      const error = createNodeError(
        'ENOENT',
        'ENOENT: no such file or directory',
        '/nonexistent/file.txt',
      );
      expect(getFsErrorMessage(error)).toBe(
        "File or directory not found: '/nonexistent/file.txt'",
      );
    });

    it('should return file not found message without path', () => {
      const error = createNodeError(
        'ENOENT',
        'ENOENT: no such file or directory',
      );
      expect(getFsErrorMessage(error)).toBe('File or directory not found');
    });
  });

  describe('ENOSPC errors', () => {
    it('should return no space left message', () => {
      const error = createNodeError(
        'ENOSPC',
        'ENOSPC: no space left on device',
      );
      expect(getFsErrorMessage(error)).toBe('No space left on device');
    });
  });

  describe('EISDIR errors', () => {
    it('should return is directory message with path', () => {
      const error = createNodeError(
        'EISDIR',
        'EISDIR: illegal operation on a directory',
        '/some/directory',
      );
      expect(getFsErrorMessage(error)).toBe(
        "Path is a directory, not a file: '/some/directory'",
      );
    });

    it('should return is directory message without path', () => {
      const error = createNodeError(
        'EISDIR',
        'EISDIR: illegal operation on a directory',
      );
      expect(getFsErrorMessage(error)).toBe('Path is a directory, not a file');
    });
  });

  describe('EROFS errors', () => {
    it('should return read-only filesystem message', () => {
      const error = createNodeError('EROFS', 'EROFS: read-only file system');
      expect(getFsErrorMessage(error)).toBe('Read-only file system');
    });
  });

  describe('EPERM errors', () => {
    it('should return operation not permitted message with path', () => {
      const error = createNodeError(
        'EPERM',
        'EPERM: operation not permitted',
        '/protected/file',
      );
      expect(getFsErrorMessage(error)).toBe(
        "Operation not permitted: '/protected/file'",
      );
    });

    it('should return operation not permitted message without path', () => {
      const error = createNodeError('EPERM', 'EPERM: operation not permitted');
      expect(getFsErrorMessage(error)).toBe('Operation not permitted');
    });
  });

  describe('EEXIST errors', () => {
    it('should return already exists message with path', () => {
      const error = createNodeError(
        'EEXIST',
        'EEXIST: file already exists',
        '/existing/file',
      );
      expect(getFsErrorMessage(error)).toBe(
        "File or directory already exists: '/existing/file'",
      );
    });

    it('should return already exists message without path', () => {
      const error = createNodeError('EEXIST', 'EEXIST: file already exists');
      expect(getFsErrorMessage(error)).toBe('File or directory already exists');
    });
  });

  describe('EBUSY errors', () => {
    it('should return resource busy message with path', () => {
      const error = createNodeError(
        'EBUSY',
        'EBUSY: resource busy or locked',
        '/locked/file',
      );
      expect(getFsErrorMessage(error)).toBe(
        "Resource busy or locked: '/locked/file'",
      );
    });

    it('should return resource busy message without path', () => {
      const error = createNodeError('EBUSY', 'EBUSY: resource busy or locked');
      expect(getFsErrorMessage(error)).toBe('Resource busy or locked');
    });
  });

  describe('EMFILE and ENFILE errors', () => {
    it('should return too many open files for EMFILE', () => {
      const error = createNodeError('EMFILE', 'EMFILE: too many open files');
      expect(getFsErrorMessage(error)).toBe('Too many open files');
    });

    it('should return too many open files for ENFILE', () => {
      const error = createNodeError('ENFILE', 'ENFILE: file table overflow');
      expect(getFsErrorMessage(error)).toBe('Too many open files');
    });
  });

  describe('unknown error codes', () => {
    it('should include the error code in the message', () => {
      const error = createNodeError('EUNKNOWN', 'Some unknown error occurred');
      expect(getFsErrorMessage(error)).toBe(
        'Some unknown error occurred (EUNKNOWN)',
      );
    });

    it('should not match Object.prototype properties like toString', () => {
      const error = createNodeError(
        'toString',
        'Unexpected error',
        '/some/path',
      );
      expect(getFsErrorMessage(error)).toBe('Unexpected error (toString)');
    });
  });

  describe('non-Node errors', () => {
    it('should return the error message for regular Error objects', () => {
      const error = new Error('Something went wrong');
      expect(getFsErrorMessage(error)).toBe('Something went wrong');
    });

    it('should convert non-error objects to string', () => {
      expect(getFsErrorMessage('string error')).toBe('string error');
      expect(getFsErrorMessage(12345)).toBe('12345');
    });
  });

  describe('null and undefined errors', () => {
    it('should return default message for null', () => {
      expect(getFsErrorMessage(null)).toBe('An unknown error occurred');
    });

    it('should return default message for undefined', () => {
      expect(getFsErrorMessage(undefined)).toBe('An unknown error occurred');
    });

    it('should use custom default message when provided', () => {
      expect(getFsErrorMessage(null, 'Custom default')).toBe('Custom default');
      expect(getFsErrorMessage(undefined, 'Custom default')).toBe(
        'Custom default',
      );
    });
  });
});
