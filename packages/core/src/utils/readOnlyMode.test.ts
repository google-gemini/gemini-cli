/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isReadOnlyTask,
  injectReadOnlyDenyRules,
  READ_ONLY_BLOCKED_TOOLS,
  READ_ONLY_GUARD_SOURCE,
  READ_ONLY_RULE_PRIORITY,
} from './readOnlyMode.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { PolicyDecision } from '../policy/types.js';

describe('isReadOnlyTask', () => {
  // --- Positive matches: must return true ---

  it('detects "NO file modifications" (exact Issue #19836 phrase)', () => {
    expect(
      isReadOnlyTask(
        'This is a READ-ONLY consulting engagement. NO file modifications.',
      ),
    ).toBe(true);
  });

  it('detects "no file modification" (singular)', () => {
    expect(isReadOnlyTask('Please perform no file modification.')).toBe(true);
  });

  it('detects "this is a read-only" phrasing', () => {
    expect(isReadOnlyTask('This is a read-only analysis task.')).toBe(true);
  });

  it('detects "this is a read only" (no hyphen)', () => {
    expect(isReadOnlyTask('This is a read only consulting engagement.')).toBe(
      true,
    );
  });

  it('detects "read-only consulting engagement"', () => {
    expect(
      isReadOnlyTask('You are doing a read-only consulting engagement.'),
    ).toBe(true);
  });

  it('detects "read-only mode"', () => {
    expect(isReadOnlyTask('Operate in read-only mode.')).toBe(true);
  });

  it('detects "read-only analysis"', () => {
    expect(isReadOnlyTask('This is read-only analysis work.')).toBe(true);
  });

  it('detects "do not write any files"', () => {
    expect(isReadOnlyTask('Do not write any files.')).toBe(true);
  });

  it('detects "do not create files"', () => {
    expect(isReadOnlyTask('Do not create files during analysis.')).toBe(true);
  });

  it('detects "do not edit any files"', () => {
    expect(isReadOnlyTask('Do not edit any files.')).toBe(true);
  });

  it('detects "do not modify files"', () => {
    expect(isReadOnlyTask('You must do not modify files on disk.')).toBe(true);
  });

  it('detects "do not delete files"', () => {
    expect(isReadOnlyTask('Do not delete files.')).toBe(true);
  });

  it('detects "do not write"', () => {
    expect(isReadOnlyTask('Do not write to the repository.')).toBe(true);
  });

  it('detects "no writes"', () => {
    expect(isReadOnlyTask('No writes should be performed.')).toBe(true);
  });

  it('detects "no write"', () => {
    expect(isReadOnlyTask('No write operations permitted.')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isReadOnlyTask('NO FILE MODIFICATIONS')).toBe(true);
    expect(isReadOnlyTask('Read-Only Consulting Engagement')).toBe(true);
    expect(isReadOnlyTask('DO NOT WRITE ANY FILES')).toBe(true);
  });

  it('detects phrase within a longer brief', () => {
    const brief = [
      'You are a senior code reviewer.',
      'Review areas: architecture, security, performance.',
      'NO file modifications — this is a READ-ONLY consulting engagement.',
      'Output format: Sections A-E.',
    ].join('\n');
    expect(isReadOnlyTask(brief)).toBe(true);
  });

  // --- Negative matches: must NOT return true (avoid false positives) ---

  it('does NOT match empty string', () => {
    expect(isReadOnlyTask('')).toBe(false);
  });

  it('does NOT match a normal coding request', () => {
    expect(isReadOnlyTask('Please refactor the authentication module.')).toBe(
      false,
    );
  });

  it('does NOT match ambiguous "read only"', () => {
    // "read only the first section" is about reading a section, not a constraint
    expect(
      isReadOnlyTask('Please read only the first section of the file.'),
    ).toBe(false);
  });

  it('does NOT match "write" in unrelated context', () => {
    expect(
      isReadOnlyTask(
        'Write a function that parses JSON and returns the result.',
      ),
    ).toBe(false);
  });

  it('does NOT match "file" mentions in unrelated context', () => {
    expect(isReadOnlyTask('Show me the contents of the config file.')).toBe(
      false,
    );
  });

  it('does NOT match "analysis" without read-only signal', () => {
    expect(isReadOnlyTask('Perform gap analysis on the codebase.')).toBe(false);
  });
});

describe('injectReadOnlyDenyRules', () => {
  it('adds DENY rules for every write-capable tool', () => {
    const engine = new PolicyEngine();
    const addRuleSpy = vi.spyOn(engine, 'addRule');

    injectReadOnlyDenyRules(engine);

    expect(addRuleSpy).toHaveBeenCalledTimes(READ_ONLY_BLOCKED_TOOLS.length);

    for (const toolName of READ_ONLY_BLOCKED_TOOLS) {
      expect(addRuleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName,
          decision: PolicyDecision.DENY,
          priority: READ_ONLY_RULE_PRIORITY,
          source: READ_ONLY_GUARD_SOURCE,
        }),
      );
    }
  });

  it('rule priority is high enough to override any user ALLOW rule', () => {
    expect(READ_ONLY_RULE_PRIORITY).toBeGreaterThan(100);
  });

  it('injected rules include a human-readable denyMessage', () => {
    const engine = new PolicyEngine();
    const addRuleSpy = vi.spyOn(engine, 'addRule');

    injectReadOnlyDenyRules(engine);

    for (const call of addRuleSpy.mock.calls) {
      expect(call[0].denyMessage).toBeTruthy();
      expect(typeof call[0].denyMessage).toBe('string');
    }
  });

  it('does not add DENY rules for read-only tools', () => {
    const engine = new PolicyEngine();
    const addRuleSpy = vi.spyOn(engine, 'addRule');

    injectReadOnlyDenyRules(engine);

    const blockedToolSet = new Set(READ_ONLY_BLOCKED_TOOLS);
    for (const call of addRuleSpy.mock.calls) {
      // Every blocked tool must be in the blocked set
      expect(blockedToolSet.has(call[0].toolName!)).toBe(true);
    }

    // Verify that common read-only tools are NOT included
    const blockedNames = addRuleSpy.mock.calls.map((c) => c[0].toolName);
    expect(blockedNames).not.toContain('read_file');
    expect(blockedNames).not.toContain('read_many_files');
    expect(blockedNames).not.toContain('glob');
    expect(blockedNames).not.toContain('grep');
    expect(blockedNames).not.toContain('ls');
  });
});
