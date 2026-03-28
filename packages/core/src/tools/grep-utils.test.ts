/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  groupMatchesByFile,
  readFileLines,
  enrichWithAutoContext,
  formatGrepResults,
  type GrepMatch,
} from './grep-utils.js';

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}));

import fsPromises from 'node:fs/promises';

describe('groupMatchesByFile', () => {
  it('groups matches by file path and sorts by line number', () => {
    const matches: GrepMatch[] = [
      {
        filePath: 'a.ts',
        absolutePath: '/a.ts',
        lineNumber: 10,
        line: 'line10',
      },
      {
        filePath: 'b.ts',
        absolutePath: '/b.ts',
        lineNumber: 1,
        line: 'line1',
      },
      {
        filePath: 'a.ts',
        absolutePath: '/a.ts',
        lineNumber: 2,
        line: 'line2',
      },
    ];

    const result = groupMatchesByFile(matches);

    expect(Object.keys(result)).toEqual(['a.ts', 'b.ts']);
    expect(result['a.ts'].map((m) => m.lineNumber)).toEqual([2, 10]);
    expect(result['b.ts']).toHaveLength(1);
  });

  it('returns empty object for empty input', () => {
    expect(groupMatchesByFile([])).toEqual({});
  });
});

describe('readFileLines', () => {
  beforeEach(() => {
    vi.mocked(fsPromises.readFile).mockReset();
  });

  it('reads file and splits into lines', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue('line1\nline2\nline3');
    const lines = await readFileLines('/test.txt');
    expect(lines).toEqual(['line1', 'line2', 'line3']);
  });

  it('handles Windows-style line endings', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue('a\r\nb\r\nc');
    const lines = await readFileLines('/test.txt');
    expect(lines).toEqual(['a', 'b', 'c']);
  });

  it('returns null when the file cannot be read', async () => {
    vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));
    const lines = await readFileLines('/missing.txt');
    expect(lines).toBeNull();
  });
});

describe('enrichWithAutoContext', () => {
  beforeEach(() => {
    vi.mocked(fsPromises.readFile).mockReset();
  });

  it('adds surrounding context lines for a single match', async () => {
    const fileLines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
    vi.mocked(fsPromises.readFile).mockResolvedValue(fileLines.join('\n'));

    const matchesByFile: Record<string, GrepMatch[]> = {
      'test.ts': [
        {
          filePath: 'test.ts',
          absolutePath: '/test.ts',
          lineNumber: 50,
          line: 'line 50',
        },
      ],
    };

    await enrichWithAutoContext(matchesByFile, 1, {});

    // Single match uses 50 context lines. Should have lines roughly 1-100.
    const result = matchesByFile['test.ts'];
    expect(result.length).toBeGreaterThan(1);
    // The original match line should not be marked as context
    const matchLine = result.find((m) => m.lineNumber === 50);
    expect(matchLine?.isContext).toBe(false);
    // Other lines should be marked as context
    const contextLine = result.find((m) => m.lineNumber === 40);
    expect(contextLine?.isContext).toBe(true);
  });

  it('skips enrichment when match count exceeds 3', async () => {
    const matchesByFile: Record<string, GrepMatch[]> = {
      'test.ts': [
        {
          filePath: 'test.ts',
          absolutePath: '/test.ts',
          lineNumber: 1,
          line: 'a',
        },
      ],
    };
    const original = [...matchesByFile['test.ts']];

    await enrichWithAutoContext(matchesByFile, 4, {});

    expect(matchesByFile['test.ts']).toEqual(original);
  });

  it('skips enrichment when names_only is true', async () => {
    const matchesByFile: Record<string, GrepMatch[]> = {
      'test.ts': [
        {
          filePath: 'test.ts',
          absolutePath: '/test.ts',
          lineNumber: 1,
          line: 'a',
        },
      ],
    };
    const original = [...matchesByFile['test.ts']];

    await enrichWithAutoContext(matchesByFile, 1, { names_only: true });

    expect(matchesByFile['test.ts']).toEqual(original);
  });

  it('skips enrichment when explicit context params are provided', async () => {
    const matchesByFile: Record<string, GrepMatch[]> = {
      'test.ts': [
        {
          filePath: 'test.ts',
          absolutePath: '/test.ts',
          lineNumber: 1,
          line: 'a',
        },
      ],
    };
    const original = [...matchesByFile['test.ts']];

    await enrichWithAutoContext(matchesByFile, 1, { context: 5 });

    expect(matchesByFile['test.ts']).toEqual(original);
  });
});

describe('formatGrepResults', () => {
  it('returns "No matches found" message for empty results', async () => {
    const result = await formatGrepResults(
      [],
      { pattern: 'foo' },
      'in the workspace',
      100,
    );

    expect(result.llmContent).toContain('No matches found for pattern "foo"');
    expect(result.returnDisplay).toBe('No matches found');
  });

  it('formats results with file paths and line numbers', async () => {
    // Mock readFileLines for enrichWithAutoContext (4+ matches skips enrichment)
    const matches: GrepMatch[] = [
      {
        filePath: 'a.ts',
        absolutePath: '/a.ts',
        lineNumber: 1,
        line: 'hello',
      },
      {
        filePath: 'a.ts',
        absolutePath: '/a.ts',
        lineNumber: 5,
        line: 'hello again',
      },
      {
        filePath: 'b.ts',
        absolutePath: '/b.ts',
        lineNumber: 3,
        line: 'hello there',
      },
      {
        filePath: 'c.ts',
        absolutePath: '/c.ts',
        lineNumber: 7,
        line: 'hello world',
      },
    ];

    const result = await formatGrepResults(
      matches,
      { pattern: 'hello' },
      'in the workspace',
      100,
    );

    expect(result.llmContent).toContain('Found 4 matches');
    expect(result.llmContent).toContain('File: a.ts');
    expect(result.llmContent).toContain('L1: hello');
    expect(result.llmContent).toContain('File: b.ts');
    expect(result.returnDisplay).toBe('Found 4 matches');
  });

  it('returns only file paths when names_only is true', async () => {
    const matches: GrepMatch[] = [
      {
        filePath: 'a.ts',
        absolutePath: '/a.ts',
        lineNumber: 1,
        line: 'hello',
      },
    ];

    const result = await formatGrepResults(
      matches,
      { pattern: 'hello', names_only: true },
      'in the workspace',
      100,
    );

    expect(result.llmContent).toContain('Found 1 files with matches');
    expect(result.llmContent).toContain('a.ts');
    expect(result.llmContent).not.toContain('L1:');
  });

  it('indicates truncation when results hit the max limit', async () => {
    const matches: GrepMatch[] = Array.from({ length: 5 }, (_, i) => ({
      filePath: 'file.ts',
      absolutePath: '/file.ts',
      lineNumber: i + 1,
      line: `match ${i}`,
    }));

    const result = await formatGrepResults(
      matches,
      { pattern: 'match' },
      'in the workspace',
      5,
    );

    expect(result.llmContent).toContain('results limited to 5 matches');
    expect(result.returnDisplay).toContain('(limited)');
  });

  it('includes filter info in output when include_pattern is set', async () => {
    const matches: GrepMatch[] = Array.from({ length: 4 }, (_, i) => ({
      filePath: 'file.ts',
      absolutePath: '/file.ts',
      lineNumber: i + 1,
      line: `match ${i}`,
    }));

    const result = await formatGrepResults(
      matches,
      { pattern: 'match', include_pattern: '*.ts' },
      'in the workspace',
      100,
    );

    expect(result.llmContent).toContain('(filter: "*.ts")');
  });

  it('uses singular "match" for a single result', async () => {
    const matches: GrepMatch[] = [
      {
        filePath: 'a.ts',
        absolutePath: '/a.ts',
        lineNumber: 1,
        line: 'hello',
      },
    ];

    // Mock readFileLines for auto-context enrichment (1 match triggers it)
    vi.mocked(fsPromises.readFile).mockResolvedValue('hello');

    const result = await formatGrepResults(
      matches,
      { pattern: 'hello' },
      'in the workspace',
      100,
    );

    expect(result.llmContent).toContain('Found 1 match ');
    expect(result.returnDisplay).toBe('Found 1 match');
  });
});
