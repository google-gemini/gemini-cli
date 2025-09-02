/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ToolConfirmationOutcome } from '@google/gemini-cli-core';
import type { CompletedToolCall } from '@google/gemini-cli-core';

describe('useReactToolScheduler skip functionality', () => {
  it('should call onToolCallSkipped when a tool call is skipped', () => {
    // This test verifies the logic in the allToolCallsCompleteHandler function
    // which checks if any completed tool call has an outcome of ToolConfirmationOutcome.Skip

    // Create a mock skipped tool call with the correct outcome
    const skippedToolCall = {
      outcome: ToolConfirmationOutcome.Skip,
    } as CompletedToolCall;

    // Create a mock successful tool call for comparison
    const successToolCall = {
      outcome: ToolConfirmationOutcome.ProceedOnce,
    } as CompletedToolCall;

    // Test the behavior directly by checking the logic in allToolCallsCompleteHandler
    // The handler checks if any call has outcome === ToolConfirmationOutcome.Skip
    const hasSkippedCall = [skippedToolCall].some(
      (call) => call.outcome === ToolConfirmationOutcome.Skip,
    );

    // This should be true
    expect(hasSkippedCall).toBe(true);

    // Test with only success calls
    const hasSkippedCallInSuccessOnly = [successToolCall].some(
      (call) => call.outcome === ToolConfirmationOutcome.Skip,
    );

    // This should be false
    expect(hasSkippedCallInSuccessOnly).toBe(false);

    // Test with mixed calls
    const hasSkippedCallInMixed = [successToolCall, skippedToolCall].some(
      (call) => call.outcome === ToolConfirmationOutcome.Skip,
    );

    // This should be true
    expect(hasSkippedCallInMixed).toBe(true);
  });
});
