/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { renderOperationalGuidelines } from './snippets.js';

describe('renderOperationalGuidelines - memoryV2Enabled', () => {
  const baseOptions = {
    interactive: true,
    interactiveShellEnabled: false,
    topicUpdateNarration: false,
    memoryV2Enabled: false,
  };

  it('should include standard memory tool guidance when memoryV2Enabled is false', () => {
    const result = renderOperationalGuidelines(baseOptions);
    expect(result).toContain('save_memory');
    expect(result).toContain('persist facts across sessions');
    expect(result).not.toContain('Instruction and Memory Files');
  });

  it('should distinguish shared GEMINI.md instructions from private MEMORY.md when memoryV2Enabled is true', () => {
    const result = renderOperationalGuidelines({
      ...baseOptions,
      memoryV2Enabled: true,
    });
    expect(result).toContain('Instruction and Memory Files');
    expect(result).toContain('GEMINI.md');
    expect(result).toContain('./GEMINI.md');
    expect(result).toContain('MEMORY.md');
    expect(result).toContain('sibling `*.md` file');
    expect(result).toContain('There is no `save_memory` tool');
    expect(result).not.toContain('subagent');

    // The Global Personal Memory tier is now opt-in via globalMemoryPath.
    // When it is NOT provided (this case), the bullet and the cross-project
    // routing rule must not be rendered.
    expect(result).not.toContain('**Global Personal Memory**');
    expect(result).not.toContain('across all my projects');

    // Per-tier routing block must be present so the model has one trigger
    // per home rather than a single broad "remember -> private folder"
    // default that causes duplicate writes across tiers.
    expect(result).toContain('Routing rules — pick exactly one tier per fact');
    expect(result).toContain('team-shared convention');
    expect(result).toContain('personal-to-them local setup');

    // Explicit mutual-exclusion rule: each fact lives in exactly one tier.
    expect(result).toContain('Never duplicate or mirror the same fact');

    // MEMORY.md must be scoped to its sibling notes only and must never
    // point at GEMINI.md topics.
    expect(result).toContain('index for its sibling `*.md` notes');
    expect(result).toContain('never use it to point at');
  });

  it('should NOT include the Private Project Memory bullet when userProjectMemoryPath is undefined', () => {
    const result = renderOperationalGuidelines({
      ...baseOptions,
      memoryV2Enabled: true,
    });
    expect(result).not.toContain('**Private Project Memory**');
  });

  it('should include the Private Project Memory bullet with the absolute path when provided', () => {
    const userProjectMemoryPath =
      '/Users/test/.gemini/tmp/abc123/memory/MEMORY.md';
    const result = renderOperationalGuidelines({
      ...baseOptions,
      memoryV2Enabled: true,
      userProjectMemoryPath,
    });
    expect(result).toContain('**Private Project Memory**');
    expect(result).toContain(userProjectMemoryPath);
    expect(result).toContain('NOT** be committed to the repo');
  });

  it('should NOT include the Global Personal Memory bullet or cross-project routing rule when globalMemoryPath is undefined', () => {
    const result = renderOperationalGuidelines({
      ...baseOptions,
      memoryV2Enabled: true,
    });
    expect(result).not.toContain('**Global Personal Memory**');
    expect(result).not.toContain('across all my projects');
    expect(result).not.toContain('cross-project personal preference');
  });

  it('should include the Global Personal Memory bullet, cross-project routing rule, and four-tier mutual-exclusion when globalMemoryPath is provided', () => {
    const globalMemoryPath = '/Users/test/.gemini/GEMINI.md';
    const result = renderOperationalGuidelines({
      ...baseOptions,
      memoryV2Enabled: true,
      globalMemoryPath,
    });
    expect(result).toContain('**Global Personal Memory**');
    expect(result).toContain(globalMemoryPath);
    expect(result).toContain('cross-project personal preference');
    expect(result).toContain('across all my projects');
    // Mutual-exclusion rule must explicitly cover all four tiers when the
    // global tier is surfaced.
    expect(result).toContain('across all four tiers');
  });
});
