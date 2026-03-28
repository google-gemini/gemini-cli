/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  ToolCallDecision,
  getDecisionFromOutcome,
} from './tool-call-decision.js';
import { ToolConfirmationOutcome } from '../tools/tools.js';

describe('getDecisionFromOutcome', () => {
  it('should map ProceedOnce to ACCEPT', () => {
    expect(getDecisionFromOutcome(ToolConfirmationOutcome.ProceedOnce)).toBe(
      ToolCallDecision.ACCEPT,
    );
  });

  it('should map ProceedAlways to AUTO_ACCEPT', () => {
    expect(getDecisionFromOutcome(ToolConfirmationOutcome.ProceedAlways)).toBe(
      ToolCallDecision.AUTO_ACCEPT,
    );
  });

  it('should map ProceedAlwaysAndSave to AUTO_ACCEPT', () => {
    expect(
      getDecisionFromOutcome(ToolConfirmationOutcome.ProceedAlwaysAndSave),
    ).toBe(ToolCallDecision.AUTO_ACCEPT);
  });

  it('should map ProceedAlwaysServer to AUTO_ACCEPT', () => {
    expect(
      getDecisionFromOutcome(ToolConfirmationOutcome.ProceedAlwaysServer),
    ).toBe(ToolCallDecision.AUTO_ACCEPT);
  });

  it('should map ProceedAlwaysTool to AUTO_ACCEPT', () => {
    expect(
      getDecisionFromOutcome(ToolConfirmationOutcome.ProceedAlwaysTool),
    ).toBe(ToolCallDecision.AUTO_ACCEPT);
  });

  it('should map ModifyWithEditor to MODIFY', () => {
    expect(
      getDecisionFromOutcome(ToolConfirmationOutcome.ModifyWithEditor),
    ).toBe(ToolCallDecision.MODIFY);
  });

  it('should map Cancel to REJECT', () => {
    expect(getDecisionFromOutcome(ToolConfirmationOutcome.Cancel)).toBe(
      ToolCallDecision.REJECT,
    );
  });

  it('should default unknown outcomes to REJECT for forward-compatibility', () => {
    expect(
      getDecisionFromOutcome(
        'unknown_future_outcome' as ToolConfirmationOutcome,
      ),
    ).toBe(ToolCallDecision.REJECT);
  });
});
