/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RipGrepTool, RipGrepToolParams } from './ripGrep.js';
import path from 'path';
import fs from 'fs/promises';
import os, { EOL } from 'os';
import { Config } from '../config/config.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';
import { spawn, ChildProcess } from 'child_process';

// Mock @lvce-editor/ripgrep for testing
vi.mock('@lvce-editor/ripgrep', () => ({
  rgPath: '/mock/rg/path',
}));

// Mock child_process for ripgrep calls
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(spawn);

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
  let grepTool: RipGrepTool;
  const abortSignal = new AbortController().signal;

  const mockConfig = {
    getTargetDir: () => tempRootDir,
    getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
    getDebugMode: () => false,
  } as unknown as Config;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSpawn.mockClear();
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
    await fs.rm(tempRootDir, { recursive: true, force: true });
  });

  describe('validateToolParams', () => {
    it('should return null for valid params (pattern only)', () => {
      const params: RipGrepToolParams = { pattern: 'hello' };
      expect(grepTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid params (pattern and path)', () => {
      const params: RipGrepToolParams = { pattern: 'hello', path: '.' };
      expect(grepTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid params (pattern, path, and include)', () => {
      const params: RipGrepToolParams = {
        pattern: 'hello',
        path: '.',
        include: '*.txt',
      };
      expect(grepTool.validateToolParams(params)).toBeNull();
    });

    it('should return error if pattern is missing', () => {
      const params = { path: '.' } as unknown as RipGrepToolParams;
      expect(grepTool.validateToolParams(params)).toBe(
        `params must have required property 'pattern'`,
      );
    });

    it('should return null for what would be an invalid regex pattern', () => {
      const params: RipGrepToolParams = { pattern: '[[' };
      expect(grepTool.validateToolParams(params)).toBeNull();
    });

    it('should return error if path does not exist', () => {
      const params: RipGrepToolParams = {
        pattern: 'hello',
        path: 'nonexistent',
      };
      // Check for the core error message, as the full path might vary
      expect(grepTool.validateToolParams(params)).toContain(
        'Failed to access path stats for',
      );
      expect(grepTool.validateToolParams(params)).toContain('nonexistent');
    });

    it('should return error if path is a file, not a directory', async () => {
      const filePath = path.join(tempRootDir, 'fileA.txt');
      const params: RipGrepToolParams = { pattern: 'hello', path: filePath };
      expect(grepTool.validateToolParams(params)).toContain(
        `Path is not a directory: ${filePath}`,
      );
    });
  });

  describe('execute', () => {
    it('should find matches for a simple pattern in all files', async () => {
      mockSpawn.mockImplementationOnce(
        createMockSpawn({
          outputData: `fileA.txt:1:hello world${EOL}fileA.txt:2:second line with world${EOL}sub/fileC.txt:1:another world in sub dir${EOL}`,
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = { pattern: 'world' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain(
        'Found 3 matches for pattern "world" in the workspace directory',
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
          outputData: `fileC.txt:1:another world in sub dir${EOL}`,
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = { pattern: 'world', path: 'sub' };
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
          outputData: `fileB.js:2:function baz() { return "hello"; }${EOL}`,
          exitCode: 0,
        }),
      );

      const params: RipGrepToolParams = { pattern: 'hello', include: '*.js' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);
      expect(result.llmContent).toContain(
        'Found 1 match for pattern "hello" in the workspace directory (filter: "*.js"):',
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
            onData(Buffer.from(`another.js:1:const greeting = "hello";${EOL}`));
          }
          if (onClose) {
            onClose(0);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

      const params: RipGrepToolParams = {
        pattern: 'hello',
        path: 'sub',
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
        'No matches found for pattern "nonexistentpattern" in the workspace directory.',
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
            onData(Buffer.from(`fileB.js:1:const foo = "bar";${EOL}`));
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
        'Found 1 match for pattern "foo.*bar" in the workspace directory:',
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
                `fileA.txt:1:hello world${EOL}fileB.js:2:function baz() { return "hello"; }${EOL}`,
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
        'Found 2 matches for pattern "HELLO" in the workspace directory:',
      );
      expect(result.llmContent).toContain('File: fileA.txt');
      expect(result.llmContent).toContain('L1: hello world');
      expect(result.llmContent).toContain('File: fileB.js');
      expect(result.llmContent).toContain(
        'L2: function baz() { return "hello"; }',
      );
    });

    it('should throw an error if params are invalid', async () => {
      const params = { path: '.' } as unknown as RipGrepToolParams; // Invalid: pattern missing
      expect(() => grepTool.build(params)).toThrow(
        /params must have required property 'pattern'/,
      );
    });
  });

  describe('multi-directory workspace', () => {
    it('should search across all workspace directories when no path is specified', async () => {
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
              [
                'fileA.txt:1:hello world',
                'fileA.txt:2:second line with world',
                'sub/fileC.txt:1:another world in sub dir',
              ].join(EOL) + EOL;
          } else if (callCount === 2) {
            // Second directory (secondDir)
            outputData =
              [
                'other.txt:2:world in second',
                'another.js:1:function world() { return "test"; }',
              ].join(EOL) + EOL;
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

      // Should find matches in both directories
      expect(result.llmContent).toContain(
        'Found 5 matches for pattern "world"',
      );

      // Matches from first directory
      expect(result.llmContent).toContain('fileA.txt');
      expect(result.llmContent).toContain('L1: hello world');
      expect(result.llmContent).toContain('L2: second line with world');
      expect(result.llmContent).toContain('fileC.txt');
      expect(result.llmContent).toContain('L1: another world in sub dir');

      // Matches from both directories
      expect(result.llmContent).toContain('other.txt');
      expect(result.llmContent).toContain('L2: world in second');
      expect(result.llmContent).toContain('another.js');
      expect(result.llmContent).toContain('L1: function world()');

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
            onData(Buffer.from(`fileC.txt:1:another world in sub dir${EOL}`));
          }
          if (onClose) {
            onClose(0);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

      const multiDirGrepTool = new RipGrepTool(multiDirConfig);

      // Search only in the 'sub' directory of the first workspace
      const params: RipGrepToolParams = { pattern: 'world', path: 'sub' };
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
      const params: RipGrepToolParams = { pattern: 'test', path: '../outside' };
      expect(() => grepTool.build(params)).toThrow(/Path validation failed/);
    });

    it('should handle empty directories gracefully', async () => {
      const emptyDir = path.join(tempRootDir, 'empty');
      await fs.mkdir(emptyDir);

      // Setup specific mock for this test - searching in empty directory should return no matches
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
          const onClose = mockProcess.on.mock.calls.find(
            (call) => call[0] === 'close',
          )?.[1];

          if (onClose) {
            onClose(1);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

      const params: RipGrepToolParams = { pattern: 'test', path: 'empty' };
      const invocation = grepTool.build(params);
      const result = await invocation.execute(abortSignal);

      expect(result.llmContent).toContain('No matches found');
      expect(result.returnDisplay).toBe('No matches found');
    });

    it('should handle empty files correctly', async () => {
      await fs.writeFile(path.join(tempRootDir, 'empty.txt'), '');

      // Setup specific mock for this test - searching for anything in empty files should return no matches
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
          const onClose = mockProcess.on.mock.calls.find(
            (call) => call[0] === 'close',
          )?.[1];

          if (onClose) {
            onClose(1);
          }
        }, 0);

        return mockProcess as unknown as ChildProcess;
      });

      const params: RipGrepToolParams = { pattern: 'anything' };
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
                `${specialFileName}:1:hello world with special chars${EOL}`,
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
                `a/b/c/d/e/deep.txt:1:content in deep directory${EOL}`,
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
                `code.js:1:function getName() { return "test"; }${EOL}`,
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
                `case.txt:1:Hello World${EOL}case.txt:2:hello world${EOL}case.txt:3:HELLO WORLD${EOL}`,
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
            onData(Buffer.from(`special.txt:1:Price: $19.99${EOL}`));
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
                `test.ts:1:typescript content${EOL}test.tsx:1:tsx content${EOL}`,
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
            onData(Buffer.from(`src/main.ts:1:source code${EOL}`));
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

  describe('getDescription', () => {
    it('should generate correct description with pattern only', () => {
      const params: RipGrepToolParams = { pattern: 'testPattern' };
      const invocation = grepTool.build(params);
      expect(invocation.getDescription()).toBe("'testPattern'");
    });

    it('should generate correct description with pattern and include', () => {
      const params: RipGrepToolParams = {
        pattern: 'testPattern',
        include: '*.ts',
      };
      const invocation = grepTool.build(params);
      expect(invocation.getDescription()).toBe("'testPattern' in *.ts");
    });

    it('should generate correct description with pattern and path', async () => {
      const dirPath = path.join(tempRootDir, 'src', 'app');
      await fs.mkdir(dirPath, { recursive: true });
      const params: RipGrepToolParams = {
        pattern: 'testPattern',
        path: path.join('src', 'app'),
      };
      const invocation = grepTool.build(params);
      // The path will be relative to the tempRootDir, so we check for containment.
      expect(invocation.getDescription()).toContain("'testPattern' within");
      expect(invocation.getDescription()).toContain(path.join('src', 'app'));
    });

    it('should indicate searching across all workspace directories when no path specified', () => {
      // Create a mock config with multiple directories
      const multiDirConfig = {
        getTargetDir: () => tempRootDir,
        getWorkspaceContext: () =>
          createMockWorkspaceContext(tempRootDir, ['/another/dir']),
        getDebugMode: () => false,
      } as unknown as Config;

      const multiDirGrepTool = new RipGrepTool(multiDirConfig);
      const params: RipGrepToolParams = { pattern: 'testPattern' };
      const invocation = multiDirGrepTool.build(params);
      expect(invocation.getDescription()).toBe(
        "'testPattern' across all workspace directories",
      );
    });

    it('should generate correct description with pattern, include, and path', async () => {
      const dirPath = path.join(tempRootDir, 'src', 'app');
      await fs.mkdir(dirPath, { recursive: true });
      const params: RipGrepToolParams = {
        pattern: 'testPattern',
        include: '*.ts',
        path: path.join('src', 'app'),
      };
      const invocation = grepTool.build(params);
      expect(invocation.getDescription()).toContain(
        "'testPattern' in *.ts within",
      );
      expect(invocation.getDescription()).toContain(path.join('src', 'app'));
    });

    it('should use ./ for root path in description', () => {
      const params: RipGrepToolParams = { pattern: 'testPattern', path: '.' };
      const invocation = grepTool.build(params);
      expect(invocation.getDescription()).toBe("'testPattern' within ./");
    });
  });
});
