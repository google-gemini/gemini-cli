/**
 * @license
 * Copyright 2025 Google LLC
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

/** Helper to create a GrepMatch with sensible defaults. */
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

/** Helper: generate file content with numbered lines. */
function makeFileContent(lineCount: number): string {
  return Array.from({ length: lineCount }, (_, i) => `Line ${i + 1}`).join(
    '\n',
  );
}

describe('groupMatchesByFile', () => {
  it('should return empty object for empty input', () => {
    expect(groupMatchesByFile([])).toEqual({});
  });

  it('should group matches by file path', () => {
    const matches = [
      makeMatch('a.ts', 1, 'line1'),
      makeMatch('b.ts', 5, 'line5'),
      makeMatch('a.ts', 3, 'line3'),
    ];
    const result = groupMatchesByFile(matches);
    expect(Object.keys(result)).toEqual(['a.ts', 'b.ts']);
    expect(result['a.ts']).toHaveLength(2);
    expect(result['b.ts']).toHaveLength(1);
  });

  it('should sort matches within each group by line number', () => {
    const matches = [
      makeMatch('a.ts', 10, 'line10'),
      makeMatch('a.ts', 2, 'line2'),
      makeMatch('a.ts', 7, 'line7'),
    ];
    const result = groupMatchesByFile(matches);
    expect(result['a.ts'].map((m) => m.lineNumber)).toEqual([2, 7, 10]);
  });

  it('should handle a single match', () => {
    const matches = [makeMatch('only.ts', 42, 'the answer')];
    const result = groupMatchesByFile(matches);
    expect(result['only.ts']).toHaveLength(1);
    expect(result['only.ts'][0].lineNumber).toBe(42);
  });
});

describe('readFileLines', () => {
  beforeEach(() => {
    vi.mocked(fsPromises.readFile).mockReset();
  });

  it('should split file content into lines', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue('line1\nline2\nline3');
    const result = await readFileLines('/some/file.ts');
    expect(result).toEqual(['line1', 'line2', 'line3']);
    expect(fsPromises.readFile).toHaveBeenCalledWith('/some/file.ts', 'utf8');
  });

  it('should handle Windows-style line endings', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue('a\r\nb\r\nc');
    const result = await readFileLines('/win/file.ts');
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('should return null when file cannot be read', async () => {
    vi.mocked(fsPromises.readFile).mockRejectedValue(
      new Error('ENOENT: no such file'),
    );
    const result = await readFileLines('/missing/file.ts');
    expect(result).toBeNull();
  });

  it('should handle empty file content', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue('');
    const result = await readFileLines('/empty/file.ts');
    expect(result).toEqual(['']);
  });
});

describe('enrichWithAutoContext', () => {
  beforeEach(() => {
    vi.mocked(fsPromises.readFile).mockReset();
  });

  it('should add 50 context lines for a single match', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(makeFileContent(100));
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [makeMatch('a.ts', 60, 'Line 60')],
    };
    await enrichWithAutoContext(groups, 1, {});
    const lines = groups['a.ts'];
    expect(lines.length).toBeGreaterThan(1);
    // The match line should not be marked as context
    const matchLine = lines.find((m) => m.lineNumber === 60);
    expect(matchLine?.isContext).toBe(false);
    // Surrounding lines should be marked as context
    const contextLine = lines.find((m) => m.lineNumber === 50);
    expect(contextLine?.isContext).toBe(true);
  });

  it('should add 15 context lines for 2-3 matches', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(makeFileContent(100));
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [
        makeMatch('a.ts', 30, 'Line 30'),
        makeMatch('a.ts', 70, 'Line 70'),
      ],
    };
    await enrichWithAutoContext(groups, 2, {});
    const lines = groups['a.ts'];
    expect(lines.length).toBeGreaterThan(2);
    // Line 50 should NOT be present (gap between the two 15-line context windows)
    const line50 = lines.find((m) => m.lineNumber === 50);
    expect(line50).toBeUndefined();
  });

  it('should skip enrichment when matchCount is 0', async () => {
    const groups: Record<string, GrepMatch[]> = { 'a.ts': [] };
    await enrichWithAutoContext(groups, 0, {});
    expect(fsPromises.readFile).not.toHaveBeenCalled();
  });

  it('should skip enrichment when matchCount exceeds 3', async () => {
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [
        makeMatch('a.ts', 1, 'l1'),
        makeMatch('a.ts', 2, 'l2'),
        makeMatch('a.ts', 3, 'l3'),
        makeMatch('a.ts', 4, 'l4'),
      ],
    };
    await enrichWithAutoContext(groups, 4, {});
    expect(fsPromises.readFile).not.toHaveBeenCalled();
  });

  it('should skip enrichment when names_only is true', async () => {
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [makeMatch('a.ts', 1, 'line')],
    };
    await enrichWithAutoContext(groups, 1, { names_only: true });
    expect(fsPromises.readFile).not.toHaveBeenCalled();
  });

  it('should skip enrichment when explicit context param is provided', async () => {
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [makeMatch('a.ts', 1, 'line')],
    };
    await enrichWithAutoContext(groups, 1, { context: 5 });
    expect(fsPromises.readFile).not.toHaveBeenCalled();
  });

  it('should skip enrichment when before param is provided', async () => {
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [makeMatch('a.ts', 1, 'line')],
    };
    await enrichWithAutoContext(groups, 1, { before: 3 });
    expect(fsPromises.readFile).not.toHaveBeenCalled();
  });

  it('should skip enrichment when after param is provided', async () => {
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [makeMatch('a.ts', 1, 'line')],
    };
    await enrichWithAutoContext(groups, 1, { after: 3 });
    expect(fsPromises.readFile).not.toHaveBeenCalled();
  });

  it('should handle file read failure gracefully', async () => {
    vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));
    const original = [makeMatch('a.ts', 5, 'line5')];
    const groups: Record<string, GrepMatch[]> = { 'a.ts': [...original] };
    await enrichWithAutoContext(groups, 1, {});
    // readFileLines returns null on error, so the group stays unchanged
    expect(groups['a.ts']).toEqual(original);
  });

  it('should clamp context to file boundaries', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(makeFileContent(10));
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [makeMatch('a.ts', 1, 'Line 1')],
    };
    await enrichWithAutoContext(groups, 1, {});
    const lines = groups['a.ts'];
    for (const line of lines) {
      expect(line.lineNumber).toBeGreaterThanOrEqual(1);
      expect(line.lineNumber).toBeLessThanOrEqual(10);
    }
  });

  it('should deduplicate overlapping context between close matches', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(makeFileContent(50));
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [
        makeMatch('a.ts', 20, 'Line 20'),
        makeMatch('a.ts', 22, 'Line 22'),
      ],
    };
    await enrichWithAutoContext(groups, 2, {});
    const lines = groups['a.ts'];
    const lineNumbers = lines.map((m) => m.lineNumber);
    expect(new Set(lineNumbers).size).toBe(lineNumbers.length);
  });

  it('should mark overlapping context line as non-context when it is a match', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(makeFileContent(50));
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [
        makeMatch('a.ts', 20, 'Line 20'),
        makeMatch('a.ts', 25, 'Line 25'),
      ],
    };
    await enrichWithAutoContext(groups, 2, {});
    const lines = groups['a.ts'];
    const matchAt20 = lines.find((m) => m.lineNumber === 20);
    const matchAt25 = lines.find((m) => m.lineNumber === 25);
    expect(matchAt20?.isContext).toBe(false);
    expect(matchAt25?.isContext).toBe(false);
  });

  it('should skip empty file groups', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(makeFileContent(10));
    const groups: Record<string, GrepMatch[]> = {
      'empty.ts': [],
      'a.ts': [makeMatch('a.ts', 1, 'Line 1')],
    };
    await enrichWithAutoContext(groups, 1, {});
    expect(groups['empty.ts']).toEqual([]);
  });

  it('should sort enriched results by line number', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(makeFileContent(30));
    const groups: Record<string, GrepMatch[]> = {
      'a.ts': [makeMatch('a.ts', 15, 'Line 15')],
    };
    await enrichWithAutoContext(groups, 1, {});
    const lineNumbers = groups['a.ts'].map((m) => m.lineNumber);
    const sorted = [...lineNumbers].sort((a, b) => a - b);
    expect(lineNumbers).toEqual(sorted);
  });
});

describe('formatGrepResults', () => {
  beforeEach(() => {
    vi.mocked(fsPromises.readFile).mockReset();
  });

  it('should return no-match message for empty results', async () => {
    const result = await formatGrepResults(
      [],
      { pattern: 'foo' },
      'in workspace',
      100,
    );
    expect(result.llmContent).toBe(
      'No matches found for pattern "foo" in workspace.',
    );
    expect(result.returnDisplay).toBe('No matches found');
  });

  it('should include filter in no-match message when include_pattern provided', async () => {
    const result = await formatGrepResults(
      [],
      { pattern: 'foo', include_pattern: '*.ts' },
      'in workspace',
      100,
    );
    expect(result.llmContent).toContain('(filter: "*.ts")');
  });

  it('should format matches with file headers and line numbers', async () => {
    // Use 4+ matches to skip auto-context enrichment
    const matches = [
      makeMatch('a.ts', 1, 'hit1'),
      makeMatch('a.ts', 5, 'hit2'),
      makeMatch('b.ts', 3, 'hit3'),
      makeMatch('b.ts', 7, 'hit4'),
    ];
    const result = await formatGrepResults(
      matches,
      { pattern: 'hit' },
      'in workspace',
      100,
    );
    expect(result.llmContent).toContain(
      'Found 4 matches for pattern "hit" in workspace',
    );
    expect(result.llmContent).toContain('File: a.ts');
    expect(result.llmContent).toContain('L1: hit1');
    expect(result.llmContent).toContain('L5: hit2');
    expect(result.llmContent).toContain('File: b.ts');
    expect(result.llmContent).toContain('L3: hit3');
    expect(result.returnDisplay).toBe('Found 4 matches');
  });

  it('should use singular "match" for single result', async () => {
    // matchCount=1 triggers auto-context, so mock readFile to fail
    vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));
    const matches = [makeMatch('a.ts', 1, 'only hit')];
    const result = await formatGrepResults(
      matches,
      { pattern: 'hit' },
      'in workspace',
      100,
    );
    expect(result.llmContent).toContain('Found 1 match for pattern "hit"');
    expect(result.returnDisplay).toBe('Found 1 match');
  });

  it('should show truncation warning when matchCount >= totalMaxMatches', async () => {
    const matches = [
      makeMatch('a.ts', 1, 'hit1'),
      makeMatch('a.ts', 2, 'hit2'),
      makeMatch('a.ts', 3, 'hit3'),
      makeMatch('a.ts', 4, 'hit4'),
      makeMatch('a.ts', 5, 'hit5'),
    ];
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

  it('should return sorted file paths in names_only mode', async () => {
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
    // File list should be sorted alphabetically
    const fileList = result.llmContent.split('\n').slice(1);
    expect(fileList).toEqual(['a.ts', 'm.ts', 'z.ts']);
    expect(result.returnDisplay).toBe('Found 3 files');
  });

  it('should show truncation in names_only mode', async () => {
    const matches = [
      makeMatch('a.ts', 1, 'hit1'),
      makeMatch('a.ts', 2, 'hit2'),
      makeMatch('a.ts', 3, 'hit3'),
    ];
    const result = await formatGrepResults(
      matches,
      { pattern: 'hit', names_only: true },
      'in workspace',
      3,
    );
    expect(result.llmContent).toContain('results limited to 3 matches');
    expect(result.returnDisplay).toContain('(limited)');
  });

  it('should use "-" separator for context lines and ":" for match lines', async () => {
    const matches = [
      makeMatch('a.ts', 1, 'actual match'),
      makeMatch('a.ts', 2, 'context line', { isContext: true }),
      makeMatch('a.ts', 3, 'another match'),
      makeMatch('a.ts', 4, 'another context', { isContext: true }),
    ];
    // matchCount = 2 (non-context), so auto-context triggers. Mock readFile to fail
    // so enrichment is a no-op and our isContext flags are preserved.
    vi.mocked(fsPromises.readFile).mockRejectedValue(new Error('ENOENT'));
    const result = await formatGrepResults(
      matches,
      { pattern: 'test' },
      'in workspace',
      100,
    );
    expect(result.llmContent).toContain('L1: actual match');
    expect(result.llmContent).toContain('L2- context line');
    expect(result.llmContent).toContain('L3: another match');
    expect(result.llmContent).toContain('L4- another context');
  });

  it('should include include_pattern in output header', async () => {
    const matches = [
      makeMatch('a.ts', 1, 'hit1'),
      makeMatch('a.ts', 2, 'hit2'),
      makeMatch('a.ts', 3, 'hit3'),
      makeMatch('a.ts', 4, 'hit4'),
    ];
    const result = await formatGrepResults(
      matches,
      { pattern: 'hit', include_pattern: '*.ts' },
      'in workspace',
      100,
    );
    expect(result.llmContent).toContain('(filter: "*.ts")');
  });

  it('should not count context lines in matchCount', async () => {
    const matches = [
      makeMatch('a.ts', 1, 'real match'),
      makeMatch('a.ts', 2, 'ctx1', { isContext: true }),
      makeMatch('a.ts', 3, 'ctx2', { isContext: true }),
      makeMatch('a.ts', 4, 'real match 2'),
      makeMatch('a.ts', 5, 'real match 3'),
      makeMatch('a.ts', 6, 'real match 4'),
    ];
    // 4 real matches -> skip auto-context
    const result = await formatGrepResults(
      matches,
      { pattern: 'real' },
      'in workspace',
      100,
    );
    expect(result.llmContent).toContain('Found 4 matches');
  });
});
