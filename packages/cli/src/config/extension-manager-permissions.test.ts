/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { copyExtension } from './extension-manager.js';

describe('copyExtension permissions', () => {
  let tempDir: string;
  let sourceDir: string;
  let destDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-permission-test-'));
    sourceDir = path.join(tempDir, 'source');
    destDir = path.join(tempDir, 'dest');
    fs.mkdirSync(sourceDir);
  });

  afterEach(() => {
    // Ensure we can delete the temp directory by making everything writable again
    const makeWritableSync = (p: string) => {
      try {
        const stats = fs.lstatSync(p);
        fs.chmodSync(p, stats.mode | 0o700);
        if (stats.isDirectory()) {
          fs.readdirSync(p).forEach((child) =>
            makeWritableSync(path.join(p, child)),
          );
        }
      } catch (_e) {
        // Ignore errors during cleanup
      }
    };

    if (fs.existsSync(tempDir)) {
      makeWritableSync(tempDir);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should make destination writable even if source is read-only', async () => {
    const fileName = 'test.txt';
    const filePath = path.join(sourceDir, fileName);
    fs.writeFileSync(filePath, 'hello');

    // Make source read-only: 0o555 for directory, 0o444 for file
    fs.chmodSync(filePath, 0o444);
    fs.chmodSync(sourceDir, 0o555);

    // Verify source is read-only
    expect(() => fs.writeFileSync(filePath, 'fail')).toThrow();

    // Perform copy
    await copyExtension(sourceDir, destDir);

    // Verify destination is writable
    const destFilePath = path.join(destDir, fileName);
    const destFileStats = fs.statSync(destFilePath);
    const destDirStats = fs.statSync(destDir);

    // Check that owner write bits are set (0o200)
    expect(destFileStats.mode & 0o200).toBe(0o200);
    expect(destDirStats.mode & 0o200).toBe(0o200);

    // Verify we can actually write to the destination file
    fs.writeFileSync(destFilePath, 'writable');
    expect(fs.readFileSync(destFilePath, 'utf-8')).toBe('writable');

    // Verify we can delete the destination (which requires write bit on destDir)
    fs.rmSync(destFilePath);
    expect(fs.existsSync(destFilePath)).toBe(false);
  });

  it('should handle nested directories with restrictive permissions', async () => {
    const subDir = path.join(sourceDir, 'subdir');
    fs.mkdirSync(subDir);
    const fileName = 'nested.txt';
    const filePath = path.join(subDir, fileName);
    fs.writeFileSync(filePath, 'nested content');

    // Make nested structure read-only
    fs.chmodSync(filePath, 0o444);
    fs.chmodSync(subDir, 0o555);
    fs.chmodSync(sourceDir, 0o555);

    // Perform copy
    await copyExtension(sourceDir, destDir);

    // Verify nested destination is writable
    const destSubDir = path.join(destDir, 'subdir');
    const destFilePath = path.join(destSubDir, fileName);

    expect(fs.statSync(destSubDir).mode & 0o200).toBe(0o200);
    expect(fs.statSync(destFilePath).mode & 0o200).toBe(0o200);

    // Verify we can delete the whole destination tree
    await fs.promises.rm(destDir, { recursive: true, force: true });
    expect(fs.existsSync(destDir)).toBe(false);
  });

  it('should not follow symlinks or modify symlink targets', async () => {
    const symlinkTarget = path.join(tempDir, 'external-target');
    fs.writeFileSync(symlinkTarget, 'external content');
    // Target is read-only
    fs.chmodSync(symlinkTarget, 0o444);

    const symlinkPath = path.join(sourceDir, 'symlink-file');
    fs.symlinkSync(symlinkTarget, symlinkPath);

    // Perform copy
    await copyExtension(sourceDir, destDir);

    const destSymlinkPath = path.join(destDir, 'symlink-file');
    const destSymlinkStats = fs.lstatSync(destSymlinkPath);

    // Verify it is still a symlink in the destination
    expect(destSymlinkStats.isSymbolicLink()).toBe(true);

    // Verify the target (external to the extension) was NOT modified
    const targetStats = fs.statSync(symlinkTarget);
    // Owner write bit should still NOT be set (0o200)
    expect(targetStats.mode & 0o200).toBe(0o000);

    // Clean up
    fs.chmodSync(symlinkTarget, 0o644);
  });
});
