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
import { StandardFileSystemService } from '../services/fileSystemService.js';
import { correctPath } from './pathCorrector.js';

describe('pathCorrector', () => {
  let tempDir: string;
  let rootDir: string;
  let otherWorkspaceDir: string;
  let mockConfig: Config;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-corrector-test-'));
    rootDir = path.join(tempDir, 'root');
    otherWorkspaceDir = path.join(tempDir, 'other');
    fs.mkdirSync(rootDir, { recursive: true });
    fs.mkdirSync(otherWorkspaceDir, { recursive: true });

    const fileSystemService = new StandardFileSystemService();
    // Mock findFiles to search in both directories
    vi.spyOn(fileSystemService, 'findFiles').mockImplementation(
      (filePath: string, searchPaths: readonly string[]) => {
        const found: string[] = [];
        for (const searchPath of searchPaths) {
          // A simplified find logic for tests
          const potentialPath = path.join(searchPath, filePath);
          if (fs.existsSync(potentialPath)) {
            found.push(potentialPath);
          }
        }
        return found;
      },
    );

    mockConfig = {
      getTargetDir: () => rootDir,
      getWorkspaceContext: () =>
        createMockWorkspaceContext(rootDir, [otherWorkspaceDir]),
      getFileSystemService: () => fileSystemService,
    } as unknown as Config;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should correct a relative path if it is unambiguous in the target dir', () => {
    const testFile = 'unique.txt';
    fs.writeFileSync(path.join(rootDir, testFile), 'content');

    const result = correctPath(testFile, mockConfig);

    expect(result.error).toBeUndefined();
    expect(result.correctedPath).toBe(path.join(rootDir, testFile));
  });

  it('should correct a partial relative path if it is unambiguous in another workspace dir', () => {
    const subDir = path.join(otherWorkspaceDir, 'sub');
    fs.mkdirSync(subDir);
    const testFile = 'file.txt';
    const partialPath = path.join('sub', testFile);
    const fullPath = path.join(subDir, testFile);
    fs.writeFileSync(fullPath, 'content');

    const result = correctPath(partialPath, mockConfig);

    expect(result.error).toBeUndefined();
    expect(result.correctedPath).toBe(fullPath);
  });

  it('should return an error for a relative path that does not exist', () => {
    const result = correctPath('nonexistent.txt', mockConfig);
    expect(result.error).toMatch(
      /File not found for 'nonexistent.txt' and path is not absolute./,
    );
    expect(result.correctedPath).toBeUndefined();
  });

  it('should return an error for an ambiguous path', () => {
    const ambiguousFile = 'component.ts';
    const subDir1 = path.join(rootDir, 'module1');
    const subDir2 = path.join(otherWorkspaceDir, 'module2');
    fs.mkdirSync(subDir1, { recursive: true });
    fs.mkdirSync(subDir2, { recursive: true });
    fs.writeFileSync(path.join(subDir1, ambiguousFile), 'content 1');
    fs.writeFileSync(path.join(subDir2, ambiguousFile), 'content 2');

    // Simulate finding multiple files with same file name
    const fileSystemService = new StandardFileSystemService();
    vi.spyOn(fileSystemService, 'findFiles').mockReturnValue([
      path.join(subDir1, ambiguousFile),
      path.join(subDir2, ambiguousFile),
    ]);
    mockConfig.getFileSystemService = () => fileSystemService;

    const result = correctPath(ambiguousFile, mockConfig);

    expect(result.error).toMatch(
      /The file path 'component.ts' is ambiguous and matches multiple files./,
    );
    expect(result.correctedPath).toBeUndefined();
  });
});
