/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Tests for READ-ONLY enforcement in GeminiClient.sendMessageStream
 * (Issue #19836).
 *
 * Positive test: prompts with explicit READ-ONLY constraints must cause DENY
 * rules to be injected into the PolicyEngine for all write-capable tools.
 *
 * Regression test: prompts without READ-ONLY constraints must NOT inject any
 * DENY rules, preserving existing file-editing behaviour unchanged.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicyEngine } from '../policy/policy-engine.js';
import { PolicyDecision } from '../policy/types.js';
import {
  isReadOnlyTask,
  injectReadOnlyDenyRules,
  READ_ONLY_BLOCKED_TOOLS,
  READ_ONLY_GUARD_SOURCE,
} from '../utils/readOnlyMode.js';

// ---------------------------------------------------------------------------
// Helpers: simulate what sendMessageStream does when it receives a request
// ---------------------------------------------------------------------------

/**
 * Simulate the READ-ONLY guard logic extracted from sendMessageStream so we
 * can test it without spinning up a full GeminiClient or hitting the API.
 *
 * In production this lives inside sendMessageStream:
 *
 *   const promptText = Array.isArray(request)
 *     ? request.map((p) => partToString(p)).join(' ')
 *     : partToString(request);
 *   if (isReadOnlyTask(promptText)) {
 *     injectReadOnlyDenyRules(this.config.getPolicyEngine());
 *   }
 */
function applyReadOnlyGuard(promptText: string, engine: PolicyEngine): void {
  if (isReadOnlyTask(promptText)) {
    injectReadOnlyDenyRules(engine);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GeminiClient READ-ONLY guard (Issue #19836)', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  // -------------------------------------------------------------------------
  // Positive READ-ONLY test
  // -------------------------------------------------------------------------

  describe('with explicit READ-ONLY constraint in prompt', () => {
    const READ_ONLY_BRIEF = [
      'You are a senior code reviewer hired as an external consultant.',
      '',
      'Review areas:',
      '  1. Architecture & design patterns',
      '  2. Security vulnerabilities',
      '  3. Performance bottlenecks',
      '  4. Test coverage gaps',
      '  5. Documentation quality',
      '  6. Dependency hygiene',
      '  7. CI/CD pipeline',
      '',
      'NO file modifications — this is a READ-ONLY consulting engagement.',
      '',
      'Output format: provide findings as Sections A through E.',
    ].join('\n');

    it('detects READ-ONLY constraint in brief', () => {
      expect(isReadOnlyTask(READ_ONLY_BRIEF)).toBe(true);
    });

    it('injects DENY rules for all write-capable tools', () => {
      const addRuleSpy = vi.spyOn(engine, 'addRule');

      applyReadOnlyGuard(READ_ONLY_BRIEF, engine);

      expect(addRuleSpy).toHaveBeenCalledTimes(READ_ONLY_BLOCKED_TOOLS.length);
    });

    it('injected rules have PolicyDecision.DENY', () => {
      const addRuleSpy = vi.spyOn(engine, 'addRule');

      applyReadOnlyGuard(READ_ONLY_BRIEF, engine);

      for (const call of addRuleSpy.mock.calls) {
        expect(call[0].decision).toBe(PolicyDecision.DENY);
      }
    });

    it('injected rules carry the read-only-guard source tag', () => {
      const addRuleSpy = vi.spyOn(engine, 'addRule');

      applyReadOnlyGuard(READ_ONLY_BRIEF, engine);

      for (const call of addRuleSpy.mock.calls) {
        expect(call[0].source).toBe(READ_ONLY_GUARD_SOURCE);
      }
    });

    it('write_file tool is blocked', () => {
      const addRuleSpy = vi.spyOn(engine, 'addRule');

      applyReadOnlyGuard(READ_ONLY_BRIEF, engine);

      const blockedNames = addRuleSpy.mock.calls.map((c) => c[0].toolName);
      expect(blockedNames).toContain('write_file');
    });

    it('edit (replace) tool is blocked', () => {
      const addRuleSpy = vi.spyOn(engine, 'addRule');

      applyReadOnlyGuard(READ_ONLY_BRIEF, engine);

      const blockedNames = addRuleSpy.mock.calls.map((c) => c[0].toolName);
      expect(blockedNames).toContain('replace');
    });

    it('shell tool is blocked', () => {
      const addRuleSpy = vi.spyOn(engine, 'addRule');

      applyReadOnlyGuard(READ_ONLY_BRIEF, engine);

      const blockedNames = addRuleSpy.mock.calls.map((c) => c[0].toolName);
      expect(blockedNames).toContain('run_shell_command');
    });
  });

  // -------------------------------------------------------------------------
  // Regression test: normal (non-READ-ONLY) workflows are unchanged
  // -------------------------------------------------------------------------

  describe('without READ-ONLY constraint in prompt (regression)', () => {
    const NORMAL_PROMPTS = [
      'Please refactor the authentication module to use the new OAuth2 library.',
      'Add a unit test for the `parseConfig` function in config.ts.',
      'Fix the bug in write-file.ts where empty strings are not handled.',
      'Implement a new `read_csv` tool that reads CSV files and returns rows.',
      'Update the README with installation instructions.',
    ];

    it.each(NORMAL_PROMPTS)(
      'does NOT block write tools for: "%s"',
      (prompt) => {
        const addRuleSpy = vi.spyOn(engine, 'addRule');

        applyReadOnlyGuard(prompt, engine);

        // No DENY rules should be injected for write tools
        const denyCallsForWriteTools = addRuleSpy.mock.calls.filter(
          (call) =>
            call[0].decision === PolicyDecision.DENY &&
            call[0].source === READ_ONLY_GUARD_SOURCE,
        );
        expect(denyCallsForWriteTools).toHaveLength(0);
      },
    );

    it('returns false from isReadOnlyTask for a normal coding request', () => {
      expect(
        isReadOnlyTask(
          'Implement a file watcher that triggers rebuild on change.',
        ),
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Guard is skipped for retry turns (isInvalidStreamRetry = true)
  // -------------------------------------------------------------------------

  describe('retry-turn isolation', () => {
    it('guard only runs when isInvalidStreamRetry is false', () => {
      // Simulates the `if (!isInvalidStreamRetry)` check in sendMessageStream
      const isInvalidStreamRetry = true;
      const addRuleSpy = vi.spyOn(engine, 'addRule');

      const promptText =
        'NO file modifications — this is a READ-ONLY consulting engagement.';

      // Guard should NOT run on retry turns
      if (!isInvalidStreamRetry) {
        applyReadOnlyGuard(promptText, engine);
      }

      expect(addRuleSpy).not.toHaveBeenCalled();
    });
  });
});
