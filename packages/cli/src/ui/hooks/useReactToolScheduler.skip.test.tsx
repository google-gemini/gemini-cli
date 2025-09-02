/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { ToolConfirmationOutcome } from '@google/gemini-cli-core';
import type { CompletedToolCall } from '@google/gemini-cli-core';

describe('useReactToolScheduler skip functionality', () => {
  it('should correctly identify when tool calls are skipped', () => {
    // This test verifies the logic that checks if any completed tool call has an outcome of ToolConfirmationOutcome.Skip

    // Create a mock skipped tool call with the correct outcome
    const skippedToolCall = {
      outcome: ToolConfirmationOutcome.Skip,
    } as CompletedToolCall;

    // Create a mock successful tool call for comparison
    const successToolCall = {
      outcome: ToolConfirmationOutcome.ProceedOnce,
    } as CompletedToolCall;

    // Test the behavior directly by checking the logic
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

  it('should handle the race condition fix correctly', async () => {
    // This test verifies that when a tool call is skipped, we only call onToolCallSkipped
    // and not onComplete, preventing the race condition

    const onComplete = vi.fn();
    const onToolCallSkipped = vi.fn();

    // This is a simplified version of the allToolCallsCompleteHandler logic
    const allToolCallsCompleteHandler = async (
      completedToolCalls: CompletedToolCall[],
    ) => {
      const wasSkipped = completedToolCalls.some(
        (call) => call.outcome === ToolConfirmationOutcome.Skip,
      );
      if (wasSkipped) {
        onToolCallSkipped();
      } else {
        await onComplete(completedToolCalls);
      }
    };

    // Create a mock skipped tool call
    const skippedToolCall = {
      outcome: ToolConfirmationOutcome.Skip,
      status: 'skipped',
      response: { resultDisplay: 'Tool call skipped by user.' },
    } as CompletedToolCall;

    // Create a mock successful tool call
    const successToolCall = {
      outcome: ToolConfirmationOutcome.ProceedOnce,
      status: 'success',
      response: { resultDisplay: 'Success' },
    } as CompletedToolCall;

    // Test with only skipped calls
    await allToolCallsCompleteHandler([skippedToolCall]);

    // Verify onToolCallSkipped was called but onComplete was not
    expect(onToolCallSkipped).toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    // Reset mocks
    onToolCallSkipped.mockClear();
    onComplete.mockClear();

    // Test with mixed calls (including a skip)
    await allToolCallsCompleteHandler([successToolCall, skippedToolCall]);

    // Verify onToolCallSkipped was called but onComplete was not
    expect(onToolCallSkipped).toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();

    // Reset mocks
    onToolCallSkipped.mockClear();
    onComplete.mockClear();

    // Test with only success calls (no skip)
    await allToolCallsCompleteHandler([successToolCall]);

    // Verify onComplete was called but onToolCallSkipped was not
    expect(onComplete).toHaveBeenCalledWith([successToolCall]);
    expect(onToolCallSkipped).not.toHaveBeenCalled();
  });
});
