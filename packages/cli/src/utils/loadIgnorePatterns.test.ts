/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  Mock,
  beforeAll,
} from 'vitest';
import * as path from 'node:path';
import { loadGeminiIgnorePatterns } from './loadIgnorePatterns.js';
import os from 'node:os';

// Define the type for our mock function explicitly.
type ReadFileSyncMockType = Mock<
  (path: string, encoding: string) => string | Buffer
>;

// Declare a variable to hold our mock function instance.
let mockedFsReadFileSync: ReadFileSyncMockType;

vi.mock('node:fs', async () => {
  const actualFsModule =
    await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actualFsModule,
    readFileSync: vi.fn(), // The factory creates and returns the vi.fn() instance.
  };
});

let actualFs: typeof import('node:fs');

describe('loadGeminiIgnorePatterns', () => {
  let tempDir: string;
  let consoleLogSpy: Mock<
    (message?: unknown, ...optionalParams: unknown[]) => void
  >;
  let consoleWarnSpy: Mock<
    (message?: unknown, ...optionalParams: unknown[]) => void
  >;

  beforeAll(async () => {
    actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const mockedFsModule = await import('node:fs');
    mockedFsReadFileSync =
      mockedFsModule.readFileSync as unknown as ReadFileSyncMockType;
  });

  beforeEach(() => {
    tempDir = actualFs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-ignore-test-'),
    );
    consoleLogSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(() => {}) as Mock<
      (message?: unknown, ...optionalParams: unknown[]) => void
    >;
    consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {}) as Mock<
      (message?: unknown, ...optionalParams: unknown[]) => void
    >;
    mockedFsReadFileSync.mockReset();
  });

  afterEach(() => {
    if (actualFs.existsSync(tempDir)) {
      actualFs.rmSync(tempDir, { recursive: true, force: true });
    }
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should load and parse patterns from .geminiignore, ignoring comments and empty lines', () => {
    const ignoreContent = [
      '# This is a comment',
      'pattern1',
      '  pattern2  ', // Should be trimmed
      '', // Empty line
      'pattern3 # Inline comment', // Handled by trim
      '*.log',
      '!important.file',
    ].join('\n');
    const ignoreFilePath = path.join(tempDir, '.geminiignore');
    actualFs.writeFileSync(ignoreFilePath, ignoreContent);

    mockedFsReadFileSync.mockImplementation((p: string, encoding: string) => {
      if (p === ignoreFilePath && encoding === 'utf-8') return ignoreContent;
      throw new Error(
        `Mock fs.readFileSync: Unexpected call with path: ${p}, encoding: ${encoding}`,
      );
    });

    const patterns = loadGeminiIgnorePatterns(tempDir);

    expect(patterns).toEqual([
      'pattern1',
      'pattern2',
      'pattern3 # Inline comment',
      '*.log',
      '!important.file',
    ]);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Loaded 5 patterns from .geminiignore'),
    );
    expect(mockedFsReadFileSync).toHaveBeenCalledWith(ignoreFilePath, 'utf-8');
  });

  it('should return an empty array and log info if .geminiignore is not found', () => {
    const ignoreFilePath = path.join(tempDir, '.geminiignore');
    mockedFsReadFileSync.mockImplementation((p: string, encoding: string) => {
      if (p === ignoreFilePath && encoding === 'utf-8') {
        const error = new Error('File not found') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      }
      throw new Error(
        `Mock fs.readFileSync: Unexpected call with path: ${p}, encoding: ${encoding}`,
      );
    });

    const patterns = loadGeminiIgnorePatterns(tempDir);
    expect(patterns).toEqual([]);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[INFO] No .geminiignore file found. Proceeding without custom ignore patterns.',
    );
    expect(mockedFsReadFileSync).toHaveBeenCalledWith(ignoreFilePath, 'utf-8');
  });

  it('should return an empty array if .geminiignore is empty', () => {
    const ignoreFilePath = path.join(tempDir, '.geminiignore');
    actualFs.writeFileSync(ignoreFilePath, '');
    mockedFsReadFileSync.mockImplementation((p: string, encoding: string) => {
      if (p === ignoreFilePath && encoding === 'utf-8') return ''; // Return string for empty file
      throw new Error(
        `Mock fs.readFileSync: Unexpected call with path: ${p}, encoding: ${encoding}`,
      );
    });

    const patterns = loadGeminiIgnorePatterns(tempDir);
    expect(patterns).toEqual([]);
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Loaded 0 patterns from .geminiignore'),
    );
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('No .geminiignore file found'),
    );
    expect(mockedFsReadFileSync).toHaveBeenCalledWith(ignoreFilePath, 'utf-8');
  });

  it('should return an empty array if .geminiignore contains only comments and empty lines', () => {
    const ignoreContent = [
      '# Comment 1',
      '  # Comment 2 with leading spaces',
      '',
      '   ', // Whitespace only line
    ].join('\n');
    const ignoreFilePath = path.join(tempDir, '.geminiignore');
    actualFs.writeFileSync(ignoreFilePath, ignoreContent);
    mockedFsReadFileSync.mockImplementation((p: string, encoding: string) => {
      if (p === ignoreFilePath && encoding === 'utf-8') return ignoreContent;
      throw new Error(
        `Mock fs.readFileSync: Unexpected call with path: ${p}, encoding: ${encoding}`,
      );
    });

    const patterns = loadGeminiIgnorePatterns(tempDir);
    expect(patterns).toEqual([]);
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Loaded 0 patterns from .geminiignore'),
    );
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('No .geminiignore file found'),
    );
    expect(mockedFsReadFileSync).toHaveBeenCalledWith(ignoreFilePath, 'utf-8');
  });

  it('should handle read errors (other than ENOENT) and log a warning', () => {
    const ignoreFilePath = path.join(tempDir, '.geminiignore');
    mockedFsReadFileSync.mockImplementation((p: string, encoding: string) => {
      if (p === ignoreFilePath && encoding === 'utf-8') {
        const error = new Error('Test read error') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      }
      throw new Error(
        `Mock fs.readFileSync: Unexpected call with path: ${p}, encoding: ${encoding}`,
      );
    });

    const patterns = loadGeminiIgnorePatterns(tempDir);
    expect(patterns).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `[WARN] Could not read .geminiignore file at ${ignoreFilePath}: Test read error`,
      ),
    );
    expect(mockedFsReadFileSync).toHaveBeenCalledWith(ignoreFilePath, 'utf-8');
  });

  it('should correctly handle patterns with inline comments if not starting with #', () => {
    const ignoreContent = 'src/important # but not this part';
    const ignoreFilePath = path.join(tempDir, '.geminiignore');
    actualFs.writeFileSync(ignoreFilePath, ignoreContent);
    mockedFsReadFileSync.mockImplementation((p: string, encoding: string) => {
      if (p === ignoreFilePath && encoding === 'utf-8') return ignoreContent;
      throw new Error(
        `Mock fs.readFileSync: Unexpected call with path: ${p}, encoding: ${encoding}`,
      );
    });

    const patterns = loadGeminiIgnorePatterns(tempDir);
    expect(patterns).toEqual(['src/important # but not this part']);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Loaded 1 patterns from .geminiignore'),
    );
    expect(mockedFsReadFileSync).toHaveBeenCalledWith(ignoreFilePath, 'utf-8');
  });
});
