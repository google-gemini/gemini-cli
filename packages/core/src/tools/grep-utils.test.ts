/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  formatGrepResults,
  MAX_GREP_OUTPUT_CHARS,
  type GrepMatch,
} from './grep-utils.js';

function makeMatches(
  fileCount: number,
  matchesPerFile: number,
  lineLength: number,
): GrepMatch[] {
  const matches: GrepMatch[] = [];
  for (let f = 0; f < fileCount; f++) {
    const filePath = `logs/build-${f}.log`;
    for (let l = 1; l <= matchesPerFile; l++) {
      const prefix = `Gmail sync ${f}:${l} `;
      matches.push({
        filePath,
        absolutePath: `/repo/${filePath}`,
        lineNumber: l,
        line: prefix + 'x'.repeat(Math.max(0, lineLength - prefix.length)),
      });
    }
  }
  return matches;
}

describe('formatGrepResults output budget', () => {
  it('keeps a broad search under the budget and tells the model to narrow it', async () => {
    // Roughly the search from issue #17448: 'Gmail' in ./ hitting thousands
    // of long lines in logs and build artifacts.
    const matches = makeMatches(50, 100, 1500);

    const { llmContent, returnDisplay } = await formatGrepResults(
      matches,
      { pattern: 'Gmail' },
      'in path "."',
      10000,
    );

    expect(llmContent.length).toBeLessThanOrEqual(MAX_GREP_OUTPUT_CHARS);
    expect(llmContent).toContain('Found 5000 matches for pattern "Gmail"');
    expect(llmContent).toMatch(/showing \d+ of 5000 matches/);
    expect(llmContent).toContain('Narrow the search');
    expect(llmContent).toContain('include_pattern');
    expect(llmContent).toContain('dir_path');
    expect(returnDisplay.summary).toBe('Found 5000 matches (limited)');
  });

  it('cuts on whole lines and reports how many matches were shown', async () => {
    const matches = makeMatches(50, 100, 1500);

    const { llmContent } = await formatGrepResults(
      matches,
      { pattern: 'Gmail' },
      'in path "."',
      10000,
    );

    const shownLines = llmContent
      .split('\n')
      .filter((line) => /^L\d+: /.test(line));
    for (const line of shownLines) {
      // Every match line that made it in is complete, not cut mid-way.
      expect(line.slice(line.indexOf(': ') + 2)).toMatch(
        /^Gmail sync \d+:\d+ x{1400,}$/,
      );
      expect(line.slice(line.indexOf(': ') + 2)).toHaveLength(1500);
    }
    const shown = Number(/showing (\d+) of/.exec(llmContent)?.[1]);
    expect(shown).toBe(shownLines.length);
    expect(shown).toBeGreaterThan(0);
  });

  it('leaves normal-sized results untouched', async () => {
    const matches = makeMatches(4, 25, 80);

    const { llmContent, returnDisplay } = await formatGrepResults(
      matches,
      { pattern: 'Gmail' },
      'in path "."',
      100,
    );

    expect(llmContent).not.toContain('Narrow the search');
    expect(
      llmContent.split('\n').filter((l) => /^L\d+: /.test(l)),
    ).toHaveLength(100);
    expect(returnDisplay.summary).toBe('Found 100 matches (limited)');
  });

  it('drops context lines before dropping matches', async () => {
    // One match in a file of long lines, with 50 lines of context either side:
    // the context alone is over the budget and would push the match out.
    const lines: GrepMatch[] = [];
    for (let l = 1; l <= 101; l++) {
      lines.push({
        filePath: 'dist/app.min.js',
        absolutePath: '/repo/dist/app.min.js',
        lineNumber: l,
        line: (l === 51 ? 'Gmail ' : 'ctx ') + 'y'.repeat(1990),
        isContext: l !== 51,
      });
    }

    const { llmContent, returnDisplay } = await formatGrepResults(
      lines,
      { pattern: 'Gmail', context: 50 },
      'in path "."',
      100,
    );

    expect(llmContent.length).toBeLessThanOrEqual(MAX_GREP_OUTPUT_CHARS);
    expect(llmContent).toContain('L51: Gmail ');
    expect(llmContent).not.toMatch(/^L\d+- /m);
    expect(llmContent).toContain('Context lines were left out');
    expect(llmContent).not.toContain('Narrow the search');
    expect(returnDisplay.summary).toBe('Found 1 match');
  });

  it('applies the budget to names_only results', async () => {
    const matches: GrepMatch[] = Array.from({ length: 5000 }, (_, i) => ({
      filePath: `dist/chunks/very/deeply/nested/output/chunk-${i}.js`,
      absolutePath: `/repo/dist/chunks/very/deeply/nested/output/chunk-${i}.js`,
      lineNumber: 1,
      line: 'Gmail',
    }));

    const { llmContent, returnDisplay } = await formatGrepResults(
      matches,
      { pattern: 'Gmail', names_only: true },
      'in path "."',
      10000,
    );

    expect(llmContent.length).toBeLessThanOrEqual(MAX_GREP_OUTPUT_CHARS);
    expect(llmContent).toContain('Found 5000 files with matches');
    expect(llmContent).toMatch(/showing \d+ of 5000 files/);
    expect(llmContent).toContain('Narrow the search');
    expect(returnDisplay.summary).toBe('Found 5000 files (limited)');
  });
});
