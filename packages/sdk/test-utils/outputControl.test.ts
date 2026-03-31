/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { TestOutputController } from './outputControl.js';

describe('TestOutputController', () => {
  it('fails passing tests that emit unexpected console output', () => {
    const controller = new TestOutputController();
    controller.startTest('src/noisy.test.ts', 'noisy test');
    controller.captureOutput('console', 'error', ['unexpected failure path']);

    const result = controller.finishTest('pass');

    expect(result.error?.message).toContain(
      'Passing test emitted unexpected output',
    );
    expect(result.error?.message).toContain('unexpected failure path');
  });

  it('allows explicitly expected console output', () => {
    const controller = new TestOutputController();
    controller.startTest('src/expected.test.ts', 'expected test');
    controller.expectOutput({
      source: 'console',
      level: 'error',
      pattern: /expected error/,
    });
    controller.captureOutput('console', 'error', ['expected error']);

    const result = controller.finishTest('pass');

    expect(result.error).toBeUndefined();
  });

  it('audits debugLogger noise without failing the test', () => {
    const controller = new TestOutputController();
    controller.startTest('src/audited.test.ts', 'audited test');
    controller.captureOutput('debugLogger', 'debug', ['Experiments loaded']);

    const result = controller.finishTest('pass');

    expect(result.error).toBeUndefined();
    expect(controller.formatAuditSummary()).toContain('src/audited.test.ts');
    expect(controller.formatAuditSummary()).toContain('Experiments loaded');
  });

  it('no-ops expectations when tracking is disabled', () => {
    const controller = new TestOutputController();
    controller.setTrackingEnabled(false);

    expect(() =>
      controller.expectOutput({
        source: 'debugLogger',
        level: 'debug',
        pattern: /ignored in verbose mode/,
      }),
    ).not.toThrow();
    expect(controller.finishTest('pass')).toEqual({ replayEntries: [] });
  });

  it('replays captured output for failing tests', () => {
    const controller = new TestOutputController();
    controller.startTest('src/failing.test.ts', 'failing test');
    controller.captureOutput('console', 'warn', ['visible on failure']);

    const result = controller.finishTest('fail');

    expect(result.replayEntries).toEqual([
      {
        source: 'console',
        level: 'warn',
        message: 'visible on failure',
      },
    ]);
  });
});
