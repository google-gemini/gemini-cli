/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BM25SearchTool, BM25SearchToolParams } from './bm25-search.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { Config } from '../config/config.js';
import { createMockWorkspaceContext } from '../test-utils/mockWorkspaceContext.js';

// Mock the okapibm25 library
vi.mock('okapibm25', () => ({
  default: vi.fn((docs: string[], query: string[]) => {
    const scores = new Array(docs.length).fill(0);
    const queryString = query.join(' ');
    docs.forEach((doc, i) => {
      if (doc.includes(queryString)) {
        scores[i] = 1; // Assign a mock score
      }
    });
    return scores;
  }),
}));

describe('BM25SearchTool', () => {
  let tempRootDir: string;
  let bm25SearchTool: BM25SearchTool;
  const abortSignal = new AbortController().signal;

  const mockConfig = {
    getTargetDir: () => tempRootDir,
    getWorkspaceContext: () => createMockWorkspaceContext(tempRootDir),
  } as unknown as Config;

  beforeEach(async () => {
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bm25-search-root-'));
    bm25SearchTool = new BM25SearchTool(mockConfig);

    // Create some test files and directories
    await fs.writeFile(
      path.join(tempRootDir, 'fileA.txt'),
      'the quick brown fox\njumps over the lazy dog',
    );
    await fs.writeFile(
      path.join(tempRootDir, 'fileB.js'),
      'const foo = "bar";\nfunction baz() { return "the quick brown fox"; }',
    );
    await fs.mkdir(path.join(tempRootDir, 'sub'));
    await fs.writeFile(
      path.join(tempRootDir, 'sub', 'fileC.txt'),
      'the lazy dog is brown',
    );
  });

  afterEach(async () => {
    await fs.rm(tempRootDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('validateToolParams', () => {
    it('should return null for valid params (query only)', () => {
      const params: BM25SearchToolParams = { query: 'hello' };
      expect(bm25SearchTool.validateToolParams(params)).toBeNull();
    });

    it('should return error if query is missing', () => {
      const params = { path: '.' } as unknown as BM25SearchToolParams;
      expect(bm25SearchTool.validateToolParams(params)).toBe(
        `params must have required property 'query'`,
      );
    });

    it('should return error if path does not exist', () => {
      const params: BM25SearchToolParams = {
        query: 'hello',
        path: 'nonexistent',
      };
      expect(bm25SearchTool.validateToolParams(params)).toContain(
        'Failed to access path stats for',
      );
    });

    it('should return error if path is a file, not a directory', async () => {
      const params: BM25SearchToolParams = {
        query: 'hello',
        path: 'fileA.txt',
      };
      expect(bm25SearchTool.validateToolParams(params)).toContain(
        'Path is not a directory',
      );
    });

    it('should return error for non-numeric chunk_size', () => {
      const params = {
        query: 'q',
        chunk_size: 'abc',
      } as unknown as BM25SearchToolParams;
      expect(bm25SearchTool.validateToolParams(params)).toBe(
        'params/chunk_size must be number',
      );
    });

    it('should return error for non-numeric overlap', () => {
      const params = {
        query: 'q',
        overlap: 'abc',
      } as unknown as BM25SearchToolParams;
      expect(bm25SearchTool.validateToolParams(params)).toBe(
        'params/overlap must be number',
      );
    });
  });

  describe('execute', () => {
    it('should find matches for a simple query in all files', async () => {
      const params: BM25SearchToolParams = { query: 'fox' };
      const result = await bm25SearchTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 2 matches for query "fox"');
      expect(result.llmContent).toContain('File: fileA.txt');
      expect(result.llmContent).toContain('File: fileB.js');
      expect(result.returnDisplay).toBe('Found 2 matches');
    });

    it('should find matches in a specific path', async () => {
      const params: BM25SearchToolParams = { query: 'lazy dog', path: 'sub' };
      const result = await bm25SearchTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 1 match for query "lazy dog"');
      expect(result.llmContent).toContain('File: fileC.txt');
      expect(result.returnDisplay).toBe('Found 1 match');
    });

    it('should find matches with an include glob', async () => {
      const params: BM25SearchToolParams = {
        query: 'quick brown',
        include: '*.js',
      };
      const result = await bm25SearchTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        'Found 1 match for query "quick brown"',
      );
      expect(result.llmContent).toContain('File: fileB.js');
      expect(result.returnDisplay).toBe('Found 1 match');
    });

    it('should return "No matches found" when query does not exist', async () => {
      const params: BM25SearchToolParams = { query: 'nonexistentpattern' };
      const result = await bm25SearchTool.execute(params, abortSignal);
      expect(result.llmContent).toContain(
        'No matches found for query "nonexistentpattern"',
      );
      expect(result.returnDisplay).toBe('No matches found');
    });

    it('should return "No files found" when include glob matches nothing', async () => {
      const params: BM25SearchToolParams = {
        query: 'any',
        include: '*.nonexistent',
      };
      const result = await bm25SearchTool.execute(params, abortSignal);
      expect(result.llmContent).toContain('No files found to search');
      expect(result.returnDisplay).toBe('No files found');
    });
  });

  describe('chunking logic', () => {
    it('should correctly chunk files with overlap', async () => {
      const longFileContent = Array.from(
        { length: 20 },
        (_, i) => `line ${i + 1}`,
      ).join('\n');
      await fs.writeFile(
        path.join(tempRootDir, 'longfile.txt'),
        longFileContent,
      );

      const tool = new BM25SearchTool(mockConfig);
      const params: BM25SearchToolParams = {
        query: 'line 15',
        chunk_size: 10,
        overlap: 5,
      };
      const result = await tool.execute(params, abortSignal);

      const searchResult = result.llmContent;
      // The query "line 15" should be in the second chunk.
      // Chunk 1: lines 1-10
      // Chunk 2: lines 6-15
      // Chunk 3: lines 11-20
      expect(searchResult).toContain('File: longfile.txt (Lines 11-20)');
    });

    it('should handle a file smaller than the chunk size', async () => {
      const shortFileContent = 'line 1\nline 2\nline 3';
      await fs.writeFile(
        path.join(tempRootDir, 'shortfile.txt'),
        shortFileContent,
      );
      const tool = new BM25SearchTool(mockConfig);
      const params: BM25SearchToolParams = {
        query: 'line 2',
        chunk_size: 10,
        overlap: 2,
      };
      const result = await tool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 1 match');
      expect(result.llmContent).toContain('File: shortfile.txt (Lines 1-3)');
    });

    it('should handle an empty file', async () => {
      await fs.writeFile(path.join(tempRootDir, 'emptyfile.txt'), '');
      const tool = new BM25SearchTool(mockConfig);
      const params: BM25SearchToolParams = { query: 'any' };
      const result = await tool.execute(params, abortSignal);
      // Should not error and just not include the empty file in results.
      expect(result.llmContent).not.toContain('emptyfile.txt');
    });

    it('should create a final chunk smaller than chunk_size if necessary', async () => {
      // 12 lines, chunk size 10, overlap 5.
      // Chunk 1: lines 1-10.
      // Chunk 2: lines 6-12.
      const content = Array.from(
        { length: 12 },
        (_, i) => `line ${i + 1}`,
      ).join('\n');
      await fs.writeFile(path.join(tempRootDir, 'midfile.txt'), content);
      const tool = new BM25SearchTool(mockConfig);
      const params: BM25SearchToolParams = {
        query: 'line 11',
        chunk_size: 10,
        overlap: 5,
      };
      const result = await tool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Found 1 match');
      expect(result.llmContent).toContain('File: midfile.txt (Lines 6-12)');
    });
  });

  describe('getDescription', () => {
    it('should generate correct description with pattern only', () => {
      const params: BM25SearchToolParams = { query: 'testPattern' };
      expect(bm25SearchTool.getDescription(params)).toBe("'testPattern'");
    });

    it('should generate correct description with pattern and include', () => {
      const params: BM25SearchToolParams = {
        query: 'testPattern',
        include: '*.ts',
      };
      expect(bm25SearchTool.getDescription(params)).toBe(
        "'testPattern' in *.ts",
      );
    });

    it('should generate correct description with pattern and path', () => {
      const params: BM25SearchToolParams = {
        query: 'testPattern',
        path: path.join('src', 'app'),
      };
      expect(bm25SearchTool.getDescription(params)).toContain(
        "'testPattern' within",
      );
      expect(bm25SearchTool.getDescription(params)).toContain(
        path.join('src', 'app'),
      );
    });

    it('should indicate searching across all workspace directories when no path specified', () => {
      const multiDirConfig = {
        getTargetDir: () => tempRootDir,
        getWorkspaceContext: () =>
          createMockWorkspaceContext(tempRootDir, ['/another/dir']),
      } as unknown as Config;

      const multiDirTool = new BM25SearchTool(multiDirConfig);
      const params: BM25SearchToolParams = { query: 'testPattern' };
      expect(multiDirTool.getDescription(params)).toBe(
        "'testPattern' across all workspace directories",
      );
    });

    it('should use ./ for root path in description', () => {
      const params: BM25SearchToolParams = { query: 'testPattern', path: '.' };
      expect(bm25SearchTool.getDescription(params)).toBe(
        "'testPattern' within ./",
      );
    });
  });
});
