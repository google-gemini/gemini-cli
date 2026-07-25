/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import * as os from 'node:os';
import {
  deleteSessionArtifactsAsync,
  deleteSubagentSessionDirAndArtifactsAsync,
  validateAndSanitizeSessionId,
} from './sessionOperations.js';

describe('sessionOperations', () => {
  let tempDir: string;
  let chatsDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Create a real temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-ops-test-'));
    chatsDir = path.join(tempDir, 'chats');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    // Clean up the temporary directory
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('validateAndSanitizeSessionId', () => {
    it('should throw for empty or dangerous IDs', () => {
      expect(() => validateAndSanitizeSessionId('')).toThrow(
        'Invalid sessionId',
      );
      expect(() => validateAndSanitizeSessionId('.')).toThrow(
        'Invalid sessionId',
      );
      expect(() => validateAndSanitizeSessionId('..')).toThrow(
        'Invalid sessionId',
      );
    });

    it('should sanitize valid IDs', () => {
      expect(validateAndSanitizeSessionId('abc/def')).toBe('abc_def');
      expect(validateAndSanitizeSessionId('valid-id')).toBe('valid-id');
    });
  });

  describe('deleteSessionArtifactsAsync', () => {
    it('should delete logs and tool outputs', async () => {
      const sessionId = 'test-session';
      const logsDir = path.join(tempDir, 'logs');
      const toolOutputsDir = path.join(
        tempDir,
        'tool-outputs',
        `session-${sessionId}`,
      );
      const sessionDir = path.join(tempDir, sessionId);

      await fs.mkdir(logsDir, { recursive: true });
      await fs.mkdir(toolOutputsDir, { recursive: true });
      await fs.mkdir(sessionDir, { recursive: true });

      const logFile = path.join(logsDir, `session-${sessionId}.jsonl`);
      await fs.writeFile(logFile, '{}');

      // Verify files exist before call
      expect(await fs.stat(logFile)).toBeTruthy();
      expect(await fs.stat(toolOutputsDir)).toBeTruthy();
      expect(await fs.stat(sessionDir)).toBeTruthy();

      await deleteSessionArtifactsAsync(sessionId, tempDir);

      // Verify files are deleted
      await expect(fs.stat(logFile)).rejects.toThrow();
      await expect(fs.stat(toolOutputsDir)).rejects.toThrow();
      await expect(fs.stat(sessionDir)).rejects.toThrow();
    });

    it('should ignore ENOENT errors during deletion', async () => {
      // Don't create any files. Calling delete on non-existent files should not throw.
      await expect(
        deleteSessionArtifactsAsync('non-existent', tempDir),
      ).resolves.toBeUndefined();
    });
  });

  describe('deleteSubagentSessionDirAndArtifactsAsync', () => {
    it('should iterate subagent files and delete their artifacts', async () => {
      const parentSessionId = 'parent-123';
      const subDir = path.join(chatsDir, parentSessionId);
      await fs.mkdir(subDir, { recursive: true });

      await fs.writeFile(path.join(subDir, 'sub1.json'), '{}');
      await fs.writeFile(path.join(subDir, 'sub2.json'), '{}');

      const logsDir = path.join(tempDir, 'logs');
      await fs.mkdir(logsDir, { recursive: true });
      await fs.writeFile(path.join(logsDir, 'session-sub1.jsonl'), '{}');
      await fs.writeFile(path.join(logsDir, 'session-sub2.jsonl'), '{}');

      await deleteSubagentSessionDirAndArtifactsAsync(
        parentSessionId,
        chatsDir,
        tempDir,
      );

      // Verify subagent directory is deleted
      await expect(fs.stat(subDir)).rejects.toThrow();

      // Verify artifacts are deleted
      await expect(
        fs.stat(path.join(logsDir, 'session-sub1.jsonl')),
      ).rejects.toThrow();
      await expect(
        fs.stat(path.join(logsDir, 'session-sub2.jsonl')),
      ).rejects.toThrow();
    });

    it('should resolve for safe path even if input contains traversals (due to sanitization)', async () => {
      // Should sanitize '../unsafe' to '.._unsafe' and resolve (directory won't exist, so readdir returns [] naturally)
      await expect(
        deleteSubagentSessionDirAndArtifactsAsync(
          '../unsafe',
          chatsDir,
          tempDir,
        ),
      ).resolves.toBeUndefined();
    });

    it('should handle ENOENT for readdir gracefully', async () => {
      // Non-existent directory should not throw
      await expect(
        deleteSubagentSessionDirAndArtifactsAsync(
          'non-existent-parent',
          chatsDir,
          tempDir,
        ),
      ).resolves.toBeUndefined();
    });
  });
});
