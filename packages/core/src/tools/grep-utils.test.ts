/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatGrepResults, type GrepMatch } from './grep-utils.js';

describe('formatGrepResults truncation messaging', () => {
  it('should include actionable truncation warning when results are truncated', async () => {
    const matches: GrepMatch[] = Array.from({ length: 100 }, (_, i) => ({
      filePath: `file${i}.ts`,
      absolutePath: `/workspace/file${i}.ts`,
      lineNumber: i + 1,
      line: `match line ${i}`,
    }));

    const result = await formatGrepResults(
      matches,
      { pattern: 'test' },
      'in the workspace directory',
      100, // totalMaxMatches = exactly matchCount, triggers wasTruncated (>=)
    );

    expect(result.llmContent).toContain('RESULTS TRUNCATED');
    expect(result.llmContent).toContain('total_max_matches');
    expect(result.returnDisplay).toContain('truncated at 100');
  });

  it('should NOT include truncation warning when results are under limit', async () => {
    const matches: GrepMatch[] = Array.from({ length: 5 }, (_, i) => ({
      filePath: `file${i}.ts`,
      absolutePath: `/workspace/file${i}.ts`,
      lineNumber: i + 1,
      line: `match line ${i}`,
    }));

    const result = await formatGrepResults(
      matches,
      { pattern: 'test' },
      'in the workspace directory',
      100,
    );

    expect(result.llmContent).not.toContain('TRUNCATED');
    expect(result.returnDisplay).not.toContain('truncated');
  });

  it('should include truncation warning in names_only mode', async () => {
    const matches: GrepMatch[] = Array.from({ length: 50 }, (_, i) => ({
      filePath: `file${i}.ts`,
      absolutePath: `/workspace/file${i}.ts`,
      lineNumber: 1,
      line: `match`,
    }));

    const result = await formatGrepResults(
      matches,
      { pattern: 'test', names_only: true },
      'in the workspace directory',
      50, // triggers wasTruncated (>=)
    );

    expect(result.llmContent).toContain('RESULTS TRUNCATED');
    expect(result.returnDisplay).toContain('truncated at 50 matches');
  });

  it('should NOT include truncation warning in names_only mode when under limit', async () => {
    const matches: GrepMatch[] = Array.from({ length: 5 }, (_, i) => ({
      filePath: `file${i}.ts`,
      absolutePath: `/workspace/file${i}.ts`,
      lineNumber: 1,
      line: `match`,
    }));

    const result = await formatGrepResults(
      matches,
      { pattern: 'test', names_only: true },
      'in the workspace directory',
      100,
    );

    expect(result.llmContent).not.toContain('TRUNCATED');
    expect(result.returnDisplay).not.toContain('truncated');
  });
});
