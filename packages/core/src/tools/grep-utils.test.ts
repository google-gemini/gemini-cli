/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { GrepMatch } from './grep-utils.js';
import {
  groupMatchesByFile,
  readFileLines,
  enrichWithAutoContext,
  formatGrepResults,
} from './grep-utils.js';

describe('groupMatchesByFile', () => {
  it('should return an empty object when given no matches', () => {
    const result = groupMatchesByFile([]);
    expect(result).toEqual({});
  });

  it('should group matches by file path', () => {
    const matches: GrepMatch[] = [
      {
        filePath: 'src/a.ts',
        absolutePath: '/root/src/a.ts',
        lineNumber: 10,
        line: 'const a = 1;',
      },
      {
        filePath: 'src/b.ts',
        absolutePath: '/root/src/b.ts',
        lineNumber: 5,
        line: 'const b = 2;',
      },
      {
        filePath: 'src/a.ts',
        absolutePath: '/root/src/a.ts',
        lineNumber: 3,
        line: 'import foo;',
      },
    ];

    const result = groupMatchesByFile(matches);

    expect(Object.keys(result)).toHaveLength(2);
    expect(result['src/a.ts']).toHaveLength(2);
    expect(result['src/b.ts']).toHaveLength(1);
  });

  it('should sort matches within each file by line number', () => {
    const matches: GrepMatch[] = [
      {
        filePath: 'src/a.ts',
        absolutePath: '/root/src/a.ts',
        lineNumber: 20,
        line: 'line 20',
      },
      {
        filePath: 'src/a.ts',
        absolutePath: '/root/src/a.ts',
        lineNumber: 5,
        line: 'line 5',
      },
      {
        filePath: 'src/a.ts',
        absolutePath: '/root/src/a.ts',
        lineNumber: 12,
        line: 'line 12',
      },
    ];

    const result = groupMatchesByFile(matches);
    const lines = result['src/a.ts'].map((m) => m.lineNumber);
    expect(lines).toEqual([5, 12, 20]);
  });
});

describe('readFileLines', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grep-utils-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should read a file and split it into lines', async () => {
    const filePath = path.join(tempDir, 'test.txt');
    await fs.writeFile(filePath, 'line1\nline2\nline3\n');

    const result = await readFileLines(filePath);

    expect(result).toEqual(['line1', 'line2', 'line3', '']);
  });

  it('should handle Windows-style line endings', async () => {
    const filePath = path.join(tempDir, 'win.txt');
    await fs.writeFile(filePath, 'alpha\r\nbeta\r\ngamma');

    const result = await readFileLines(filePath);

    expect(result).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('should return null when the file does not exist', async () => {
    const result = await readFileLines(path.join(tempDir, 'nope.txt'));
    expect(result).toBeNull();
  });

  it('should handle an empty file', async () => {
    const filePath = path.join(tempDir, 'empty.txt');
    await fs.writeFile(filePath, '');

    const result = await readFileLines(filePath);

    expect(result).toEqual(['']);
  });
});

describe('enrichWithAutoContext', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grep-enrich-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function createFileWithLines(
    name: string,
    lineCount: number,
  ): Promise<string> {
    const filePath = path.join(tempDir, name);
    const lines = Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`);
    await fs.writeFile(filePath, lines.join('\n'));
    return filePath;
  }

  it('should add context lines for a single match', async () => {
    const absPath = await createFileWithLines('single.ts', 100);
    const matchesByFile: Record<string, GrepMatch[]> = {
      'single.ts': [
        {
          filePath: 'single.ts',
          absolutePath: absPath,
          lineNumber: 50,
          line: 'line 50',
        },
      ],
    };

    await enrichWithAutoContext(matchesByFile, 1, {});

    // Single match gets 50 lines of context each side
    const enriched = matchesByFile['single.ts'];
    expect(enriched.length).toBeGreaterThan(1);

    // The original match line should not be marked as context
    const matchLine = enriched.find((m) => m.lineNumber === 50);
    expect(matchLine?.isContext).toBe(false);

    // Surrounding lines should be marked as context
    const contextLine = enriched.find((m) => m.lineNumber === 49);
    expect(contextLine?.isContext).toBe(true);
  });

  it('should add fewer context lines when there are 2-3 matches', async () => {
    const absPath = await createFileWithLines('multi.ts', 100);
    const matchesByFile: Record<string, GrepMatch[]> = {
      'multi.ts': [
        {
          filePath: 'multi.ts',
          absolutePath: absPath,
          lineNumber: 20,
          line: 'line 20',
        },
        {
          filePath: 'multi.ts',
          absolutePath: absPath,
          lineNumber: 80,
          line: 'line 80',
        },
      ],
    };

    await enrichWithAutoContext(matchesByFile, 2, {});

    const enriched = matchesByFile['multi.ts'];
    expect(enriched.length).toBeGreaterThan(2);

    // With 2 matches, context should be 15 lines, so we shouldn't see the entire file
    expect(enriched.length).toBeLessThan(100);
  });

  it('should not enrich when match count exceeds 3', async () => {
    const absPath = await createFileWithLines('many.ts', 100);
    const original: GrepMatch[] = [
      {
        filePath: 'many.ts',
        absolutePath: absPath,
        lineNumber: 10,
        line: 'line 10',
      },
      {
        filePath: 'many.ts',
        absolutePath: absPath,
        lineNumber: 20,
        line: 'line 20',
      },
      {
        filePath: 'many.ts',
        absolutePath: absPath,
        lineNumber: 30,
        line: 'line 30',
      },
      {
        filePath: 'many.ts',
        absolutePath: absPath,
        lineNumber: 40,
        line: 'line 40',
      },
    ];
    const matchesByFile: Record<string, GrepMatch[]> = {
      'many.ts': [...original],
    };

    await enrichWithAutoContext(matchesByFile, 4, {});

    // Should remain unchanged
    expect(matchesByFile['many.ts']).toHaveLength(4);
  });

  it('should not enrich when names_only is true', async () => {
    const absPath = await createFileWithLines('names.ts', 100);
    const matchesByFile: Record<string, GrepMatch[]> = {
      'names.ts': [
        {
          filePath: 'names.ts',
          absolutePath: absPath,
          lineNumber: 50,
          line: 'line 50',
        },
      ],
    };

    await enrichWithAutoContext(matchesByFile, 1, { names_only: true });

    expect(matchesByFile['names.ts']).toHaveLength(1);
  });

  it('should not enrich when explicit context is provided', async () => {
    const absPath = await createFileWithLines('ctx.ts', 100);
    const matchesByFile: Record<string, GrepMatch[]> = {
      'ctx.ts': [
        {
          filePath: 'ctx.ts',
          absolutePath: absPath,
          lineNumber: 50,
          line: 'line 50',
        },
      ],
    };

    await enrichWithAutoContext(matchesByFile, 1, { context: 5 });

    expect(matchesByFile['ctx.ts']).toHaveLength(1);
  });

  it('should not enrich when before param is provided', async () => {
    const absPath = await createFileWithLines('before.ts', 100);
    const matchesByFile: Record<string, GrepMatch[]> = {
      'before.ts': [
        {
          filePath: 'before.ts',
          absolutePath: absPath,
          lineNumber: 50,
          line: 'line 50',
        },
      ],
    };

    await enrichWithAutoContext(matchesByFile, 1, { before: 3 });

    expect(matchesByFile['before.ts']).toHaveLength(1);
  });

  it('should skip files that cannot be read', async () => {
    const matchesByFile: Record<string, GrepMatch[]> = {
      'missing.ts': [
        {
          filePath: 'missing.ts',
          absolutePath: '/nonexistent/missing.ts',
          lineNumber: 10,
          line: 'line 10',
        },
      ],
    };

    await enrichWithAutoContext(matchesByFile, 1, {});

    // Should remain unchanged since the file can't be read
    expect(matchesByFile['missing.ts']).toHaveLength(1);
  });

  it('should skip empty file groups', async () => {
    const matchesByFile: Record<string, GrepMatch[]> = {
      'empty.ts': [],
    };

    await enrichWithAutoContext(matchesByFile, 1, {});

    expect(matchesByFile['empty.ts']).toHaveLength(0);
  });

  it('should mark overlapping context correctly when matches are close', async () => {
    const absPath = await createFileWithLines('close.ts', 50);
    const matchesByFile: Record<string, GrepMatch[]> = {
      'close.ts': [
        {
          filePath: 'close.ts',
          absolutePath: absPath,
          lineNumber: 10,
          line: 'line 10',
        },
        {
          filePath: 'close.ts',
          absolutePath: absPath,
          lineNumber: 12,
          line: 'line 12',
        },
      ],
    };

    await enrichWithAutoContext(matchesByFile, 2, {});

    const enriched = matchesByFile['close.ts'];
    // Both match lines should not be context
    const match10 = enriched.find((m) => m.lineNumber === 10);
    const match12 = enriched.find((m) => m.lineNumber === 12);
    expect(match10?.isContext).toBe(false);
    expect(match12?.isContext).toBe(false);

    // Line 11 is between two matches, should be context
    const line11 = enriched.find((m) => m.lineNumber === 11);
    expect(line11?.isContext).toBe(true);
  });
});

describe('formatGrepResults', () => {
  it('should return no-match message for empty results', async () => {
    const result = await formatGrepResults(
      [],
      { pattern: 'foo' },
      'in project',
      100,
    );

    expect(result.llmContent).toContain('No matches found');
    expect(result.llmContent).toContain('foo');
    expect(result.returnDisplay).toBe('No matches found');
  });

  it('should include filter info in no-match message', async () => {
    const result = await formatGrepResults(
      [],
      { pattern: 'foo', include_pattern: '*.ts' },
      'in project',
      100,
    );

    expect(result.llmContent).toContain('*.ts');
  });

  it('should format matches with file grouping', async () => {
    const matches: GrepMatch[] = [
      {
        filePath: 'src/a.ts',
        absolutePath: '/root/src/a.ts',
        lineNumber: 10,
        line: 'const foo = 1;',
      },
      {
        filePath: 'src/b.ts',
        absolutePath: '/root/src/b.ts',
        lineNumber: 5,
        line: 'let foo = 2;',
      },
    ];

    // Use high matchCount (>3) params to skip enrichWithAutoContext
    const result = await formatGrepResults(
      matches,
      { pattern: 'foo', context: 0 },
      'in project',
      100,
    );

    expect(result.llmContent).toContain('Found 2 matches');
    expect(result.llmContent).toContain('File: src/a.ts');
    expect(result.llmContent).toContain('File: src/b.ts');
    expect(result.llmContent).toContain('L10: const foo = 1;');
    expect(result.llmContent).toContain('L5: let foo = 2;');
    expect(result.returnDisplay).toBe('Found 2 matches');
  });

  it('should use singular "match" for a single result', async () => {
    const matches: GrepMatch[] = [
      {
        filePath: 'src/a.ts',
        absolutePath: '/root/src/a.ts',
        lineNumber: 1,
        line: 'hello',
      },
    ];

    const result = await formatGrepResults(
      matches,
      { pattern: 'hello', context: 0 },
      'in project',
      100,
    );

    expect(result.llmContent).toContain('Found 1 match for');
    expect(result.returnDisplay).toBe('Found 1 match');
  });

  it('should indicate truncation when matches reach the limit', async () => {
    const matches: GrepMatch[] = Array.from({ length: 5 }, (_, i) => ({
      filePath: 'src/a.ts',
      absolutePath: '/root/src/a.ts',
      lineNumber: i + 1,
      line: `match ${i + 1}`,
    }));

    const result = await formatGrepResults(
      matches,
      { pattern: 'match', context: 0 },
      'in project',
      5,
    );

    expect(result.llmContent).toContain('results limited to 5 matches');
    expect(result.returnDisplay).toContain('(limited)');
  });

  it('should handle names_only mode', async () => {
    const matches: GrepMatch[] = [
      {
        filePath: 'src/a.ts',
        absolutePath: '/root/src/a.ts',
        lineNumber: 1,
        line: 'foo',
      },
      {
        filePath: 'src/b.ts',
        absolutePath: '/root/src/b.ts',
        lineNumber: 1,
        line: 'foo',
      },
      {
        filePath: 'src/a.ts',
        absolutePath: '/root/src/a.ts',
        lineNumber: 5,
        line: 'foo again',
      },
    ];

    const result = await formatGrepResults(
      matches,
      { pattern: 'foo', names_only: true },
      'in project',
      100,
    );

    expect(result.llmContent).toContain('Found 2 files');
    expect(result.llmContent).toContain('src/a.ts');
    expect(result.llmContent).toContain('src/b.ts');
    // Should not contain line-level details
    expect(result.llmContent).not.toContain('L1:');
    expect(result.returnDisplay).toContain('Found 2 files');
  });

  it('should use dash separator for context lines', async () => {
    const matches: GrepMatch[] = [
      {
        filePath: 'src/a.ts',
        absolutePath: '/root/src/a.ts',
        lineNumber: 9,
        line: 'context before',
        isContext: true,
      },
      {
        filePath: 'src/a.ts',
        absolutePath: '/root/src/a.ts',
        lineNumber: 10,
        line: 'actual match',
        isContext: false,
      },
      {
        filePath: 'src/a.ts',
        absolutePath: '/root/src/a.ts',
        lineNumber: 11,
        line: 'context after',
        isContext: true,
      },
    ];

    const result = await formatGrepResults(
      matches,
      { pattern: 'match', context: 1 },
      'in project',
      100,
    );

    expect(result.llmContent).toContain('L9- context before');
    expect(result.llmContent).toContain('L10: actual match');
    expect(result.llmContent).toContain('L11- context after');
  });

  it('should not count context lines as matches', async () => {
    const matches: GrepMatch[] = [
      {
        filePath: 'src/a.ts',
        absolutePath: '/root/src/a.ts',
        lineNumber: 9,
        line: 'context',
        isContext: true,
      },
      {
        filePath: 'src/a.ts',
        absolutePath: '/root/src/a.ts',
        lineNumber: 10,
        line: 'real match',
        isContext: false,
      },
    ];

    const result = await formatGrepResults(
      matches,
      { pattern: 'real', context: 1 },
      'in project',
      100,
    );

    expect(result.llmContent).toContain('Found 1 match');
  });

  it('should show truncation info in names_only mode', async () => {
    const matches: GrepMatch[] = Array.from({ length: 10 }, (_, i) => ({
      filePath: `src/file${i}.ts`,
      absolutePath: `/root/src/file${i}.ts`,
      lineNumber: 1,
      line: 'hit',
    }));

    const result = await formatGrepResults(
      matches,
      { pattern: 'hit', names_only: true },
      'in project',
      10,
    );

    expect(result.llmContent).toContain('results limited to 10 matches');
    expect(result.returnDisplay).toContain('(limited)');
  });
});
