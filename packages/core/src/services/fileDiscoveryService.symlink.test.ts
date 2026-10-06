/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { FileDiscoveryService } from './fileDiscoveryService.js';
import { GEMINI_IGNORE_FILE_NAME } from '../config/constants.js';

describe('FileDiscoveryService - Symlink Ignore Handling', () => {
  let testRootDir: string;
  let projectRoot: string;

  async function createTestFile(filePath: string, content = '') {
    const fullPath = path.join(projectRoot, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
    return fullPath;
  }

  async function createSymlink(
    targetRelativePath: string,
    linkRelativePath: string,
  ) {
    const targetPath = path.join(projectRoot, targetRelativePath);
    const linkPath = path.join(projectRoot, linkRelativePath);
    await fs.mkdir(path.dirname(linkPath), { recursive: true });
    await fs.symlink(targetPath, linkPath);
    return linkPath;
  }

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'file-discovery-symlink-test-'),
    );
    try {
      testRootDir = await fs.realpath(testRootDir);
    } catch {
      // Fallback
    }
    projectRoot = path.join(testRootDir, 'project');
    await fs.mkdir(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  it('should ignore an unignored symlink when pointing to an ignored target file (Scenario A)', async () => {
    await createTestFile(GEMINI_IGNORE_FILE_NAME, 'secret.txt\n');
    await createTestFile('secret.txt', 'sensitive content');
    await createSymlink('secret.txt', 'public_link.txt');

    const service = new FileDiscoveryService(projectRoot);

    expect(service.shouldIgnoreFile('secret.txt')).toBe(true);
    expect(service.shouldIgnoreFile('public_link.txt')).toBe(true);
    expect(
      service.shouldIgnoreFile(path.join(projectRoot, 'public_link.txt')),
    ).toBe(true);
  });

  it('should ignore a symlink whose name matches an ignore pattern even if target is not ignored (Scenario B)', async () => {
    await createTestFile(GEMINI_IGNORE_FILE_NAME, 'ignored_link.txt\n');
    await createTestFile('public.txt', 'public content');
    await createSymlink('public.txt', 'ignored_link.txt');

    const service = new FileDiscoveryService(projectRoot);

    expect(service.shouldIgnoreFile('public.txt')).toBe(false);
    expect(service.shouldIgnoreFile('ignored_link.txt')).toBe(true);
    expect(
      service.shouldIgnoreFile(path.join(projectRoot, 'ignored_link.txt')),
    ).toBe(true);
  });

  it('should handle broken symlinks gracefully without throwing unhandled exceptions (Scenario C)', async () => {
    await createTestFile(GEMINI_IGNORE_FILE_NAME, 'ignored_missing.txt\n');
    // Create broken symlink pointing to non-existent target
    const linkPath = path.join(projectRoot, 'broken_link.txt');
    await fs.symlink(path.join(projectRoot, 'non_existent.txt'), linkPath);

    const service = new FileDiscoveryService(projectRoot);

    expect(() => service.shouldIgnoreFile('broken_link.txt')).not.toThrow();
    expect(service.shouldIgnoreFile('broken_link.txt')).toBe(false);
  });

  it('should correctly filter a mixed list of symlinks and files with filterFilesWithReport', async () => {
    await createTestFile(
      GEMINI_IGNORE_FILE_NAME,
      'private.txt\nignored_link.txt\n',
    );
    await createTestFile('private.txt', 'private');
    await createTestFile('public.txt', 'public');
    await createSymlink('private.txt', 'link_to_private.txt');
    await createSymlink('public.txt', 'ignored_link.txt');
    await createSymlink('public.txt', 'valid_link.txt');

    const service = new FileDiscoveryService(projectRoot);

    const report = service.filterFilesWithReport([
      'public.txt',
      'private.txt',
      'link_to_private.txt',
      'ignored_link.txt',
      'valid_link.txt',
    ]);

    expect(report.filteredPaths).toEqual(['public.txt', 'valid_link.txt']);
    expect(report.ignoredCount).toBe(3);
  });

  it('should respect isSymbolicLink option when passed explicitly (Scenario D)', async () => {
    await createTestFile(GEMINI_IGNORE_FILE_NAME, 'target.txt\n');
    await createTestFile('target.txt', 'target content');
    await createSymlink('target.txt', 'link.txt');

    const service = new FileDiscoveryService(projectRoot);

    // When isSymbolicLink is explicitly passed as true
    expect(service.shouldIgnoreFile('link.txt', { isSymbolicLink: true })).toBe(
      true,
    );

    // When isSymbolicLink is explicitly false on an unignored literal path, skips symlink resolution
    expect(
      service.shouldIgnoreFile('link.txt', { isSymbolicLink: false }),
    ).toBe(false);
  });

  it('should correctly discover ignored symlink paths in getIgnoredPaths recursive walk (Scenario E)', async () => {
    await createTestFile(GEMINI_IGNORE_FILE_NAME, 'confidential.txt\n');
    await createTestFile('confidential.txt', 'confidential');
    await createTestFile('regular.txt', 'regular');
    await createSymlink('confidential.txt', 'link_to_confidential.txt');

    const service = new FileDiscoveryService(projectRoot);
    const ignoredPaths = await service.getIgnoredPaths();

    expect(ignoredPaths).toContain(path.join(projectRoot, 'confidential.txt'));
    expect(ignoredPaths).toContain(
      path.join(projectRoot, 'link_to_confidential.txt'),
    );
    expect(ignoredPaths).not.toContain(path.join(projectRoot, 'regular.txt'));
  });

  it('should dynamically detect if a symlink target is a directory to match directory-only ignore patterns (Scenario F)', async () => {
    await createTestFile(GEMINI_IGNORE_FILE_NAME, 'ignored_dir/\n');

    // Create a directory and a symlink pointing to it
    const targetDir = path.join(projectRoot, 'ignored_dir');
    await fs.mkdir(targetDir, { recursive: true });
    await createTestFile('ignored_dir/file.txt', 'content');
    await createSymlink('ignored_dir', 'link_to_dir');

    const service = new FileDiscoveryService(projectRoot);

    // Even though we call shouldIgnoreFile (which passes isDirectory = false),
    // it should dynamically detect that the target is a directory and match 'ignored_dir/'
    expect(service.shouldIgnoreFile('link_to_dir')).toBe(true);
  });

  it('should ignore symlinks pointing outside the project root (Scenario G)', async () => {
    // Create an external directory outside projectRoot
    const outsideDir = path.join(testRootDir, 'outside');
    await fs.mkdir(outsideDir, { recursive: true });
    await fs.writeFile(
      path.join(outsideDir, 'external.txt'),
      'outside content',
    );

    const linkPath = path.join(projectRoot, 'my_link');
    await fs.symlink(outsideDir, linkPath);

    const service = new FileDiscoveryService(projectRoot);
    expect(service.shouldIgnoreFile('my_link')).toBe(true);
    expect(service.shouldIgnoreDirectory('my_link')).toBe(true);
    expect(service.filterFiles(['my_link'])).toEqual([]);
  });
});
