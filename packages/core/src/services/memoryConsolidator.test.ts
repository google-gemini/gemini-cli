/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  MemoryConsolidator,
  splitSections,
  parseInsights,
  deduplicateInsights,
  GEMINI_SECTION_MARKER,
  type ConsolidationLlmClient,
} from './memoryConsolidator.js';
import type { SessionLogEntry } from './sessionLogTypes.js';

function makeEntry(overrides: Partial<SessionLogEntry> = {}): SessionLogEntry {
  return {
    timestamp: new Date().toISOString(),
    sessionId: 'test-session',
    prompt: 'Fix the auth bug',
    summary: 'Fixed OAuth token refresh logic in authService.ts',
    filesModified: ['src/auth/authService.ts'],
    durationMs: 2000,
    ...overrides,
  };
}

function mockLlmClient(response: string): ConsolidationLlmClient {
  return {
    generateContent: vi.fn().mockResolvedValue(response),
  };
}

describe('splitSections', () => {
  it('splits content at the Gemini section marker', () => {
    const content = `# My Project

## Architecture
Some architecture notes.

${GEMINI_SECTION_MARKER}
<!-- comment -->
- Insight one
- Insight two`;

    const { userSection, geminiSection } = splitSections(content);
    expect(userSection).toContain('## Architecture');
    expect(geminiSection).toContain('- Insight one');
    expect(geminiSection).toContain('- Insight two');
  });

  it('returns full content as user section when marker is missing', () => {
    const content = '# Project\n\nSome content';
    const { userSection, geminiSection } = splitSections(content);
    expect(userSection).toBe(content);
    expect(geminiSection).toBe('');
  });

  it('handles empty gemini section', () => {
    const content = `# Project\n\n${GEMINI_SECTION_MARKER}\n<!-- comment -->`;
    const { userSection, geminiSection } = splitSections(content);
    expect(userSection).toContain('# Project');
    expect(geminiSection).toBe('');
  });
});

describe('parseInsights', () => {
  it('extracts bullet points from LLM response', () => {
    const response = `Here are the insights:
- The auth module uses OAuth 2.0 with PKCE
- Database queries use the repository pattern
- Tests are run with Vitest`;

    const insights = parseInsights(response);
    expect(insights).toHaveLength(3);
    expect(insights[0]).toBe('The auth module uses OAuth 2.0 with PKCE');
  });

  it('returns empty array for NO_NEW_INSIGHTS', () => {
    expect(parseInsights('NO_NEW_INSIGHTS')).toHaveLength(0);
  });

  it('skips non-bullet lines', () => {
    const response = `Some preamble
- Valid insight
Not a bullet
- Another valid one
  indented text`;

    const insights = parseInsights(response);
    expect(insights).toHaveLength(2);
  });
});

describe('deduplicateInsights', () => {
  it('removes insights with high overlap to existing content', () => {
    const existing = '- The auth module uses OAuth 2.0 tokens for authentication';
    const newInsights = [
      'The auth module uses OAuth tokens for authentication flow',  // Duplicate
      'Database migrations run on PostgreSQL 15',                    // New
    ];

    const result = deduplicateInsights(newInsights, existing);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('PostgreSQL');
  });

  it('keeps all insights when no overlap exists', () => {
    const existing = '- Completely different content about CSS styling';
    const newInsights = [
      'Backend uses Express.js',
      'Frontend uses React 18',
    ];

    const result = deduplicateInsights(newInsights, existing);
    expect(result).toHaveLength(2);
  });

  it('handles empty existing content', () => {
    const result = deduplicateInsights(['New insight'], '');
    expect(result).toHaveLength(1);
  });
});

describe('MemoryConsolidator', () => {
  let tmpDir: string;
  let geminiMdPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'consolidator-test-'),
    );
    geminiMdPath = path.join(tmpDir, 'GEMINI.md');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('adds new insights to the Gemini section', async () => {
    await fs.writeFile(
      geminiMdPath,
      `# Test Project

## Architecture
User-authored content here.

${GEMINI_SECTION_MARKER}
<!-- Gemini will add learned context below this line. Do not remove this section. -->
`,
    );

    const client = mockLlmClient(
      '- The project uses a monorepo structure\n- Tests use Vitest framework',
    );
    const consolidator = new MemoryConsolidator(client);

    const result = await consolidator.consolidate(geminiMdPath, [
      makeEntry(),
    ]);

    expect(result.modified).toBe(true);
    expect(result.insightsCount).toBe(2);

    const updated = await fs.readFile(geminiMdPath, 'utf-8');
    expect(updated).toContain('monorepo structure');
    expect(updated).toContain('Vitest framework');
    // User section preserved
    expect(updated).toContain('User-authored content here.');
  });

  it('preserves user-authored content above the marker', async () => {
    const userContent = `# Important Project

## My Custom Notes
These are my personal notes that MUST NOT be modified.

## Architecture
Critical architecture decisions documented here.`;

    await fs.writeFile(
      geminiMdPath,
      `${userContent}\n\n${GEMINI_SECTION_MARKER}\n<!-- comment -->\n`,
    );

    const client = mockLlmClient('- New insight about the project');
    const consolidator = new MemoryConsolidator(client);

    await consolidator.consolidate(geminiMdPath, [makeEntry()]);

    const updated = await fs.readFile(geminiMdPath, 'utf-8');
    expect(updated).toContain('These are my personal notes');
    expect(updated).toContain('Critical architecture decisions');
  });

  it('returns no modifications when LLM finds no new insights', async () => {
    await fs.writeFile(
      geminiMdPath,
      `# Project\n\n${GEMINI_SECTION_MARKER}\n<!-- comment -->\n`,
    );

    const client = mockLlmClient('NO_NEW_INSIGHTS');
    const consolidator = new MemoryConsolidator(client);

    const result = await consolidator.consolidate(geminiMdPath, [
      makeEntry(),
    ]);

    expect(result.modified).toBe(false);
    expect(result.insightsCount).toBe(0);
  });

  it('returns error when GEMINI.md does not exist', async () => {
    const client = mockLlmClient('- Some insight');
    const consolidator = new MemoryConsolidator(client);

    const result = await consolidator.consolidate(
      path.join(tmpDir, 'nonexistent.md'),
      [makeEntry()],
    );

    expect(result.modified).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('skips consolidation when no recent entries provided', async () => {
    const client = mockLlmClient('- Should not be called');
    const consolidator = new MemoryConsolidator(client);

    const result = await consolidator.consolidate(geminiMdPath, []);

    expect(result.modified).toBe(false);
    expect(client.generateContent).not.toHaveBeenCalled();
  });
});
