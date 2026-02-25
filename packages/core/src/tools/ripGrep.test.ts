/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from 'vitest';
import type { RipGrepToolParams } from './ripGrep.js';
import { canUseRipgrep, RipGrepTool, ensureRgPath } from './ripGrep.js';
import path from 'node:path';
import { isSubpath } from '../utils/paths.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import type { Config } from '../config/config.js';
import { Storage } from '../config/storage.js';
import { GEMINI_IGNORE_FILE_NAME } from '../config/constants.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { PassThrough, Readable } from 'node:stream';
import EventEmitter from 'node:events';
import { downloadRipGrep } from '@joshua.litt/get-ripgrep';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
// Mock dependencies for canUseRipgrep
vi.mock('@joshua.litt/get-ripgrep', () => ({
  downloadRipGrep: vi.fn(),
}));

// Mock child_process for ripgrep calls
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);
const downloadRipGrepMock = vi.mocked(downloadRipGrep);
const originalGetGlobalBinDir = Storage.getGlobalBinDir.bind(Storage);
const storageSpy = vi.spyOn(Storage, 'getGlobalBinDir');

function getRipgrepBinaryName() {
  return process.platform === 'win32' ? 'rg.exe' : 'rg';
}

describe('canUseRipgrep', () => {
  let tempRootDir: string;
  let binDir: string;

  beforeEach(async () => {
    downloadRipGrepMock.mockReset();
    downloadRipGrepMock.mockResolvedValue(undefined);
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ripgrep-bin-'));
    binDir = path.join(tempRootDir, 'bin');
    await fs.mkdir(binDir, { recursive: true });
    storageSpy.mockImplementation(() => binDir);
  });

  afterEach(async () => {
    storageSpy.mockImplementation(() => originalGetGlobalBinDir());
    await fs.rm(tempRootDir, { recursive: true, force: true });
  });

  it('should return true if ripgrep already exists', async () => {
    const existingPath = path.join(binDir, getRipgrepBinaryName());
    await fs.writeFile(existingPath, '');

    const result = await canUseRipgrep();
    expect(result).toBe(true);
    expect(downloadRipGrepMock).not.toHaveBeenCalled();
  });

  it('should download ripgrep and return true if it does not exist initially', async () => {
    const expectedPath = path.join(binDir, getRipgrepBinaryName());

    downloadRipGrepMock.mockImplementation(async () => {
      await fs.writeFile(expectedPath, '');
    });

    const result = await canUseRipgrep();

    expect(result).toBe(true);
    expect(downloadRipGrep).toHaveBeenCalledWith(binDir);
    await expect(fs.access(expectedPath)).resolves.toBeUndefined();
  });

  it('should return false if download fails and file does not exist', async () => {
    const result = await canUseRipgrep();

    expect(result).toBe(false);
    expect(downloadRipGrep).toHaveBeenCalledWith(binDir);
  });

  it('should propagate errors from downloadRipGrep', async () => {
    const error = new Error('Download failed');
    downloadRipGrepMock.mockRejectedValue(error);

    await expect(canUseRipgrep()).rejects.toThrow(error);
    expect(downloadRipGrep).toHaveBeenCalledWith(binDir);
  });

  it('should only download once when called concurrently', async () => {
    const expectedPath = path.join(binDir, getRipgrepBinaryName());

    downloadRipGrepMock.mockImplementation(
      () =>
        new Promise<void>((resolve, reject) => {
          setTimeout(() => {
            fs.writeFile(expectedPath, '')
              .then(() => resolve())
              .catch(reject);
          }, 0);
        }),
    );

    const firstCall = ensureRgPath();
    const secondCall = ensureRgPath();

    const [pathOne, pathTwo] = await Promise.all([firstCall, secondCall]);

    expect(pathOne).toBe(expectedPath);
    expect(pathTwo).toBe(expectedPath);
    expect(downloadRipGrepMock).toHaveBeenCalledTimes(1);
    await expect(fs.access(expectedPath)).resolves.toBeUndefined();
  });
});

describe('ensureRgPath', () => {
  let tempRootDir: string;
  let binDir: string;

  beforeEach(async () => {
    downloadRipGrepMock.mockReset();
    downloadRipGrepMock.mockResolvedValue(undefined);
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ripgrep-bin-'));
    binDir = path.join(tempRootDir, 'bin');
    await fs.mkdir(binDir, { recursive: true });
    storageSpy.mockImplementation(() => binDir);
  });

  afterEach(async () => {
    storageSpy.mockImplementation(() => originalGetGlobalBinDir());
    await fs.rm(tempRootDir, { recursive: true, force: true });
  });

  it('should return rg path if ripgrep already exists', async () => {
    const existingPath = path.join(binDir, getRipgrepBinaryName());
    await fs.writeFile(existingPath, '');

    const rgPath = await ensureRgPath();
    expect(rgPath).toBe(existingPath);
    expect(downloadRipGrep).not.toHaveBeenCalled();
  });

  it('should return rg path if ripgrep is downloaded successfully', async () => {
    const expectedPath = path.join(binDir, getRipgrepBinaryName());

    downloadRipGrepMock.mockImplementation(async () => {
      await fs.writeFile(expectedPath, '');
    });

    const rgPath = await ensureRgPath();
    expect(rgPath).toBe(expectedPath);
    expect(downloadRipGrep).toHaveBeenCalledTimes(1);
    await expect(fs.access(expectedPath)).resolves.toBeUndefined();
  });

  it('should throw an error if ripgrep cannot be used after download attempt', async () => {
    await expect(ensureRgPath()).rejects.toThrow('Cannot use ripgrep.');
    expect(downloadRipGrep).toHaveBeenCalledTimes(1);
  });

  it('should propagate errors from downloadRipGrep', async () => {
    const error = new Error('Download failed');
    downloadRipGrepMock.mockRejectedValue(error);

    await expect(ensureRgPath()).rejects.toThrow(error);
    expect(downloadRipGrep).toHaveBeenCalledWith(binDir);
  });

  it.runIf(process.platform === 'win32')(
    'should detect ripgrep when only rg.exe exists on Windows',
    async () => {
      const expectedRgExePath = path.join(binDir, 'rg.exe');
      await fs.writeFile(expectedRgExePath, '');

      const rgPath = await ensureRgPath();
      expect(rgPath).toBe(expectedRgExePath);
      expect(downloadRipGrep).not.toHaveBeenCalled();
      await expect(fs.access(expectedRgExePath)).resolves.toBeUndefined();
    },
  );
});

// Helper function to create mock spawn implementations
function createMockSpawn(
  options: {
    outputData?: string;
    exitCode?: number | null;
    signal?: string;
  } = {},
) {
  const { outputData, exitCode = 0, signal } = options;

  return () => {
    // strict Readable implementation
    let pushed = false;
    const stdout = new Readable({
      read() {
        if (!pushed) {
          if (outputData) {
            this.push(outputData);
          }
          this.push(null); // EOF
          pushed = true;
        }
      },
    });

    const stderr = new PassThrough();
    const mockProcess = new EventEmitter() as ChildProcess;
    mockProcess.stdout = stdout as unknown as Readable;
    mockProcess.stderr = stderr;
    mockProcess.kill = vi.fn();
    // @ts-expect-error - mocking private/internal property
    mockProcess.killed = false;
    // @ts-expect-error - mocking private/internal property
    mockProcess.exitCode = null;

    // Emulating process exit
    setTimeout(() => {
      mockProcess.emit('close', exitCode, signal);
    }, 10);

    return mockProcess;
  };
}

describe('RipGrepTool', () => {
  let tempRootDir: string;
  let tempBinRoot: string;
  let binDir: string;
  let ripgrepBinaryPath: string;
  let grepTool: RipGrepTool;
  const abortSignal = new AbortController().signal;

  let mockConfig = {
    getTargetDir: () => tempRootDir,
    getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
    getDebugMode: () => false,
    getFileFilteringRespectGitIgnore: () => true,
    getFileFilteringRespectGeminiIgnore: () => true,
    getFileFilteringOptions: () => ({
      respectGitIgnore: true,
      respectGeminiIgnore: true,
    }),
  } as unknown as Config;

  beforeEach(async () => {
    downloadRipGrepMock.mockReset();
    downloadRipGrepMock.mockResolvedValue(undefined);
    mockSpawn.mockReset();
    mockSpawn.mockImplementation(createMockSpawn());
    tempBinRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ripgrep-bin-'));
    binDir = path.join(tempBinRoot, 'bin');
    await fs.mkdir(binDir, { recursive: true });
    const binaryName = process.platform === 'win32' ? 'rg.exe' : 'rg';
    ripgrepBinaryPath = path.join(binDir, binaryName);
    await fs.writeFile(ripgrepBinaryPath, '');
    storageSpy.mockImplementation(() => binDir);
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grep-tool-root-'));

    mockConfig = {
      getTargetDir: () => tempRootDir,
      getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
      getDebugMode: () => false,
      getFileFilteringRespectGitIgnore: () => true,
      getFileFilteringRespectGeminiIgnore: () => true,
      getFileFilteringOptions: () => ({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      }),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
      },
      isPathAllowed(this: Config, absolutePath: string): boolean {
        const workspaceContext = this.getWorkspaceContext();
        if (workspaceContext.isPathWithinWorkspace(absolutePath)) {
          return true;
        }

        const projectTempDir = this.storage.getProjectTempDir();
        return isSubpath(path.resolve(projectTempDir), absolutePath);
      },
      validatePathAccess(this: Config, absolutePath: string): string | null {
        if (this.isPathAllowed(absolutePath)) {
          return null;
        }

        const workspaceDirs = this.getWorkspaceContext().getDirectories();
        const projectTempDir = this.storage.getProjectTempDir();
        return `Path not in workspace: Attempted path "${absolutePath}" resolves outside the allowed workspace directories: ${workspaceDirs.join(', ')} or the project temp directory: ${projectTempDir}`;
      },
    } as unknown as Config;

    grepTool = new RipGrepTool(mockConfig, createMockMessageBus());

    // Create some test files and directories
    await fs.writeFile(
      path.join(tempRootDir, 'fileA.txt'),
      'hello world\nsecond line with world',
    );
    await fs.writeFile(
      path.join(tempRootDir, 'fileB.js'),
      'const foo = "bar";\nfunction baz() { return "hello"; }',
    );
    await fs.mkdir(path.join(tempRootDir, 'sub'));
    await fs.writeFile(
      path.join(tempRootDir, 'sub', 'fileC.txt'),
      'another world in sub dir',
    );
    await fs.writeFile(
      path.join(tempRootDir, 'sub', 'fileD.md'),
      '# Markdown file\nThis is a test.',
    );
  });

  afterEach(async () => {
    storageSpy.mockImplementation(() => originalGetGlobalBinDir());
    await fs.rm(tempRootDir, { recursive: true, force: true });
    await fs.rm(tempBinRoot, { recursive: true, force: true });
  });

  describe('validateToolParams', () => {
    it.each([
      {
        name: 'pattern only',
        params: { pattern: 'hello' },
        expected: null,
      },
      {
        name: 'pattern and path',
        params: { pattern: 'hello', dir_path: '.' },
        expected: null,
      },
      {
        name: 'pattern, path, and include',
        params: { pattern: 'hello', dir_path: '.', include: '*.txt' },
        expected: null,
      },
    ])(
      'should return null for valid params ($name)',
      ({ params, expected }) => {
        expect(grepTool.validateToolParams(params)).toBe(expected);
      },
    );

    it('should throw error for invalid regex pattern', () => {
      const params: RipGrepToolParams = { pattern: '[[' };
      expect(grepTool.validateToolParams(params)).toMatch(
        /Invalid regular expression pattern provided/,
      );
    });

    it('should return error if pattern is missing', () => {
      const params = { dir_path: '.' } as unknown as RipGrepToolParams;
      expect(grepTool.validateToolParams(params)).toBe(
        `params must have required property 'pattern'`,
      );
    });

    it('should return error if path does not exist', () => {
      const params: RipGrepToolParams = {
        pattern: 'hello',
        dir_path: 'nonexistent',
      };
      // Check for the core error message, as the full path might vary
      const result = grepTool.validateToolParams(params);
      expect(result).toMatch(/Path does not exist/);
      expect(result).toMatch(/nonexistent/);
    });

    it('should allow path to be a file', async () => {
      const filePath = path.join(tempRootDir, 'fileA.txt');
      const params: RipGrepToolParams = {
        pattern: 'hello',
        dir_path: filePath,
      };
      expect(grepTool.validateToolParams(params)).toBeNull();
    });
  });

  describe('execute', () => {
    it('should find matches for a simple pattern in all files', async () => {
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 1,
                lines: { text: 'hello world\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 2,
                lines: { text: 'second line with world\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'sub/fileC.txt' },
                line_number: 1,
                lines: { text: 'another world in sub dir\n' },
              },
            }) +
            '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = { pattern: 'world' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain(
        'Found 3 matches for pattern "world" in path "."',
      );
      expect(result.llmContent).toContain('File: fileA.txt');
      expect(result.llmContent).toContain('L1: hello world');
      expect(result.llmContent).toContain('L2: second line with world');
      expect(result.llmContent).toContain(
        `File: ${path.join('sub', 'fileC.txt')}`,
      );
      expect(result.llmContent).toContain('L1: another world in sub dir');
      expect(result.returnDisplay).toBe('Found 3 matches');
    });

    it('should ignore matches that escape the base path', async () => {
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: '..env' },
                line_number: 1,
                lines: { text: 'world in ..env\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: '../secret.txt' },
                line_number: 1,
                lines: { text: 'leak\n' },
              },
            }) +
            '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = { pattern: 'world' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('File: ..env');
      expect(result.llmContent).toContain('L1: world in ..env');
      expect(result.llmContent).not.toContain('secret.txt');
    });

    it('should find matches in a specific path', async () => {
      // Setup specific mock for this test - searching in 'sub' should only return matches from that directory
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileC.txt' },
                line_number: 1,
                lines: { text: 'another world in sub dir\n' },
              },
            }) + '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = { pattern: 'world', dir_path: 'sub' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain(
        'Found 1 match for pattern "world" in path "sub"',
      );
      expect(result.llmContent).toContain('File: fileC.txt'); // Path relative to 'sub'
      expect(result.llmContent).toContain('L1: another world in sub dir');
      expect(result.returnDisplay).toBe('Found 1 match');
    });

    it('should find matches with an include glob', async () => {
      // Setup specific mock for this test
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileB.js' },
                line_number: 2,
                lines: { text: 'function baz() { return "hello"; }\n' },
              },
            }) + '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = { pattern: 'hello', include: '*.js' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain(
        'Found 1 match for pattern "hello" in path "." (filter: "*.js"):',
      );
      expect(result.llmContent).toContain('File: fileB.js');
      expect(result.llmContent).toContain(
        'L2: function baz() { return "hello"; }',
      );
      expect(result.returnDisplay).toBe('Found 1 match');
    });

    it('should find matches with an include glob and path', async () => {
      await fs.writeFile(
        path.join(tempRootDir, 'sub', 'another.js'),
        'const greeting = "hello";',
      );

      // Setup specific mock for this test - searching for 'hello' in 'sub' with '*.js' filter
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'another.js' },
                line_number: 1,
                lines: { text: 'const greeting = "hello";\n' },
              },
            }) + '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = {
        pattern: 'hello',
        dir_path: 'sub',
        include: '*.js',
      };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain(
        'Found 1 match for pattern "hello" in path "sub" (filter: "*.js")',
      );
      expect(result.llmContent).toContain('File: another.js');
      expect(result.llmContent).toContain('L1: const greeting = "hello";');
      expect(result.returnDisplay).toBe('Found 1 match');
    });

    it('should return "No matches found" when pattern does not exist', async () => {
      // Setup specific mock for no matches
      mockSpawn.mockImplementation(
        createMockSpawn({
          exitCode: 1, // No matches found
        }),
      );

      const params: RipGrepToolParams = { pattern: 'nonexistentpattern' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain(
        'No matches found for pattern "nonexistentpattern" in path ".".',
      );
      expect(result.returnDisplay).toBe('No matches found');
    });

    it('should throw error for invalid regex pattern during build', async () => {
      const params: RipGrepToolParams = { pattern: '[[' };
      expect(() => grepTool.build(params)).toThrow(
        /Invalid regular expression pattern provided/,
      );
    });

    it('should ignore invalid regex error from ripgrep when it is not a user error', async () => {
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData: '',
          exitCode: 2,
          signal: undefined,
        }),
      );

      const invocation = grepTool.build({
        pattern: 'foo',
        dir_path: tempRootDir,
      });

      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('Process exited with code 2');
      expect(result.returnDisplay).toContain(
        'Error: Process exited with code 2',
      );
    });

    it('should handle massive output by terminating early without crashing (Regression)', async () => {
      const massiveOutputLines = 30000;

      // Custom mock for massive streaming
      mockSpawn.mockImplementation(() => {
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const mockProcess = new EventEmitter() as ChildProcess;
        mockProcess.stdout = stdout;
        mockProcess.stderr = stderr;
        mockProcess.kill = vi.fn();
        // @ts-expect-error - mocking private/internal property
        mockProcess.killed = false;
        // @ts-expect-error - mocking private/internal property
        mockProcess.exitCode = null;

        // Push data over time
        let linesPushed = 0;
        const pushInterval = setInterval(() => {
          if (linesPushed >= massiveOutputLines) {
            clearInterval(pushInterval);
            stdout.end();
            mockProcess.emit('close', 0);
            return;
          }

          // Push a batch
          try {
            for (let i = 0; i < 2000 && linesPushed < massiveOutputLines; i++) {
              const match = JSON.stringify({
                type: 'match',
                data: {
                  path: { text: `file_${linesPushed}.txt` },
                  line_number: 1,
                  lines: { text: `match ${linesPushed}\n` },
                },
              });
              stdout.write(match + '\n');
              linesPushed++;
            }
          } catch (_e) {
            clearInterval(pushInterval);
          }
        }, 1);

        mockProcess.kill = vi.fn().mockImplementation(() => {
          clearInterval(pushInterval);
          stdout.end();
          // Emit close async to allow listeners to attach
          setTimeout(() => mockProcess.emit('close', 0, 'SIGTERM'), 0);
          return true;
        });

        return mockProcess;
      });

      const invocation = grepTool.build({
        pattern: 'test',
        dir_path: tempRootDir,
      });
      const result = await invocation.execute(abortSignal);

      expect(result.returnDisplay).toContain('(limited)');
    }, 10000);

    it('should filter out files based on FileDiscoveryService even if ripgrep returns them', async () => {
      // Create .geminiignore to ignore 'ignored.txt'
      await fs.writeFile(
        path.join(tempRootDir, GEMINI_IGNORE_FILE_NAME),
        'ignored.txt',
      );

      // Re-initialize tool so FileDiscoveryService loads the new .geminiignore
      const toolWithIgnore = new RipGrepTool(
        mockConfig,
        createMockMessageBus(),
      );

      // Mock ripgrep returning both an ignored file and an allowed file
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'ignored.txt' },
                line_number: 1,
                lines: { text: 'should be ignored\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'allowed.txt' },
                line_number: 1,
                lines: { text: 'should be kept\n' },
              },
            }) +
            '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = { pattern: 'should' };
      const invocation = toolWithIgnore.build(params);
      const result = await invocation.execute(abortSignal);

      // Verify ignored file is filtered out
      expect(result.llmContent).toContain('allowed.txt');
      expect(result.llmContent).toContain('should be kept');
      expect(result.llmContent).not.toContain('ignored.txt');
      expect(result.llmContent).not.toContain('should be ignored');
      expect(result.returnDisplay).toContain('Found 1 match');
    });

    it('should handle regex special characters correctly', async () => {
      // Setup specific mock for this test - regex pattern 'foo.*bar' should match 'const foo = "bar";'
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileB.js' },
                line_number: 1,
                lines: { text: 'const foo = "bar";\n' },
              },
            }) + '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = { pattern: 'foo.*bar' }; // Matches 'const foo = "bar";'
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain(
        'Found 1 match for pattern "foo.*bar" in path ".":',
      );
      expect(result.llmContent).toContain('File: fileB.js');
      expect(result.llmContent).toContain('L1: const foo = "bar";');
    });

    it('should be case-insensitive by default (JS fallback)', async () => {
      // Setup specific mock for this test - case insensitive search for 'HELLO'
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 1,
                lines: { text: 'hello world\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileB.js' },
                line_number: 2,
                lines: { text: 'function baz() { return "hello"; }\n' },
              },
            }) +
            '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = { pattern: 'HELLO' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain(
        'Found 2 matches for pattern "HELLO" in path ".":',
      );
      expect(result.llmContent).toContain('File: fileA.txt');
      expect(result.llmContent).toContain('L1: hello world');
      expect(result.llmContent).toContain('File: fileB.js');
      expect(result.llmContent).toContain(
        'L2: function baz() { return "hello"; }',
      );
    });

    it('should throw an error if params are invalid', async () => {
      const params = { dir_path: '.' } as unknown as RipGrepToolParams; // Invalid: pattern missing
      expect(() => grepTool.build(params)).toThrow(
        /params must have required property 'pattern'/,
      );
    });

    it('should throw an error if ripgrep is not available', async () => {
      await fs.rm(ripgrepBinaryPath, { force: true });
      downloadRipGrepMock.mockResolvedValue(undefined);

      const params: RipGrepToolParams = { pattern: 'world' };
      const invocation = grepTool.build(params);

      expect(await invocation.execute(abortSignal)).toStrictEqual({
        llmContent: 'Error during grep search operation: Cannot use ripgrep.',
        returnDisplay: 'Error: Cannot use ripgrep.',
      });
    });
  });

  describe('multi-directory workspace', () => {
    it('should search only CWD when no path is specified (default behavior)', async () => {
      // Create additional directory with test files
      const secondDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'grep-tool-second-'),
      );
      await fs.writeFile(
        path.join(secondDir, 'other.txt'),
        'hello from second directory\nworld in second',
      );
      await fs.writeFile(
        path.join(secondDir, 'another.js'),
        'function world() { return "test"; }',
      );

      // Create a mock config with multiple directories
      const multiDirConfig = {
        getTargetDir: () => tempRootDir,
        getWorkspaceContext: () =>
          createMockWorkspaceContext(tempRootDir, [secondDir]),
        getDebugMode: () => false,
        getFileFilteringRespectGitIgnore: () => true,
        getFileFilteringRespectGeminiIgnore: () => true,
        getFileFilteringOptions: () => ({
          respectGitIgnore: true,
          respectGeminiIgnore: true,
        }),
        storage: {
          getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
        },
        isPathAllowed(this: Config, absolutePath: string): boolean {
          const workspaceContext = this.getWorkspaceContext();
          if (workspaceContext.isPathWithinWorkspace(absolutePath)) {
            return true;
          }

          const projectTempDir = this.storage.getProjectTempDir();
          return isSubpath(path.resolve(projectTempDir), absolutePath);
        },
        validatePathAccess(this: Config, absolutePath: string): string | null {
          if (this.isPathAllowed(absolutePath)) {
            return null;
          }

          const workspaceDirs = this.getWorkspaceContext().getDirectories();
          const projectTempDir = this.storage.getProjectTempDir();
          return `Path not in workspace: Attempted path "${absolutePath}" resolves outside the allowed workspace directories: ${workspaceDirs.join(', ')} or the project temp directory: ${projectTempDir}`;
        },
      } as unknown as Config;

      // Setup specific mock for this test - multi-directory search for 'world'
      // Mock will be called twice - once for each directory

      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 1,
                lines: { text: 'hello world\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 2,
                lines: { text: 'second line with world\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'sub/fileC.txt' },
                line_number: 1,
                lines: { text: 'another world in sub dir\n' },
              },
            }) +
            '\n',
        }),
      );

      const multiDirGrepTool = new RipGrepTool(
        multiDirConfig,
        createMockMessageBus(),
      );
      const params: RipGrepToolParams = { pattern: 'world' };
      const invocation = multiDirGrepTool.build(params);
      const result = await invocation.execute(abortSignal);

      // Should find matches in CWD only (default behavior now)
      expect(result.llmContent).toContain(
        'Found 3 matches for pattern "world" in path "."',
      );

      // Matches from first directory
      expect(result.llmContent).toContain('fileA.txt');
      expect(result.llmContent).toContain('L1: hello world');
      expect(result.llmContent).toContain('L2: second line with world');
      expect(result.llmContent).toContain('fileC.txt');
      expect(result.llmContent).toContain('L1: another world in sub dir');

      // Should NOT find matches from second directory
      expect(result.llmContent).not.toContain('other.txt');
      expect(result.llmContent).not.toContain('world in second');
      expect(result.llmContent).not.toContain('another.js');
      expect(result.llmContent).not.toContain('function world()');

      // Clean up
      await fs.rm(secondDir, { recursive: true, force: true });
      mockSpawn.mockClear();
    });

    it('should search only specified path within workspace directories', async () => {
      // Create additional directory
      const secondDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'grep-tool-second-'),
      );
      await fs.mkdir(path.join(secondDir, 'sub'));
      await fs.writeFile(
        path.join(secondDir, 'sub', 'test.txt'),
        'hello from second sub directory',
      );

      // Create a mock config with multiple directories
      const multiDirConfig = {
        getTargetDir: () => tempRootDir,
        getWorkspaceContext: () =>
          createMockWorkspaceContext(tempRootDir, [secondDir]),
        getDebugMode: () => false,
        getFileFilteringRespectGitIgnore: () => true,
        getFileFilteringRespectGeminiIgnore: () => true,
        getFileFilteringOptions: () => ({
          respectGitIgnore: true,
          respectGeminiIgnore: true,
        }),
        storage: {
          getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
        },
        isPathAllowed(this: Config, absolutePath: string): boolean {
          const workspaceContext = this.getWorkspaceContext();
          if (workspaceContext.isPathWithinWorkspace(absolutePath)) {
            return true;
          }

          const projectTempDir = this.storage.getProjectTempDir();
          return isSubpath(path.resolve(projectTempDir), absolutePath);
        },
        validatePathAccess(this: Config, absolutePath: string): string | null {
          if (this.isPathAllowed(absolutePath)) {
            return null;
          }

          const workspaceDirs = this.getWorkspaceContext().getDirectories();
          const projectTempDir = this.storage.getProjectTempDir();
          return `Path not in workspace: Attempted path "${absolutePath}" resolves outside the allowed workspace directories: ${workspaceDirs.join(', ')} or the project temp directory: ${projectTempDir}`;
        },
      } as unknown as Config;

      // Setup specific mock for this test - searching in 'sub' should only return matches from that directory
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileC.txt' },
                line_number: 1,
                lines: { text: 'another world in sub dir\n' },
              },
            }) + '\n',
        }),
      );

      const multiDirGrepTool = new RipGrepTool(
        multiDirConfig,
        createMockMessageBus(),
      );

      // Search only in the 'sub' directory of the first workspace
      const params: RipGrepToolParams = { pattern: 'world', dir_path: 'sub' };
      const invocation = multiDirGrepTool.build(params);
      const result = await invocation.execute(abortSignal);

      // Should only find matches in the specified sub directory
      expect(result.llmContent).toContain(
        'Found 1 match for pattern "world" in path "sub"',
      );
      expect(result.llmContent).toContain('File: fileC.txt');
      expect(result.llmContent).toContain('L1: another world in sub dir');

      // Should not contain matches from second directory
      expect(result.llmContent).not.toContain('test.txt');

      // Clean up
      await fs.rm(secondDir, { recursive: true, force: true });
    });
  });

  describe('abort signal handling', () => {
    it('should handle AbortSignal during search', async () => {
      const controller = new AbortController();
      const params: RipGrepToolParams = { pattern: 'world' };
      const invocation = grepTool.build(params);

      controller.abort();

      const result = await invocation.execute(controller.signal);
      expect(result).toBeDefined();
    });

    it('should abort streaming search when signal is triggered', async () => {
      // Setup specific mock for this test - simulate process being killed due to abort
      mockSpawn.mockImplementation(
        createMockSpawn({
          exitCode: null,
          signal: 'SIGTERM',
        }),
      );

      const controller = new AbortController();
      const params: RipGrepToolParams = { pattern: 'test' };
      const invocation = grepTool.build(params);

      // Abort immediately before starting the search
      controller.abort();

      const result = await invocation.execute(controller.signal);
      expect(result.returnDisplay).toContain('No matches found');
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle workspace boundary violations', () => {
      const params: RipGrepToolParams = {
        pattern: 'test',
        dir_path: '../outside',
      };
      expect(() => grepTool.build(params)).toThrow(/Path not in workspace/);
    });

    it.each([
      {
        name: 'empty directories',
        setup: async () => {
          const emptyDir = path.join(tempRootDir, 'empty');
          await fs.mkdir(emptyDir);
          return { pattern: 'test', dir_path: 'empty' };
        },
      },
      {
        name: 'empty files',
        setup: async () => {
          await fs.writeFile(path.join(tempRootDir, 'empty.txt'), '');
          return { pattern: 'anything' };
        },
      },
    ])('should handle $name gracefully', async ({ setup }) => {
      mockSpawn.mockImplementation(createMockSpawn({ exitCode: 1 }));

      const params = await setup();
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('No matches found');
    });

    it('should handle special characters in file names', async () => {
      const specialFileName = 'file with spaces & symbols!.txt';
      await fs.writeFile(
        path.join(tempRootDir, specialFileName),
        'hello world with special chars',
      );

      // Setup specific mock for this test - searching for 'world' should find the file with special characters
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: specialFileName },
                line_number: 1,
                lines: { text: 'hello world with special chars\n' },
              },
            }) + '\n',
        }),
      );

      const params: RipGrepToolParams = { pattern: 'world' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain(specialFileName);
      expect(result.llmContent).toContain('hello world with special chars');
    });

    it('should handle deeply nested directories', async () => {
      const deepPath = path.join(tempRootDir, 'a', 'b', 'c', 'd', 'e');
      await fs.mkdir(deepPath, { recursive: true });
      await fs.writeFile(
        path.join(deepPath, 'deep.txt'),
        'content in deep directory',
      );

      // Setup specific mock for this test - searching for 'deep' should find the deeply nested file
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'a/b/c/d/e/deep.txt' },
                line_number: 1,
                lines: { text: 'content in deep directory\n' },
              },
            }) + '\n',
        }),
      );

      const params: RipGrepToolParams = { pattern: 'deep' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('deep.txt');
      expect(result.llmContent).toContain('content in deep directory');
    });
  });

  describe('regex pattern validation', () => {
    it('should handle complex regex patterns', async () => {
      await fs.writeFile(
        path.join(tempRootDir, 'code.js'),
        'function getName() { return "test"; }\nconst getValue = () => "value";',
      );

      // Setup specific mock for this test - regex pattern should match function declarations
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'code.js' },
                line_number: 1,
                lines: { text: 'function getName() { return "test"; }\n' },
              },
            }) + '\n',
        }),
      );

      const params: RipGrepToolParams = {
        pattern: 'function\\s+\\w+\\s*\\(',
        context: 0,
      };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('function getName()');
      expect(result.llmContent).not.toContain('const getValue');
    });

    it('should handle case sensitivity correctly in JS fallback', async () => {
      await fs.writeFile(
        path.join(tempRootDir, 'case.txt'),
        'Hello World\nhello world\nHELLO WORLD',
      );

      // Setup specific mock for this test - case insensitive search should match all variants
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'case.txt' },
                line_number: 1,
                lines: { text: 'Hello World\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'case.txt' },
                line_number: 2,
                lines: { text: 'hello world\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'case.txt' },
                line_number: 3,
                lines: { text: 'HELLO WORLD\n' },
              },
            }) +
            '\n',
        }),
      );

      const params: RipGrepToolParams = { pattern: 'hello' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Hello World');
      expect(result.llmContent).toContain('hello world');
      expect(result.llmContent).toContain('HELLO WORLD');
    });

    it('should handle escaped regex special characters', async () => {
      await fs.writeFile(
        path.join(tempRootDir, 'special.txt'),
        'Price: $19.99\nRegex: [a-z]+ pattern\nEmail: test@example.com',
      );

      // Setup specific mock for this test - escaped regex pattern should match price format
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'special.txt' },
                line_number: 1,
                lines: { text: 'Price: $19.99\n' },
              },
            }) + '\n',
        }),
      );

      const params: RipGrepToolParams = {
        pattern: '\\$\\d+\\.\\d+',
        context: 0,
      };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Price: $19.99');
      expect(result.llmContent).not.toContain('Email: test@example.com');
    });
  });

  describe('include pattern filtering', () => {
    it('should handle multiple file extensions in include pattern', async () => {
      await fs.writeFile(
        path.join(tempRootDir, 'test.ts'),
        'typescript content',
      );
      await fs.writeFile(path.join(tempRootDir, 'test.tsx'), 'tsx content');
      await fs.writeFile(
        path.join(tempRootDir, 'test.js'),
        'javascript content',
      );
      await fs.writeFile(path.join(tempRootDir, 'test.txt'), 'text content');

      // Setup specific mock for this test - include pattern should filter to only ts/tsx files
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'test.ts' },
                line_number: 1,
                lines: { text: 'typescript content\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'test.tsx' },
                line_number: 1,
                lines: { text: 'tsx content\n' },
              },
            }) +
            '\n',
        }),
      );

      const params: RipGrepToolParams = {
        pattern: 'content',
        include: '*.{ts,tsx}',
      };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('test.ts');
      expect(result.llmContent).toContain('test.tsx');
      expect(result.llmContent).not.toContain('test.js');
      expect(result.llmContent).not.toContain('test.txt');
    });

    it('should handle directory patterns in include', async () => {
      await fs.mkdir(path.join(tempRootDir, 'src'), { recursive: true });
      await fs.writeFile(
        path.join(tempRootDir, 'src', 'main.ts'),
        'source code',
      );
      await fs.writeFile(path.join(tempRootDir, 'other.ts'), 'other code');

      // Setup specific mock for this test - include pattern should filter to only src/** files
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'src/main.ts' },
                line_number: 1,
                lines: { text: 'source code\n' },
              },
            }) + '\n',
        }),
      );

      const params: RipGrepToolParams = {
        pattern: 'code',
        include: 'src/**',
      };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('main.ts');
      expect(result.llmContent).not.toContain('other.ts');
    });
  });

  describe('advanced search options', () => {
    it('should handle case_sensitive parameter', async () => {
      // Case-insensitive search (default)
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 1,
                lines: { text: 'hello world\n' },
              },
            }) + '\n',
          exitCode: 0,
        }),
      );
      let params: RipGrepToolParams = { pattern: 'HELLO', context: 0 };
      let invocation = grepTool.build(params);
      let result = await invocation.execute(abortSignal);
      expect(mockSpawn).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.arrayContaining(['--ignore-case']),
        expect.anything(),
      );
      expect(result.llmContent).toContain('Found 1 match for pattern "HELLO"');
      expect(result.llmContent).toContain('L1: hello world');

      // Case-sensitive search
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 1,
                lines: { text: 'HELLO world\n' },
              },
            }) + '\n',
          exitCode: 0,
        }),
      );
      params = { pattern: 'HELLO', case_sensitive: true, context: 0 };
      invocation = grepTool.build(params);
      result = await invocation.execute(abortSignal);
      expect(mockSpawn).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.not.arrayContaining(['--ignore-case']),
        expect.anything(),
      );
      expect(result.llmContent).toContain('Found 1 match for pattern "HELLO"');
      expect(result.llmContent).toContain('L1: HELLO world');
    });

    it('should handle fixed_strings parameter', async () => {
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 1,
                lines: { text: 'hello.world\n' },
              },
            }) + '\n',
          exitCode: 0,
        }),
      );

      const invocation = grepTool.build({
        pattern: 'hello.world',
        fixed_strings: true,
      });
      const result = await invocation.execute(abortSignal);

      const spawnArgs = mockSpawn.mock.calls[0][1];
      expect(spawnArgs).toContain('--fixed-strings');
      expect(spawnArgs).toContain('--regexp');
      expect(spawnArgs).toContain('hello.world');

      // Verify --fixed-strings doesn't have the pattern as its next argument
      const fixedStringsIdx = spawnArgs.indexOf('--fixed-strings');
      expect(spawnArgs[fixedStringsIdx + 1]).not.toBe('hello.world');

      expect(result.llmContent).toContain(
        'Found 1 match for pattern "hello.world"',
      );
    });

    it('should allow invalid regex patterns when fixed_strings is true', () => {
      const params: RipGrepToolParams = {
        pattern: '[[',
        fixed_strings: true,
      };
      expect(grepTool.validateToolParams(params)).toBeNull();
    });

    it('should handle no_ignore parameter', async () => {
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'ignored.log' },
                line_number: 1,
                lines: { text: 'secret log entry\n' },
              },
            }) + '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = { pattern: 'secret', no_ignore: true };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(mockSpawn).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.arrayContaining(['--no-ignore']),
        expect.anything(),
      );

      expect(mockSpawn).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.not.arrayContaining(['--glob', '!node_modules']),
        expect.anything(),
      );
      expect(result.llmContent).toContain('Found 1 match for pattern "secret"');
      expect(result.llmContent).toContain('File: ignored.log');
      expect(result.llmContent).toContain('L1: secret log entry');
    });

    it('should disable gitignore rules when respectGitIgnore is false', async () => {
      const configWithoutGitIgnore = {
        getTargetDir: () => tempRootDir,
        getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
        getDebugMode: () => false,
        getFileFilteringRespectGitIgnore: () => false,
        getFileFilteringRespectGeminiIgnore: () => true,
        getFileFilteringOptions: () => ({
          respectGitIgnore: false,
          respectGeminiIgnore: true,
        }),
        storage: {
          getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
        },
        isPathAllowed(this: Config, absolutePath: string): boolean {
          const workspaceContext = this.getWorkspaceContext();
          if (workspaceContext.isPathWithinWorkspace(absolutePath)) {
            return true;
          }

          const projectTempDir = this.storage.getProjectTempDir();
          return isSubpath(path.resolve(projectTempDir), absolutePath);
        },
        validatePathAccess(this: Config, absolutePath: string): string | null {
          if (this.isPathAllowed(absolutePath)) {
            return null;
          }

          const workspaceDirs = this.getWorkspaceContext().getDirectories();
          const projectTempDir = this.storage.getProjectTempDir();
          return `Path not in workspace: Attempted path "${absolutePath}" resolves outside the allowed workspace directories: ${workspaceDirs.join(', ')} or the project temp directory: ${projectTempDir}`;
        },
      } as unknown as Config;
      const gitIgnoreDisabledTool = new RipGrepTool(
        configWithoutGitIgnore,
        createMockMessageBus(),
      );

      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'ignored.log' },
                line_number: 1,
                lines: { text: 'secret log entry\n' },
              },
            }) + '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = { pattern: 'secret' };
      const invocation = gitIgnoreDisabledTool.build(params);
      await invocation.execute(abortSignal);

      expect(mockSpawn).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.arrayContaining(['--no-ignore-vcs', '--no-ignore-exclude']),
        expect.anything(),
      );
    });

    it('should add .geminiignore when enabled and patterns exist', async () => {
      const geminiIgnorePath = path.join(tempRootDir, GEMINI_IGNORE_FILE_NAME);
      await fs.writeFile(geminiIgnorePath, 'ignored.log');
      const configWithGeminiIgnore = {
        getTargetDir: () => tempRootDir,
        getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
        getDebugMode: () => false,
        getFileFilteringRespectGitIgnore: () => true,
        getFileFilteringRespectGeminiIgnore: () => true,
        getFileFilteringOptions: () => ({
          respectGitIgnore: true,
          respectGeminiIgnore: true,
        }),
        storage: {
          getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
        },
        isPathAllowed(this: Config, absolutePath: string): boolean {
          const workspaceContext = this.getWorkspaceContext();
          if (workspaceContext.isPathWithinWorkspace(absolutePath)) {
            return true;
          }

          const projectTempDir = this.storage.getProjectTempDir();
          return isSubpath(path.resolve(projectTempDir), absolutePath);
        },
        validatePathAccess(this: Config, absolutePath: string): string | null {
          if (this.isPathAllowed(absolutePath)) {
            return null;
          }

          const workspaceDirs = this.getWorkspaceContext().getDirectories();
          const projectTempDir = this.storage.getProjectTempDir();
          return `Path not in workspace: Attempted path "${absolutePath}" resolves outside the allowed workspace directories: ${workspaceDirs.join(', ')} or the project temp directory: ${projectTempDir}`;
        },
      } as unknown as Config;
      const geminiIgnoreTool = new RipGrepTool(
        configWithGeminiIgnore,
        createMockMessageBus(),
      );

      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'ignored.log' },
                line_number: 1,
                lines: { text: 'secret log entry\n' },
              },
            }) + '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = { pattern: 'secret' };
      const invocation = geminiIgnoreTool.build(params);
      await invocation.execute(abortSignal);

      expect(mockSpawn).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.arrayContaining(['--ignore-file', geminiIgnorePath]),
        expect.anything(),
      );
    });

    it('should skip .geminiignore when disabled', async () => {
      const geminiIgnorePath = path.join(tempRootDir, GEMINI_IGNORE_FILE_NAME);
      await fs.writeFile(geminiIgnorePath, 'ignored.log');
      const configWithoutGeminiIgnore = {
        getTargetDir: () => tempRootDir,
        getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
        getDebugMode: () => false,
        getFileFilteringRespectGitIgnore: () => true,
        getFileFilteringRespectGeminiIgnore: () => false,
        getFileFilteringOptions: () => ({
          respectGitIgnore: true,
          respectGeminiIgnore: false,
        }),
        storage: {
          getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
        },
        isPathAllowed(this: Config, absolutePath: string): boolean {
          const workspaceContext = this.getWorkspaceContext();
          if (workspaceContext.isPathWithinWorkspace(absolutePath)) {
            return true;
          }

          const projectTempDir = this.storage.getProjectTempDir();
          return isSubpath(path.resolve(projectTempDir), absolutePath);
        },
        validatePathAccess(this: Config, absolutePath: string): string | null {
          if (this.isPathAllowed(absolutePath)) {
            return null;
          }

          const workspaceDirs = this.getWorkspaceContext().getDirectories();
          const projectTempDir = this.storage.getProjectTempDir();
          return `Path not in workspace: Attempted path "${absolutePath}" resolves outside the allowed workspace directories: ${workspaceDirs.join(', ')} or the project temp directory: ${projectTempDir}`;
        },
      } as unknown as Config;
      const geminiIgnoreTool = new RipGrepTool(
        configWithoutGeminiIgnore,
        createMockMessageBus(),
      );

      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'ignored.log' },
                line_number: 1,
                lines: { text: 'secret log entry\n' },
              },
            }) + '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = { pattern: 'secret' };
      const invocation = geminiIgnoreTool.build(params);
      await invocation.execute(abortSignal);

      expect(mockSpawn).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.not.arrayContaining(['--ignore-file', geminiIgnorePath]),
        expect.anything(),
      );
    });

    it('should handle context parameters', async () => {
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'context',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 1,
                lines: { text: 'hello world\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 2,
                lines: { text: 'second line with world\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'context',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 3,
                lines: { text: 'third line\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'context',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 4,
                lines: { text: 'fourth line\n' },
              },
            }) +
            '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = {
        pattern: 'world',
        context: 1,
        after: 2,
        before: 1,
      };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(mockSpawn).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.arrayContaining([
          '--context',
          '1',
          '--after-context',
          '2',
          '--before-context',
          '1',
        ]),
        expect.anything(),
      );
      expect(result.llmContent).toContain('Found 1 match for pattern "world"');
      expect(result.llmContent).toContain('File: fileA.txt');
      expect(result.llmContent).toContain('L1- hello world');
      expect(result.llmContent).toContain('L2: second line with world');
      expect(result.llmContent).toContain('L3- third line');
      expect(result.llmContent).toContain('L4- fourth line');
    });
  });

  describe('getDescription', () => {
    it.each([
      {
        name: 'pattern only',
        params: { pattern: 'testPattern' },
        expected: "'testPattern' within ./",
      },
      {
        name: 'pattern and include',
        params: { pattern: 'testPattern', include: '*.ts' },
        expected: "'testPattern' in *.ts within ./",
      },
      {
        name: 'root path in description',
        params: { pattern: 'testPattern', dir_path: '.' },
        expected: "'testPattern' within ./",
      },
    ])(
      'should generate correct description with $name',
      ({ params, expected }) => {
        const invocation = grepTool.build(params);
        expect(invocation.getDescription()).toBe(expected);
      },
    );

    it('should generate correct description with pattern and path', async () => {
      const dirPath = path.join(tempRootDir, 'src', 'app');
      await fs.mkdir(dirPath, { recursive: true });
      const params: RipGrepToolParams = {
        pattern: 'testPattern',
        dir_path: path.join('src', 'app'),
      };
      const invocation = grepTool.build(params);
      expect(invocation.getDescription()).toContain("'testPattern' within");
      expect(invocation.getDescription()).toContain(path.join('src', 'app'));
    });

    it('should use ./ when no path is specified (defaults to CWD)', () => {
      const multiDirConfig = {
        getTargetDir: () => tempRootDir,
        getWorkspaceContext: () =>
          createMockWorkspaceContext(tempRootDir, ['/another/dir']),
        getDebugMode: () => false,
        getFileFilteringOptions: () => ({
          respectGitIgnore: true,
          respectGeminiIgnore: true,
        }),
        storage: {
          getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
        },
        isPathAllowed(this: Config, absolutePath: string): boolean {
          const workspaceContext = this.getWorkspaceContext();
          if (workspaceContext.isPathWithinWorkspace(absolutePath)) {
            return true;
          }

          const projectTempDir = this.storage.getProjectTempDir();
          return isSubpath(path.resolve(projectTempDir), absolutePath);
        },
        validatePathAccess(this: Config, absolutePath: string): string | null {
          if (this.isPathAllowed(absolutePath)) {
            return null;
          }

          const workspaceDirs = this.getWorkspaceContext().getDirectories();
          const projectTempDir = this.storage.getProjectTempDir();
          return `Path not in workspace: Attempted path "${absolutePath}" resolves outside the allowed workspace directories: ${workspaceDirs.join(', ')} or the project temp directory: ${projectTempDir}`;
        },
      } as unknown as Config;

      const multiDirGrepTool = new RipGrepTool(
        multiDirConfig,
        createMockMessageBus(),
      );
      const params: RipGrepToolParams = { pattern: 'testPattern' };
      const invocation = multiDirGrepTool.build(params);
      expect(invocation.getDescription()).toBe("'testPattern' within ./");
    });

    it('should generate correct description with pattern, include, and path', async () => {
      const dirPath = path.join(tempRootDir, 'src', 'app');
      await fs.mkdir(dirPath, { recursive: true });
      const params: RipGrepToolParams = {
        pattern: 'testPattern',
        include: '*.ts',
        dir_path: path.join('src', 'app'),
      };
      const invocation = grepTool.build(params);
      expect(invocation.getDescription()).toContain(
        "'testPattern' in *.ts within",
      );
      expect(invocation.getDescription()).toContain(path.join('src', 'app'));
    });
  });

  describe('new parameters', () => {
    it('should pass --max-count when max_matches_per_file is provided', async () => {
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 1,
                lines: { text: 'hello world\n' },
              },
            }) + '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = {
        pattern: 'world',
        max_matches_per_file: 1,
      };
      const invocation = grepTool.build(params);
      await invocation.execute(abortSignal);

      const spawnArgs = mockSpawn.mock.calls[0][1];
      expect(spawnArgs).toContain('--max-count');
      expect(spawnArgs).toContain('1');
    });

    it('should respect total_max_matches and truncate results', async () => {
      // Return 3 matches, but set total_max_matches to 2
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 1,
                lines: { text: 'match 1\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 2,
                lines: { text: 'match 2\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 3,
                lines: { text: 'match 3\n' },
              },
            }) +
            '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = {
        pattern: 'match',
        total_max_matches: 2,
        context: 0,
      };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Found 2 matches');
      expect(result.llmContent).toContain(
        'results limited to 2 matches for performance',
      );
      expect(result.llmContent).toContain('L1: match 1');
      expect(result.llmContent).toContain('L2: match 2');
      expect(result.llmContent).not.toContain('L3: match 3');
      expect(result.returnDisplay).toBe('Found 2 matches (limited)');
    });

    it('should return only file paths when names_only is true', async () => {
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 1,
                lines: { text: 'hello world\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileB.txt' },
                line_number: 5,
                lines: { text: 'hello again\n' },
              },
            }) +
            '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = {
        pattern: 'hello',
        names_only: true,
      };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Found 2 files with matches');
      expect(result.llmContent).toContain('fileA.txt');
      expect(result.llmContent).toContain('fileB.txt');
      expect(result.llmContent).not.toContain('L1:');
      expect(result.llmContent).not.toContain('hello world');
    });

    it('should filter out matches based on exclude_pattern', async () => {
      mockSpawn.mockImplementation(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 1,
                lines: { text: 'Copyright 2025 Google LLC\n' },
              },
            }) +
            '\n' +
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileB.txt' },
                line_number: 1,
                lines: { text: 'Copyright 2026 Google LLC\n' },
              },
            }) +
            '\n',
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = {
        pattern: 'Copyright .* Google LLC',
        exclude_pattern: '2026',
        context: 0,
      };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('Found 1 match');
      expect(result.llmContent).toContain('fileA.txt');
      expect(result.llmContent).not.toContain('fileB.txt');
      expect(result.llmContent).toContain('Copyright 2025 Google LLC');
    });
  });
});

afterAll(() => {
  storageSpy.mockRestore();
});
