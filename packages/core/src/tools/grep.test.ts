/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GrepTool, GrepToolParams } from './grep.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { Config } from '../config/config.js';

// Mock the child_process module to control grep/git grep behavior
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    on: (event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'error' || event === 'close') {
        // Simulate command not found or error for git grep and system grep
        // to force fallback to JS implementation.
        setTimeout(() => cb(1), 0); // cb(1) for error/close
      }
    },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  })),
}));

describe('GrepTool', () => {
  let tempRootDir: string;
  let grepTool: GrepTool;
  const abortSignal = new AbortController().signal;

  const mockConfig = {
    getTargetDir: () => tempRootDir,
  } as unknown as Config;

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grep-tool-root-'));
    grepTool = new GrepTool(mockConfig);

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
      const params: GrepToolParams = { pattern: 'hello' };
      expect(grepTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid params (pattern and path)', () => {
      const params: GrepToolParams = { pattern: 'hello', path: '.' };
      expect(grepTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid params (pattern, path, and include)', () => {
      const params: GrepToolParams = {
        pattern: 'hello',
        path: '.',
        include: '*.txt',
      };
      expect(grepTool.validateToolParams(params)).toBeNull();
    });

    it('should return error if pattern is missing', () => {
      const params = { path: '.' } as unknown as GrepToolParams;
      expect(grepTool.validateToolParams(params)).toBe(
        `params must have required property 'pattern'`,
      );
    });

    it('should return error for invalid regex pattern', () => {
      const params: GrepToolParams = { pattern: '[[' };
      expect(grepTool.validateToolParams(params)).toContain(
        'Invalid regular expression pattern',
      );
    });

    it('should return error if path does not exist', () => {
      const params: GrepToolParams = { pattern: 'hello', path: 'nonexistent' };
      // Check for the core error message, as the full path might vary
      expect(grepTool.validateToolParams(params)).toContain(
        'Failed to access path stats for',
      );
      expect(grepTool.validateToolParams(params)).toContain('nonexistent');
    });

    it('should return error if path is a file, not a directory', async () => {
      const filePath = path.join(tempRootDir, 'fileA.txt');
      const params: GrepToolParams = { pattern: 'hello', path: filePath };
      expect(grepTool.validateToolParams(params)).toContain(
        `Path is not a directory: ${filePath}`,
      );
    });
  });

  describe('execute', () => {
    it('should find matches for a simple pattern in all files', async () => {
      const params: GrepToolParams = { pattern: 'world' };
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        'Found 3 matches for pattern "world" in path "."',
      );
      expect(result.llmContent).toContain('File: fileA.txt');
      expect(result.llmContent).toContain('L1: hello world');
      expect(result.llmContent).toContain('L2: second line with world');
      expect(result.llmContent).toContain('File: sub/fileC.txt');
      expect(result.llmContent).toContain('L1: another world in sub dir');
      expect(result.returnDisplay).toBe('Found 3 matches');
    });

    it('should find matches in a specific path', async () => {
      const params: GrepToolParams = { pattern: 'world', path: 'sub' };
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        'Found 1 match for pattern "world" in path "sub"',
      );
      expect(result.llmContent).toContain('File: fileC.txt'); // Path relative to 'sub'
      expect(result.llmContent).toContain('L1: another world in sub dir');
      expect(result.returnDisplay).toBe('Found 1 match');
    });

    it('should find matches with an include glob', async () => {
      const params: GrepToolParams = { pattern: 'hello', include: '*.js' };
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        'Found 1 match for pattern "hello" in path "." (filter: "*.js")',
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
      const params: GrepToolParams = {
        pattern: 'hello',
        path: 'sub',
        include: '*.js',
      };
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        'Found 1 match for pattern "hello" in path "sub" (filter: "*.js")',
      );
      expect(result.llmContent).toContain('File: another.js');
      expect(result.llmContent).toContain('L1: const greeting = "hello";');
      expect(result.returnDisplay).toBe('Found 1 match');
    });

    it('should return "No matches found" when pattern does not exist', async () => {
      const params: GrepToolParams = { pattern: 'nonexistentpattern' };
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        'No matches found for pattern "nonexistentpattern" in path "."',
      );
      expect(result.returnDisplay).toBe('No matches found');
    });

    it('should handle regex special characters correctly', async () => {
      const params: GrepToolParams = { pattern: 'foo.*bar' }; // Matches 'const foo = "bar";'
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        'Found 1 match for pattern "foo.*bar" in path "."',
      );
      expect(result.llmContent).toContain('File: fileB.js');
      expect(result.llmContent).toContain('L1: const foo = "bar";');
    });

    it('should be case-insensitive by default (JS fallback)', async () => {
      const params: GrepToolParams = { pattern: 'HELLO' };
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        'Found 2 matches for pattern "HELLO" in path "."',
      );
      expect(result.llmContent).toContain('File: fileA.txt');
      expect(result.llmContent).toContain('L1: hello world');
      expect(result.llmContent).toContain('File: fileB.js');
      expect(result.llmContent).toContain(
        'L2: function baz() { return "hello"; }',
      );
    });

    it('should return an error if params are invalid', async () => {
      const params = { path: '.' } as unknown as GrepToolParams; // Invalid: pattern missing
      const result = await grepTool.execute(params, abortSignal);
      expect(result.llmContent).toBe(
        "Error: Invalid parameters provided. Reason: params must have required property 'pattern'",
      );
      expect(result.returnDisplay).toBe(
        "Model provided invalid parameters. Error: params must have required property 'pattern'",
      );
    });
  });

  describe('getDescription', () => {
    it('should generate correct description with pattern only', () => {
      const params: GrepToolParams = { pattern: 'testPattern' };
      expect(grepTool.getDescription(params)).toBe("'testPattern'");
    });

    it('should generate correct description with pattern and include', () => {
      const params: GrepToolParams = {
        pattern: 'testPattern',
        include: '*.ts',
      };
      expect(grepTool.getDescription(params)).toBe("'testPattern' in *.ts");
    });

    it('should generate correct description with pattern and path', () => {
      const params: GrepToolParams = {
        pattern: 'testPattern',
        path: 'src/app',
      };
      // The path will be relative to the tempRootDir, so we check for containment.
      expect(grepTool.getDescription(params)).toContain("'testPattern' within");
      expect(grepTool.getDescription(params)).toContain(
        path.join('src', 'app'),
      );
    });

    it('should generate correct description with pattern, include, and path', () => {
      const params: GrepToolParams = {
        pattern: 'testPattern',
        include: '*.ts',
        path: 'src/app',
      };
      expect(grepTool.getDescription(params)).toContain(
        "'testPattern' in *.ts within",
      );
      expect(grepTool.getDescription(params)).toContain('src/app');
    });

    it('should use ./ for root path in description', () => {
      const params: GrepToolParams = { pattern: 'testPattern', path: '.' };
      expect(grepTool.getDescription(params)).toBe("'testPattern' within ./");
    });
  });
});
