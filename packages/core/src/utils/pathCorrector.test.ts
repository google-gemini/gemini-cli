/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Config } from '../config/config.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { ideContextStore } from '../ide/ideContext.js';
import { correctPath, resolveActiveWorkspaceDir } from './pathCorrector.js';
import { resolveToRealPath } from './paths.js';

describe('pathCorrector', () => {
  let tempDir: string;
  let rootDir: string;
  let otherWorkspaceDir: string;
  let mockConfig: Config;

  beforeEach(() => {
    const rawTempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'path-corrector-test-'),
    );
    tempDir = resolveToRealPath(rawTempDir);
    rootDir = path.join(tempDir, 'root');
    otherWorkspaceDir = path.join(tempDir, 'other');
    fs.mkdirSync(rootDir, { recursive: true });
    fs.mkdirSync(otherWorkspaceDir, { recursive: true });

    mockConfig = {
      getTargetDir: () => rootDir,
      getIdeMode: () => false,
      getWorkspaceContext: () =>
        createMockWorkspaceContext(rootDir, [otherWorkspaceDir]),
      getFileService: () => new FileDiscoveryService(rootDir),
      getFileFilteringOptions: () => ({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      }),
    } as unknown as Config;
  });

  afterEach(() => {
    ideContextStore.clear();
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should correct a relative path if it is unambiguous in the target dir', () => {
    const testFile = 'unique.txt';
    fs.writeFileSync(path.join(rootDir, testFile), 'content');

    const result = correctPath(testFile, mockConfig);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.correctedPath).toBe(path.join(rootDir, testFile));
    }
  });

  it('should correct a partial relative path if it is unambiguous in another workspace dir', () => {
    const subDir = path.join(otherWorkspaceDir, 'sub');
    fs.mkdirSync(subDir);
    const testFile = 'file.txt';
    const fullPath = path.join(subDir, testFile);
    fs.writeFileSync(fullPath, 'content');

    const result = correctPath(testFile, mockConfig);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.correctedPath).toBe(fullPath);
    }
  });

  it('should return an error for a relative path that does not exist', () => {
    const result = correctPath('nonexistent.txt', mockConfig);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(
        /File not found for 'nonexistent.txt' and path is not absolute./,
      );
    } else {
      expect.fail('Expected path correction to fail.');
    }
  });

  it('should return an error for an ambiguous path', () => {
    const ambiguousFile = 'component.ts';
    const subDir1 = path.join(rootDir, 'module1');
    const subDir2 = path.join(otherWorkspaceDir, 'module2');
    fs.mkdirSync(subDir1, { recursive: true });
    fs.mkdirSync(subDir2, { recursive: true });
    fs.writeFileSync(path.join(subDir1, ambiguousFile), 'content 1');
    fs.writeFileSync(path.join(subDir2, ambiguousFile), 'content 2');

    const result = correctPath(ambiguousFile, mockConfig);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(
        /The file path 'component.ts' is ambiguous and matches multiple files./,
      );
    } else {
      expect.fail('Expected path correction to fail.');
    }
  });

  it('should prioritize the active IDE workspace directory when resolving ambiguous or relative paths in IDE mode', () => {
    const ambiguousFile = 'component.ts';
    const subDir1 = path.join(rootDir, 'module1');
    const subDir2 = path.join(otherWorkspaceDir, 'module2');
    fs.mkdirSync(subDir1, { recursive: true });
    fs.mkdirSync(subDir2, { recursive: true });
    fs.writeFileSync(path.join(subDir1, ambiguousFile), 'content 1');
    const activeTargetFile = path.join(subDir2, ambiguousFile);
    fs.writeFileSync(activeTargetFile, 'content 2');

    vi.spyOn(mockConfig, 'getIdeMode').mockReturnValue(true);

    ideContextStore.set({
      workspaceState: {
        openFiles: [
          {
            path: activeTargetFile,
            timestamp: Date.now(),
            isActive: true,
          },
        ],
      },
    });

    expect(resolveActiveWorkspaceDir(mockConfig, ambiguousFile)).toBe(
      otherWorkspaceDir,
    );

    const result = correctPath(ambiguousFile, mockConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.correctedPath).toBe(activeTargetFile);
    }
  });

  it('should fall back to default target directory if resolving paths throws an error', () => {
    vi.spyOn(mockConfig, 'getIdeMode').mockReturnValue(true);
    const activeTargetFile = path.join(otherWorkspaceDir, 'index.ts');
    fs.writeFileSync(activeTargetFile, 'export {};');

    ideContextStore.set({
      workspaceState: {
        openFiles: [
          {
            path: activeTargetFile,
            timestamp: Date.now(),
            isActive: true,
          },
        ],
      },
    });

    vi.spyOn(mockConfig, 'getWorkspaceContext').mockReturnValue(
      createMockWorkspaceContext(rootDir, [
        path.join(tempDir, 'unreadable\0dir'),
        otherWorkspaceDir,
      ]),
    );

    expect(resolveActiveWorkspaceDir(mockConfig, 'README.md')).toBe(
      otherWorkspaceDir,
    );

    ideContextStore.set({
      workspaceState: {
        openFiles: [
          {
            path: path.join(tempDir, 'invalid\0file.ts'),
            timestamp: Date.now(),
            isActive: true,
          },
        ],
      },
    });

    expect(resolveActiveWorkspaceDir(mockConfig, 'README.md')).toBe(rootDir);
  });

  it('should handle backslash-separated prefixed relative paths without duplicating nested repo segments', () => {
    const nestedRepoDir = path.join(rootDir, 'mmm-tools', 'FLUX');
    fs.mkdirSync(path.join(nestedRepoDir, '.git'), { recursive: true });
    const activeFile = path.join(nestedRepoDir, 'src', 'index.ts');
    fs.mkdirSync(path.dirname(activeFile), { recursive: true });
    fs.writeFileSync(activeFile, 'export {};');

    vi.spyOn(mockConfig, 'getIdeMode').mockReturnValue(true);
    ideContextStore.set({
      workspaceState: {
        openFiles: [
          {
            path: activeFile,
            timestamp: Date.now(),
            isActive: true,
          },
        ],
      },
    });

    expect(resolveActiveWorkspaceDir(mockConfig, 'tests\\new-file.txt')).toBe(
      nestedRepoDir,
    );
    expect(
      resolveActiveWorkspaceDir(
        mockConfig,
        'mmm-tools\\FLUX\\tests\\new-file.txt',
      ),
    ).toBe(rootDir);
  });
});
