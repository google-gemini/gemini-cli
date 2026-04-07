/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { tryRealpath } from './fsUtils.js';

describe('fsUtils', () => {
  let tempDir: string;
  let realTempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-utils-test-'));
    realTempDir = fs.realpathSync(tempDir);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('tryRealpath', () => {
    it('should throw error for paths with null bytes', () => {
      expect(() => tryRealpath(path.join(tempDir, 'foo\0bar'))).toThrow(
        'Invalid path',
      );
    });

    it('should resolve existing paths', () => {
      const resolved = tryRealpath(tempDir);
      expect(resolved).toBe(realTempDir);
    });

    it('should handle non-existent paths by resolving parent', () => {
      const nonExistentPath = path.join(tempDir, 'non-existent-file-12345');
      const expected = path.join(realTempDir, 'non-existent-file-12345');
      const resolved = tryRealpath(nonExistentPath);
      expect(resolved).toBe(expected);
    });

    it('should handle nested non-existent paths', () => {
      const nonExistentPath = path.join(tempDir, 'dir1', 'dir2', 'file');
      const expected = path.join(realTempDir, 'dir1', 'dir2', 'file');
      const resolved = tryRealpath(nonExistentPath);
      expect(resolved).toBe(expected);
    });
  });
});
