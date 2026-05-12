/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  AutopilotCommandDecision,
  evaluateAutopilotCommand,
} from './autopilot-command-gate.js';

const mission = 'fix README typo without touching core';

function decision(command: string): AutopilotCommandDecision {
  return evaluateAutopilotCommand({ mission, command }).decision;
}

describe('evaluateAutopilotCommand', () => {
  it('suppresses broad ritual commands', () => {
    expect(decision('npm run format')).toBe(AutopilotCommandDecision.SUPPRESS);
    expect(decision('npm test')).toBe(AutopilotCommandDecision.SUPPRESS);
  });

  it('suppresses protected-zone core diffs for a no-core mission', () => {
    expect(decision('git diff packages/core')).toBe(
      AutopilotCommandDecision.SUPPRESS,
    );
  });

  it('allows safe local diff inspection', () => {
    expect(decision('git diff')).toBe(AutopilotCommandDecision.ALLOW);
  });

  it('denies destructive or remote-mutating commands', () => {
    expect(decision('git push')).toBe(AutopilotCommandDecision.DENY);
    expect(decision('rm -rf dist')).toBe(AutopilotCommandDecision.DENY);
  });
});
