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
import fs from 'node:fs/promises';
import os from 'node:os';
import type { Config } from '../config/config.js';
import { Storage } from '../config/storage.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { downloadRipGrep } from '@joshua.litt/get-ripgrep';
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
    exitCode?: number;
    signal?: string;
  } = {},
) {
  const { outputData, exitCode = 0, signal } = options;

  return () => {
    const mockProcess = {
      stdout: {
        on: vi.fn(),
        removeListener: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
        removeListener: vi.fn(),
      },
      on: vi.fn(),
      removeListener: vi.fn(),
      kill: vi.fn(),
    };

    // Set up event listeners immediately
    setTimeout(() => {
      const stdoutDataHandler = mockProcess.stdout.on.mock.calls.find(
        (call) => call[0] === 'data',
      )?.[1];

      const closeHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'close',
      )?.[1];

      if (stdoutDataHandler && outputData) {
        stdoutDataHandler(Buffer.from(outputData));
      }

      if (closeHandler) {
        closeHandler(exitCode, signal);
      }
    }, 0);

    return mockProcess as unknown as ChildProcess;
  };
}

describe('RipGrepTool', () => {
  let tempRootDir: string;
  let tempBinRoot: string;
  let binDir: string;
  let ripgrepBinaryPath: string;
  let grepTool: RipGrepTool;
  const abortSignal = new AbortController().signal;

  const mockConfig = {
    getTargetDir: () => tempRootDir,
    getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
    getDebugMode: () => false,
  } as unknown as Config;

  beforeEach(async () => {
    downloadRipGrepMock.mockReset();
    downloadRipGrepMock.mockResolvedValue(undefined);
    mockSpawn.mockReset();
    tempBinRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ripgrep-bin-'));
    binDir = path.join(tempBinRoot, 'bin');
    await fs.mkdir(binDir, { recursive: true });
    const binaryName = process.platform === 'win32' ? 'rg.exe' : 'rg';
    ripgrepBinaryPath = path.join(binDir, binaryName);
    await fs.writeFile(ripgrepBinaryPath, '');
    storageSpy.mockImplementation(() => binDir);
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grep-tool-root-'));
    grepTool = new RipGrepTool(mockConfig);

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
      {
        name: 'invalid regex pattern',
        params: { pattern: '[[' },
        expected: null,
      },
    ])(
      'should return null for valid params ($name)',
      ({ params, expected }) => {
        expect(grepTool.validateToolParams(params)).toBe(expected);
      },
    );

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
      expect(grepTool.validateToolParams(params)).toContain(
        'Path does not exist',
      );
      expect(grepTool.validateToolParams(params)).toContain('nonexistent');
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
      mockSpawn.mockImplementationOnce(
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

    it('should find matches in a specific path', async () => {
      // Setup specific mock for this test - searching in 'sub' should only return matches from that directory
      mockSpawn.mockImplementationOnce(
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
      mockSpawn.mockImplementationOnce(
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
      mockSpawn.mockImplementationOnce(() => {
        const mockProcess = {
          stdout: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          on: vi.fn(),
          removeListener: vi.fn(),
          kill: vi.fn(),
        };

        setTimeout(() => {
          const onData = mockProcess.stdout.on.mock.calls.find(
            (call) => call[0] === 'data',
          )?.[1];
          const onClose = mockProcess.on.mock.calls.find(
            (call) => call[0] === 'close',
          )?.[1];

          if (onData) {
            // Only return match from the .js file in sub directory
            onData(
              Buffer.from(
                JSON.stringify({
                  type: 'match',
                  data: {
                    path: { text: 'another.js' },
                    line_number: 1,
                    lines: { text: 'const greeting = "hello";\n' },
                  },
                }) + '\n',
              ),
            );
          }
          if (onClose) {
            onClose(0);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

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
      mockSpawn.mockImplementationOnce(
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

    it('should return an error from ripgrep for invalid regex pattern', async () => {
      mockSpawn.mockImplementationOnce(
        createMockSpawn({
          exitCode: 2,
        }),
      );

      const params: RipGrepToolParams = { pattern: '[[' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain('ripgrep exited with code 2');
      expect(result.returnDisplay).toContain(
        'Error: ripgrep exited with code 2',
      );
    });

    it('should handle regex special characters correctly', async () => {
      // Setup specific mock for this test - regex pattern 'foo.*bar' should match 'const foo = "bar";'
      mockSpawn.mockImplementationOnce(() => {
        const mockProcess = {
          stdout: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          on: vi.fn(),
          removeListener: vi.fn(),
          kill: vi.fn(),
        };

        setTimeout(() => {
          const onData = mockProcess.stdout.on.mock.calls.find(
            (call) => call[0] === 'data',
          )?.[1];
          const onClose = mockProcess.on.mock.calls.find(
            (call) => call[0] === 'close',
          )?.[1];

          if (onData) {
            // Return match for the regex pattern
            onData(
              Buffer.from(
                JSON.stringify({
                  type: 'match',
                  data: {
                    path: { text: 'fileB.js' },
                    line_number: 1,
                    lines: { text: 'const foo = "bar";\n' },
                  },
                }) + '\n',
              ),
            );
          }
          if (onClose) {
            onClose(0);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

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
      mockSpawn.mockImplementationOnce(() => {
        const mockProcess = {
          stdout: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          on: vi.fn(),
          removeListener: vi.fn(),
          kill: vi.fn(),
        };

        setTimeout(() => {
          const onData = mockProcess.stdout.on.mock.calls.find(
            (call) => call[0] === 'data',
          )?.[1];
          const onClose = mockProcess.on.mock.calls.find(
            (call) => call[0] === 'close',
          )?.[1];

          if (onData) {
            // Return case-insensitive matches for 'HELLO'
            onData(
              Buffer.from(
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
              ),
            );
          }
          if (onClose) {
            onClose(0);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

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
      } as unknown as Config;

      // Setup specific mock for this test - multi-directory search for 'world'
      // Mock will be called twice - once for each directory
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        const mockProcess = {
          stdout: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          on: vi.fn(),
          removeListener: vi.fn(),
          kill: vi.fn(),
        };

        setTimeout(() => {
          const stdoutDataHandler = mockProcess.stdout.on.mock.calls.find(
            (call) => call[0] === 'data',
          )?.[1];

          const closeHandler = mockProcess.on.mock.calls.find(
            (call) => call[0] === 'close',
          )?.[1];

          let outputData = '';
          if (callCount === 1) {
            // First directory (tempRootDir)
            outputData =
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
              '\n';
          } else if (callCount === 2) {
            // Second directory (secondDir)
            outputData =
              JSON.stringify({
                type: 'match',
                data: {
                  path: { text: 'other.txt' },
                  line_number: 2,
                  lines: { text: 'world in second\n' },
                },
              }) +
              '\n' +
              JSON.stringify({
                type: 'match',
                data: {
                  path: { text: 'another.js' },
                  line_number: 1,
                  lines: { text: 'function world() { return "test"; }\n' },
                },
              }) +
              '\n';
          }

          if (stdoutDataHandler && outputData) {
            stdoutDataHandler(Buffer.from(outputData));
          }

          if (closeHandler) {
            closeHandler(0);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

      const multiDirGrepTool = new RipGrepTool(multiDirConfig);
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
      } as unknown as Config;

      // Setup specific mock for this test - searching in 'sub' should only return matches from that directory
      mockSpawn.mockImplementationOnce(() => {
        const mockProcess = {
          stdout: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          on: vi.fn(),
          removeListener: vi.fn(),
          kill: vi.fn(),
        };

        setTimeout(() => {
          const onData = mockProcess.stdout.on.mock.calls.find(
            (call) => call[0] === 'data',
          )?.[1];
          const onClose = mockProcess.on.mock.calls.find(
            (call) => call[0] === 'close',
          )?.[1];

          if (onData) {
            onData(
              Buffer.from(
                JSON.stringify({
                  type: 'match',
                  data: {
                    path: { text: 'fileC.txt' },
                    line_number: 1,
                    lines: { text: 'another world in sub dir\n' },
                  },
                }) + '\n',
              ),
            );
          }
          if (onClose) {
            onClose(0);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

      const multiDirGrepTool = new RipGrepTool(multiDirConfig);

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
      mockSpawn.mockImplementationOnce(() => {
        const mockProcess = {
          stdout: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          on: vi.fn(),
          removeListener: vi.fn(),
          kill: vi.fn(),
        };

        // Simulate process being aborted - use setTimeout to ensure handlers are registered first
        setTimeout(() => {
          const closeHandler = mockProcess.on.mock.calls.find(
            (call) => call[0] === 'close',
          )?.[1];

          if (closeHandler) {
            // Simulate process killed by signal (code is null, signal is SIGTERM)
            closeHandler(null, 'SIGTERM');
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

      const controller = new AbortController();
      const params: RipGrepToolParams = { pattern: 'test' };
      const invocation = grepTool.build(params);

      // Abort immediately before starting the search
      controller.abort();

      const result = await invocation.execute(controller.signal);
      expect(result.llmContent).toContain(
        'Error during grep search operation: ripgrep exited with code null',
      );
      expect(result.returnDisplay).toContain(
        'Error: ripgrep exited with code null',
      );
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle workspace boundary violations', () => {
      const params: RipGrepToolParams = {
        pattern: 'test',
        dir_path: '../outside',
      };
      expect(() => grepTool.build(params)).toThrow(/Path validation failed/);
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
      mockSpawn.mockImplementationOnce(createMockSpawn({ exitCode: 1 }));

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
      mockSpawn.mockImplementationOnce(() => {
        const mockProcess = {
          stdout: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          on: vi.fn(),
          removeListener: vi.fn(),
          kill: vi.fn(),
        };

        setTimeout(() => {
          const onData = mockProcess.stdout.on.mock.calls.find(
            (call) => call[0] === 'data',
          )?.[1];
          const onClose = mockProcess.on.mock.calls.find(
            (call) => call[0] === 'close',
          )?.[1];

          if (onData) {
            onData(
              Buffer.from(
                JSON.stringify({
                  type: 'match',
                  data: {
                    path: { text: specialFileName },
                    line_number: 1,
                    lines: { text: 'hello world with special chars\n' },
                  },
                }) + '\n',
              ),
            );
          }
          if (onClose) {
            onClose(0);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

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
      mockSpawn.mockImplementationOnce(() => {
        const mockProcess = {
          stdout: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          on: vi.fn(),
          removeListener: vi.fn(),
          kill: vi.fn(),
        };

        setTimeout(() => {
          const onData = mockProcess.stdout.on.mock.calls.find(
            (call) => call[0] === 'data',
          )?.[1];
          const onClose = mockProcess.on.mock.calls.find(
            (call) => call[0] === 'close',
          )?.[1];

          if (onData) {
            onData(
              Buffer.from(
                JSON.stringify({
                  type: 'match',
                  data: {
                    path: { text: 'a/b/c/d/e/deep.txt' },
                    line_number: 1,
                    lines: { text: 'content in deep directory\n' },
                  },
                }) + '\n',
              ),
            );
          }
          if (onClose) {
            onClose(0);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

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
      mockSpawn.mockImplementationOnce(() => {
        const mockProcess = {
          stdout: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          on: vi.fn(),
          removeListener: vi.fn(),
          kill: vi.fn(),
        };

        setTimeout(() => {
          const onData = mockProcess.stdout.on.mock.calls.find(
            (call) => call[0] === 'data',
          )?.[1];
          const onClose = mockProcess.on.mock.calls.find(
            (call) => call[0] === 'close',
          )?.[1];

          if (onData) {
            onData(
              Buffer.from(
                JSON.stringify({
                  type: 'match',
                  data: {
                    path: { text: 'code.js' },
                    line_number: 1,
                    lines: { text: 'function getName() { return "test"; }\n' },
                  },
                }) + '\n',
              ),
            );
          }
          if (onClose) {
            onClose(0);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

      const params: RipGrepToolParams = { pattern: 'function\\s+\\w+\\s*\\(' };
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
      mockSpawn.mockImplementationOnce(() => {
        const mockProcess = {
          stdout: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          on: vi.fn(),
          removeListener: vi.fn(),
          kill: vi.fn(),
        };

        setTimeout(() => {
          const onData = mockProcess.stdout.on.mock.calls.find(
            (call) => call[0] === 'data',
          )?.[1];
          const onClose = mockProcess.on.mock.calls.find(
            (call) => call[0] === 'close',
          )?.[1];

          if (onData) {
            onData(
              Buffer.from(
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
              ),
            );
          }
          if (onClose) {
            onClose(0);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

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
      mockSpawn.mockImplementationOnce(() => {
        const mockProcess = {
          stdout: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          on: vi.fn(),
          removeListener: vi.fn(),
          kill: vi.fn(),
        };

        setTimeout(() => {
          const onData = mockProcess.stdout.on.mock.calls.find(
            (call) => call[0] === 'data',
          )?.[1];
          const onClose = mockProcess.on.mock.calls.find(
            (call) => call[0] === 'close',
          )?.[1];

          if (onData) {
            onData(
              Buffer.from(
                JSON.stringify({
                  type: 'match',
                  data: {
                    path: { text: 'special.txt' },
                    line_number: 1,
                    lines: { text: 'Price: $19.99\n' },
                  },
                }) + '\n',
              ),
            );
          }
          if (onClose) {
            onClose(0);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

      const params: RipGrepToolParams = { pattern: '\\$\\d+\\.\\d+' };
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
      mockSpawn.mockImplementationOnce(() => {
        const mockProcess = {
          stdout: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          on: vi.fn(),
          removeListener: vi.fn(),
          kill: vi.fn(),
        };

        setTimeout(() => {
          const onData = mockProcess.stdout.on.mock.calls.find(
            (call) => call[0] === 'data',
          )?.[1];
          const onClose = mockProcess.on.mock.calls.find(
            (call) => call[0] === 'close',
          )?.[1];

          if (onData) {
            onData(
              Buffer.from(
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
              ),
            );
          }
          if (onClose) {
            onClose(0);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

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
      mockSpawn.mockImplementationOnce(() => {
        const mockProcess = {
          stdout: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
            removeListener: vi.fn(),
          },
          on: vi.fn(),
          removeListener: vi.fn(),
          kill: vi.fn(),
        };

        setTimeout(() => {
          const onData = mockProcess.stdout.on.mock.calls.find(
            (call) => call[0] === 'data',
          )?.[1];
          const onClose = mockProcess.on.mock.calls.find(
            (call) => call[0] === 'close',
          )?.[1];

          if (onData) {
            onData(
              Buffer.from(
                JSON.stringify({
                  type: 'match',
                  data: {
                    path: { text: 'src/main.ts' },
                    line_number: 1,
                    lines: { text: 'source code\n' },
                  },
                }) + '\n',
              ),
            );
          }
          if (onClose) {
            onClose(0);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

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
      mockSpawn.mockImplementationOnce(
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
      let params: RipGrepToolParams = { pattern: 'HELLO' };
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
      mockSpawn.mockImplementationOnce(
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
      params = { pattern: 'HELLO', case_sensitive: true };
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

    it.each([
      {
        name: 'fixed_strings parameter',
        params: { pattern: 'hello.world', fixed_strings: true },
        mockOutput: {
          path: { text: 'fileA.txt' },
          line_number: 1,
          lines: { text: 'hello.world\n' },
        },
        expectedArgs: ['--fixed-strings'],
        expectedPattern: 'hello.world',
      },
    ])(
      'should handle $name',
      async ({ params, mockOutput, expectedArgs, expectedPattern }) => {
        mockSpawn.mockImplementationOnce(
          createMockSpawn({
            outputData:
              JSON.stringify({ type: 'match', data: mockOutput }) + '\n',
            exitCode: 0,
          }),
        );

        const invocation = grepTool.build(params);
        const result = await invocation.execute(abortSignal);

        expect(mockSpawn).toHaveBeenLastCalledWith(
          expect.anything(),
          expect.arrayContaining(expectedArgs),
          expect.anything(),
        );
        expect(result.llmContent).toContain(
          `Found 1 match for pattern "${expectedPattern}"`,
        );
      },
    );

    it('should handle no_ignore parameter', async () => {
      mockSpawn.mockImplementationOnce(
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

    it('should handle context parameters', async () => {
      mockSpawn.mockImplementationOnce(
        createMockSpawn({
          outputData:
            JSON.stringify({
              type: 'match',
              data: {
                path: { text: 'fileA.txt' },
                line_number: 2,
                lines: { text: 'second line with world\n' },
                lines_before: [{ text: 'hello world\n' }],
                lines_after: [
                  { text: 'third line\n' },
                  { text: 'fourth line\n' },
                ],
              },
            }) + '\n',
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
      expect(result.llmContent).toContain('L2: second line with world');
      // Note: Ripgrep JSON output for context lines doesn't include line numbers for context lines directly
      // The current parsing only extracts the matched line, so we only assert on that.
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
      } as unknown as Config;

      const multiDirGrepTool = new RipGrepTool(multiDirConfig);
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
});

/**
 * Integration tests that use the REAL ripgrep binary (no mocking)
 * to verify actual ignore behavior.
 */
describe('RipGrepTool - Ignore Behavior Integration Tests', () => {
  let tempRootDir: string;
  let tempBinRoot: string;
  let binDir: string;
  let grepTool: RipGrepTool;
  let realSpawn: typeof spawn;
  const abortSignal = new AbortController().signal;

  beforeEach(async () => {
    // Get the real spawn function before tests
    const childProcess =
      await vi.importActual<typeof import('node:child_process')>(
        'node:child_process',
      );
    realSpawn = childProcess.spawn;

    // Setup bin directory - will download real ripgrep
    tempBinRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ripgrep-bin-'));
    binDir = path.join(tempBinRoot, 'bin');
    await fs.mkdir(binDir, { recursive: true });
    storageSpy.mockImplementation(() => binDir);

    // Reset download mock but allow it to actually download
    downloadRipGrepMock.mockReset();
    downloadRipGrepMock.mockImplementation(async (targetDir: string) => {
      // Use the real downloadRipGrep function
      const realDownload = await vi.importActual<
        typeof import('@joshua.litt/get-ripgrep')
      >('@joshua.litt/get-ripgrep');
      return realDownload.downloadRipGrep(targetDir);
    });

    // Create temp root directory for test files
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grep-ignore-test-'));

    // Initialize a git repository (required for .gitignore to work)
    await fs.mkdir(path.join(tempRootDir, '.git'), { recursive: true });

    // Use real spawn for these tests
    mockSpawn.mockImplementation(realSpawn);

    const mockConfig = {
      getTargetDir: () => tempRootDir,
      getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
      getDebugMode: () => false,
    } as unknown as Config;

    grepTool = new RipGrepTool(mockConfig);
  });

  afterEach(async () => {
    storageSpy.mockImplementation(() => originalGetGlobalBinDir());
    await fs.rm(tempRootDir, { recursive: true, force: true });
    await fs.rm(tempBinRoot, { recursive: true, force: true });
  });

  describe('node_modules exclusion', () => {
    it('should NOT search files in node_modules by default', async () => {
      // Create a file in node_modules
      await fs.mkdir(path.join(tempRootDir, 'node_modules', 'some-package'), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(tempRootDir, 'node_modules', 'some-package', 'index.js'),
        'const UNIQUE_SEARCH_TERM = "found in node_modules";',
      );

      // Create a file outside node_modules with the same term
      await fs.writeFile(
        path.join(tempRootDir, 'main.js'),
        'const UNIQUE_SEARCH_TERM = "found in main";',
      );

      const params: RipGrepToolParams = { pattern: 'UNIQUE_SEARCH_TERM' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      // Should find the file in main.js
      expect(result.llmContent).toContain('main.js');
      expect(result.llmContent).toContain('found in main');

      // Should NOT find the file in node_modules
      expect(result.llmContent).not.toContain('node_modules');
      expect(result.llmContent).not.toContain('found in node_modules');
    });

    it('should search node_modules when no_ignore is true', async () => {
      // Create a file in node_modules
      await fs.mkdir(path.join(tempRootDir, 'node_modules', 'some-package'), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(tempRootDir, 'node_modules', 'some-package', 'index.js'),
        'const NO_IGNORE_TEST = "found in node_modules";',
      );

      const params: RipGrepToolParams = {
        pattern: 'NO_IGNORE_TEST',
        no_ignore: true,
      };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      // Should find the file in node_modules when no_ignore is true
      expect(result.llmContent).toContain('node_modules');
      expect(result.llmContent).toContain('found in node_modules');
    });
  });

  describe('.gitignore respect', () => {
    it('should respect .gitignore patterns', async () => {
      // Create .gitignore that ignores *.log files
      await fs.writeFile(
        path.join(tempRootDir, '.gitignore'),
        '*.log\nbuild/\n',
      );

      // Create a .log file that should be ignored
      await fs.writeFile(
        path.join(tempRootDir, 'debug.log'),
        'GITIGNORE_TEST_TERM in log file',
      );

      // Create a build directory that should be ignored
      await fs.mkdir(path.join(tempRootDir, 'build'), { recursive: true });
      await fs.writeFile(
        path.join(tempRootDir, 'build', 'output.js'),
        'GITIGNORE_TEST_TERM in build',
      );

      // Create a regular file that should be found
      await fs.writeFile(
        path.join(tempRootDir, 'src.js'),
        'GITIGNORE_TEST_TERM in src',
      );

      const params: RipGrepToolParams = { pattern: 'GITIGNORE_TEST_TERM' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      // Should find the file in src.js
      expect(result.llmContent).toContain('src.js');
      expect(result.llmContent).toContain('in src');

      // Should NOT find files matching .gitignore patterns
      expect(result.llmContent).not.toContain('debug.log');
      expect(result.llmContent).not.toContain('in log file');
      expect(result.llmContent).not.toContain('build/');
      expect(result.llmContent).not.toContain('in build');
    });

    it('should search gitignored files when no_ignore is true', async () => {
      // Create .gitignore that ignores *.log files
      await fs.writeFile(path.join(tempRootDir, '.gitignore'), '*.log\n');

      // Create a .log file that should be ignored normally
      await fs.writeFile(
        path.join(tempRootDir, 'app.log'),
        'NO_IGNORE_GITIGNORE_TEST in log',
      );

      const params: RipGrepToolParams = {
        pattern: 'NO_IGNORE_GITIGNORE_TEST',
        no_ignore: true,
      };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      // Should find the .log file when no_ignore is true
      expect(result.llmContent).toContain('app.log');
      expect(result.llmContent).toContain('in log');
    });
  });

  describe('.geminiignore respect', () => {
    it('should respect .geminiignore patterns', async () => {
      // Create .geminiignore that ignores specific patterns
      await fs.writeFile(
        path.join(tempRootDir, '.geminiignore'),
        'secrets/\n*.secret\n',
      );

      // Create files that should be ignored by .geminiignore
      await fs.mkdir(path.join(tempRootDir, 'secrets'), { recursive: true });
      await fs.writeFile(
        path.join(tempRootDir, 'secrets', 'api-keys.txt'),
        'GEMINIIGNORE_TEST_TERM in secrets',
      );
      await fs.writeFile(
        path.join(tempRootDir, 'password.secret'),
        'GEMINIIGNORE_TEST_TERM in secret file',
      );

      // Create a regular file that should be found
      await fs.writeFile(
        path.join(tempRootDir, 'config.js'),
        'GEMINIIGNORE_TEST_TERM in config',
      );

      const params: RipGrepToolParams = { pattern: 'GEMINIIGNORE_TEST_TERM' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      // Should find the file in config.js
      expect(result.llmContent).toContain('config.js');
      expect(result.llmContent).toContain('in config');

      // Should NOT find files matching .geminiignore patterns
      // NOTE: This test is expected to FAIL if .geminiignore is not respected
      expect(result.llmContent).not.toContain('secrets/');
      expect(result.llmContent).not.toContain('in secrets');
      expect(result.llmContent).not.toContain('password.secret');
      expect(result.llmContent).not.toContain('in secret file');
    });
  });

  describe('combined .gitignore and .geminiignore', () => {
    it('should respect both .gitignore and .geminiignore patterns', async () => {
      // Create .gitignore
      await fs.writeFile(path.join(tempRootDir, '.gitignore'), 'dist/\n');

      // Create .geminiignore
      await fs.writeFile(path.join(tempRootDir, '.geminiignore'), 'temp/\n');

      // Create files that should be ignored by .gitignore
      await fs.mkdir(path.join(tempRootDir, 'dist'), { recursive: true });
      await fs.writeFile(
        path.join(tempRootDir, 'dist', 'bundle.js'),
        'COMBINED_IGNORE_TEST in dist',
      );

      // Create files that should be ignored by .geminiignore
      await fs.mkdir(path.join(tempRootDir, 'temp'), { recursive: true });
      await fs.writeFile(
        path.join(tempRootDir, 'temp', 'cache.txt'),
        'COMBINED_IGNORE_TEST in temp',
      );

      // Create a regular file that should be found
      await fs.writeFile(
        path.join(tempRootDir, 'index.js'),
        'COMBINED_IGNORE_TEST in index',
      );

      const params: RipGrepToolParams = { pattern: 'COMBINED_IGNORE_TEST' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      // Should find the file in index.js
      expect(result.llmContent).toContain('index.js');
      expect(result.llmContent).toContain('in index');

      // Should NOT find files in dist/ (gitignore)
      expect(result.llmContent).not.toContain('dist/');
      expect(result.llmContent).not.toContain('bundle.js');

      // Should NOT find files in temp/ (geminiignore)
      // NOTE: This assertion is expected to FAIL if .geminiignore is not respected
      expect(result.llmContent).not.toContain('temp/');
      expect(result.llmContent).not.toContain('cache.txt');
    });
  });
});

afterAll(() => {
  storageSpy.mockRestore();
});
