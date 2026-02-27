/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GrepMatch } from './grep-utils.js';
import {
  groupMatchesByFile,
  readFileLines,
  enrichWithAutoContext,
  formatGrepResults,
} from './grep-utils.js';
import fsPromises from 'node:fs/promises';

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}));

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    warn: vi.fn(),
    log: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function makeMatch(
  filePath: string,
  lineNumber: number,
  line: string,
  opts?: { absolutePath?: string; isContext?: boolean },
): GrepMatch {
  return {
    filePath,
    absolutePath: opts?.absolutePath ?? `/abs/${filePath}`,
    lineNumber,
    line,
    ...(opts?.isContext !== undefined ? { isContext: opts.isContext } : {}),
  };
}

function makeFileContent(lineCount: number): string {
  return Array.from({ length: lineCount }, (_, i) => `Line ${i + 1}`).join(
    '\n',
  );
}

describe('groupMatchesByFile', () => {
  it('should group matches from multiple files and sort each group by line number', () => {
    const matches = [
      makeMatch('b.ts', 10, 'later'),
      makeMatch('a.ts', 20, 'second'),
      makeMatch('a.ts', 5, 'first'),
      makeMatch('b.ts', 3, 'earlier'),
    ];
    const result = groupMatchesByFile(matches);

    expect(Object.keys(result)).toEqual(['b.ts', 'a.ts']);
    expect(result['a.ts'].map((m) => m.lineNumber)).toEqual([5, 20]);
    expect(result['b.ts'].map((m) => m.lineNumber)).toEqual([3, 10]);
  });

  it('should return empty object for empty input', () => {
    expect(groupMatchesByFile([])).toEqual({});
  });
});

describe('readFileLines', () => {
  beforeEach(() => {
    vi.mocked(fsPromises.readFile).mockReset();
  });

  it('should split content on both LF and CRLF line endings', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue('unix\nline\r\nwindows');
    const result = await readFileLines('/test/file.ts');
    expect(result).toEqual(['unix', 'line', 'windows']);
    expect(fsPromises.readFile).toHaveBeenCalledWith('/test/file.ts', 'utf8');
  });

  it('should return null and log a warning when the file cannot be read', async () => {
    vi.mocked(fsPromises.readFile).mockRejectedValue(
      new Error('ENOENT: no such file'),
    );
    const result = await readFileLines('/missing/file.ts');
    expect(result).toBeNull();
  });
});

describe('enrichWithAutoContext', () => {
  beforeEach(() => {
    vi.mocked(fsPromises.readFile).mockReset();
  });

  it('should use 50-line context window for a single match', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(makeFileContent(120));
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [makeMatch('a.ts', 60, 'Line 60')],
    };
    await enrichWithAutoContext(groups, 1, {});

    const lines = groups['a.ts'];
    // Should span from line 10 (60-50) to line 110 (60+50), so 101 lines
    expect(lines[0].lineNumber).toBe(10);
    expect(lines[lines.length - 1].lineNumber).toBe(110);
    expect(lines.length).toBe(101);

    const matchLine = lines.find((m) => m.lineNumber === 60);
    expect(matchLine?.isContext).toBe(false);
    expect(lines.find((m) => m.lineNumber === 59)?.isContext).toBe(true);
  });

  it('should use 15-line context window for 2-3 matches', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(makeFileContent(100));
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [
        makeMatch('a.ts', 20, 'Line 20'),
        makeMatch('a.ts', 80, 'Line 80'),
      ],
    };
    await enrichWithAutoContext(groups, 2, {});

    const lines = groups['a.ts'];
    // Two separate windows: 5-35 and 65-95, no overlap
    expect(lines.find((m) => m.lineNumber === 50)).toBeUndefined();
    expect(lines.find((m) => m.lineNumber === 20)?.isContext).toBe(false);
    expect(lines.find((m) => m.lineNumber === 80)?.isContext).toBe(false);
  });

  it('should deduplicate and correctly mark lines when context windows overlap', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(makeFileContent(50));
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [
        makeMatch('a.ts', 20, 'Line 20'),
        makeMatch('a.ts', 25, 'Line 25'),
      ],
    };
    await enrichWithAutoContext(groups, 2, {});

    const lines = groups['a.ts'];
    // No duplicate line numbers
    const lineNumbers = lines.map((m) => m.lineNumber);
    expect(new Set(lineNumbers).size).toBe(lineNumbers.length);

    // Both match lines should be marked as non-context even though
    // line 25 falls in line 20's context window first
    expect(lines.find((m) => m.lineNumber === 20)?.isContext).toBe(false);
    expect(lines.find((m) => m.lineNumber === 25)?.isContext).toBe(false);
  });

  it('should clamp context to file boundaries for matches near start/end', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(makeFileContent(10));
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [makeMatch('a.ts', 2, 'Line 2')],
    };
    await enrichWithAutoContext(groups, 1, {});

    const lines = groups['a.ts'];
    expect(lines[0].lineNumber).toBe(1);
    expect(lines[lines.length - 1].lineNumber).toBe(10);
  });

  it('should not enrich when matchCount is outside 1-3 range', async () => {
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [makeMatch('a.ts', 1, 'l1')],
    };
    await enrichWithAutoContext(groups, 0, {});
    await enrichWithAutoContext(groups, 4, {});
    expect(fsPromises.readFile).not.toHaveBeenCalled();
  });

  it('should not enrich when user explicitly requested context params', async () => {
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [makeMatch('a.ts', 1, 'line')],
    };

    await enrichWithAutoContext(groups, 1, { names_only: true });
    await enrichWithAutoContext(groups, 1, { context: 5 });
    await enrichWithAutoContext(groups, 1, { before: 3 });
    await enrichWithAutoContext(groups, 1, { after: 3 });
    expect(fsPromises.readFile).not.toHaveBeenCalled();
  });

  it('should leave groups unchanged when file read fails', async () => {
    vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));
    const original = [makeMatch('a.ts', 5, 'line5')];
    const groups: Record<string, GrepMatch[]> = { 'a.ts': [...original] };
    await enrichWithAutoContext(groups, 1, {});
    expect(groups['a.ts']).toEqual(original);
  });
});

describe('formatGrepResults', () => {
  beforeEach(() => {
    vi.mocked(fsPromises.readFile).mockReset();
  });

  it('should return a descriptive no-match message with optional filter', async () => {
    const result = await formatGrepResults(
      [],
      { pattern: 'foo', include_pattern: '*.ts' },
      'in workspace',
      100,
    );
    expect(result.llmContent).toBe(
      'No matches found for pattern "foo" in workspace (filter: "*.ts").',
    );
    expect(result.returnDisplay).toBe('No matches found');
  });

  it('should format multi-file results with headers, line numbers, and correct separators', async () => {
    const matches = [
      makeMatch('src/a.ts', 10, 'match line'),
      makeMatch('src/a.ts', 11, 'nearby context', { isContext: true }),
      makeMatch('src/b.ts', 5, 'another match'),
      makeMatch('src/b.ts', 6, 'more here'),
      makeMatch('src/b.ts', 7, 'and more'),
    ];
    // 4 non-context matches -> skips auto-context
    const result = await formatGrepResults(
      matches,
      { pattern: 'test', include_pattern: '*.ts' },
      'in workspace',
      100,
    );

    expect(result.llmContent).toContain(
      'Found 4 matches for pattern "test" in workspace (filter: "*.ts")',
    );
    expect(result.llmContent).toContain('File: src/a.ts');
    expect(result.llmContent).toContain('L10: match line');
    expect(result.llmContent).toContain('L11- nearby context');
    expect(result.llmContent).toContain('File: src/b.ts');
    expect(result.returnDisplay).toBe('Found 4 matches');
  });

  it('should use singular "match" and trigger auto-context for single result', async () => {
    vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));
    const matches = [makeMatch('a.ts', 1, 'only hit')];
    const result = await formatGrepResults(
      matches,
      { pattern: 'hit' },
      'in workspace',
      100,
    );
    expect(result.llmContent).toContain('Found 1 match');
    expect(result.returnDisplay).toBe('Found 1 match');
    // readFile was called because auto-context triggered (matchCount=1)
    expect(fsPromises.readFile).toHaveBeenCalled();
  });

  it('should indicate truncation when matchCount reaches totalMaxMatches', async () => {
    const matches = Array.from({ length: 5 }, (_, i) =>
      makeMatch('a.ts', i + 1, `hit${i + 1}`),
    );
    const result = await formatGrepResults(
      matches,
      { pattern: 'hit' },
      'in workspace',
      5,
    );
    expect(result.llmContent).toContain(
      'results limited to 5 matches for performance',
    );
    expect(result.returnDisplay).toBe('Found 5 matches (limited)');
  });

  it('should return only sorted file paths in names_only mode', async () => {
    const matches = [
      makeMatch('z.ts', 1, 'hit'),
      makeMatch('a.ts', 1, 'hit'),
      makeMatch('m.ts', 1, 'hit'),
      makeMatch('a.ts', 5, 'hit2'),
    ];
    const result = await formatGrepResults(
      matches,
      { pattern: 'hit', names_only: true },
      'in workspace',
      100,
    );
    expect(result.llmContent).toContain('Found 3 files');
    const fileList = result.llmContent.split('\n').slice(1);
    expect(fileList).toEqual(['a.ts', 'm.ts', 'z.ts']);
    expect(result.returnDisplay).toBe('Found 3 files');
  });

  it('should exclude context-flagged lines from the match count', async () => {
    const matches = [
      makeMatch('a.ts', 1, 'real'),
      makeMatch('a.ts', 2, 'ctx', { isContext: true }),
      makeMatch('a.ts', 3, 'ctx', { isContext: true }),
      makeMatch('a.ts', 4, 'real'),
      makeMatch('a.ts', 5, 'real'),
      makeMatch('a.ts', 6, 'real'),
    ];
    const result = await formatGrepResults(
      matches,
      { pattern: 'real' },
      'in workspace',
      100,
    );
    expect(result.llmContent).toContain('Found 4 matches');
  });
});
