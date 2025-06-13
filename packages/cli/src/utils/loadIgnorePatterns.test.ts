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
    mockedFsReadFileSync.mockReset();
  });

  afterEach(() => {
    if (actualFs.existsSync(tempDir)) {
      actualFs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('should load and parse patterns from .geminiignore, ignoring comments and empty lines', async () => {
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

    const patterns = await loadGeminiIgnorePatterns(tempDir);

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
  });

  it('should return an empty array and log info if .geminiignore is not found', async () => {
    const patterns = await loadGeminiIgnorePatterns(tempDir);
    expect(patterns).toEqual([]);
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('should return an empty array if .geminiignore is empty', async () => {
    const ignoreFilePath = path.join(tempDir, '.geminiignore');
    actualFs.writeFileSync(ignoreFilePath, '');

    const patterns = await loadGeminiIgnorePatterns(tempDir);
    expect(patterns).toEqual([]);
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Loaded 0 patterns from .geminiignore'),
    );
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('No .geminiignore file found'),
    );
  });

  it('should return an empty array if .geminiignore contains only comments and empty lines', async () => {
    const ignoreContent = [
      '# Comment 1',
      '  # Comment 2 with leading spaces',
      '',
      '   ', // Whitespace only line
    ].join('\n');
    const ignoreFilePath = path.join(tempDir, '.geminiignore');
    actualFs.writeFileSync(ignoreFilePath, ignoreContent);

    const patterns = await loadGeminiIgnorePatterns(tempDir);
    expect(patterns).toEqual([]);
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Loaded 0 patterns from .geminiignore'),
    );
    expect(consoleLogSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('No .geminiignore file found'),
    );
  });

  it('should correctly handle patterns with inline comments if not starting with #', async () => {
    const ignoreContent = 'src/important # but not this part';
    const ignoreFilePath = path.join(tempDir, '.geminiignore');
    actualFs.writeFileSync(ignoreFilePath, ignoreContent);

    const patterns = await loadGeminiIgnorePatterns(tempDir);
    expect(patterns).toEqual(['src/important # but not this part']);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Loaded 1 patterns from .geminiignore'),
    );
  });
});
