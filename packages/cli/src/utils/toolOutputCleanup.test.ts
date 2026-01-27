/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLogger } from '@google/gemini-cli-core';
import type { Settings } from '../config/settings.js';
import { cleanupToolOutputFiles } from './sessionCleanup.js';

// Use the constant value directly
const TOOL_OUTPUT_DIR = 'tool_output';

describe('Tool Output Cleanup', () => {
  let testTempDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tool-output-test-'));
    vi.spyOn(debugLogger, 'error').mockImplementation(() => {});
    vi.spyOn(debugLogger, 'warn').mockImplementation(() => {});
    vi.spyOn(debugLogger, 'debug').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Clean up the temp directory
    try {
      await fs.rm(testTempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('cleanupToolOutputFiles', () => {
    it('should return early when cleanup is disabled', async () => {
      const settings: Settings = {
        general: { sessionRetention: { enabled: false } },
      };

      const result = await cleanupToolOutputFiles(settings, false, testTempDir);

      expect(result.disabled).toBe(true);
      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should return early when sessionRetention is not configured', async () => {
      const settings: Settings = {};

      const result = await cleanupToolOutputFiles(settings, false, testTempDir);

      expect(result.disabled).toBe(true);
      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('should return early when tool_output directory does not exist', async () => {
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '7d',
          },
        },
      };

      // Don't create the tool_output directory
      const result = await cleanupToolOutputFiles(settings, false, testTempDir);

      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should delete files older than maxAge', async () => {
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '7d',
          },
        },
      };

      // Create tool_output directory and files
      const toolOutputDir = path.join(testTempDir, TOOL_OUTPUT_DIR);
      await fs.mkdir(toolOutputDir, { recursive: true });

      const now = Date.now();
      const fiveDaysAgo = now - 5 * 24 * 60 * 60 * 1000;
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

      // Create files with different ages
      const recentFile = path.join(toolOutputDir, 'shell_recent.txt');
      const oldFile = path.join(toolOutputDir, 'shell_old.txt');

      await fs.writeFile(recentFile, 'recent content');
      await fs.writeFile(oldFile, 'old content');

      // Set file modification times
      await fs.utimes(recentFile, fiveDaysAgo / 1000, fiveDaysAgo / 1000);
      await fs.utimes(oldFile, tenDaysAgo / 1000, tenDaysAgo / 1000);

      const result = await cleanupToolOutputFiles(settings, false, testTempDir);

      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(2);
      expect(result.deleted).toBe(1); // Only the 10-day-old file should be deleted
      expect(result.failed).toBe(0);

      // Verify the old file was deleted and recent file remains
      const remainingFiles = await fs.readdir(toolOutputDir);
      expect(remainingFiles).toContain('shell_recent.txt');
      expect(remainingFiles).not.toContain('shell_old.txt');
    });

    it('should delete oldest files when exceeding maxCount', async () => {
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxCount: 2,
          },
        },
      };

      // Create tool_output directory and files
      const toolOutputDir = path.join(testTempDir, TOOL_OUTPUT_DIR);
      await fs.mkdir(toolOutputDir, { recursive: true });

      const now = Date.now();
      const oneDayAgo = now - 1 * 24 * 60 * 60 * 1000;
      const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

      // Create 3 files with different ages
      const file1 = path.join(toolOutputDir, 'shell_1.txt');
      const file2 = path.join(toolOutputDir, 'shell_2.txt');
      const file3 = path.join(toolOutputDir, 'shell_3.txt');

      await fs.writeFile(file1, 'content 1');
      await fs.writeFile(file2, 'content 2');
      await fs.writeFile(file3, 'content 3');

      // Set file modification times (file3 is oldest)
      await fs.utimes(file1, oneDayAgo / 1000, oneDayAgo / 1000);
      await fs.utimes(file2, twoDaysAgo / 1000, twoDaysAgo / 1000);
      await fs.utimes(file3, threeDaysAgo / 1000, threeDaysAgo / 1000);

      const result = await cleanupToolOutputFiles(settings, false, testTempDir);

      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(3);
      expect(result.deleted).toBe(1); // Should delete 1 file to get down to maxCount of 2
      expect(result.failed).toBe(0);

      // Verify the oldest file was deleted
      const remainingFiles = await fs.readdir(toolOutputDir);
      expect(remainingFiles).toHaveLength(2);
      expect(remainingFiles).not.toContain('shell_3.txt');
    });

    it('should handle empty directory', async () => {
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '7d',
          },
        },
      };

      // Create empty tool_output directory
      const toolOutputDir = path.join(testTempDir, TOOL_OUTPUT_DIR);
      await fs.mkdir(toolOutputDir, { recursive: true });

      const result = await cleanupToolOutputFiles(settings, false, testTempDir);

      expect(result.disabled).toBe(false);
      expect(result.scanned).toBe(0);
      expect(result.deleted).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should log debug information when enabled', async () => {
      const settings: Settings = {
        general: {
          sessionRetention: {
            enabled: true,
            maxAge: '1d',
          },
        },
      };

      // Create tool_output directory and an old file
      const toolOutputDir = path.join(testTempDir, TOOL_OUTPUT_DIR);
      await fs.mkdir(toolOutputDir, { recursive: true });

      const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
      const oldFile = path.join(toolOutputDir, 'shell_old.txt');
      await fs.writeFile(oldFile, 'old content');
      await fs.utimes(oldFile, tenDaysAgo / 1000, tenDaysAgo / 1000);

      const debugSpy = vi
        .spyOn(debugLogger, 'debug')
        .mockImplementation(() => {});

      await cleanupToolOutputFiles(settings, true, testTempDir);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Tool output cleanup: deleted'),
      );

      debugSpy.mockRestore();
    });
  });
});
