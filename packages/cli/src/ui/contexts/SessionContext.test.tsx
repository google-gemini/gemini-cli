/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type MutableRefObject } from 'react';
import { render } from 'ink-testing-library';
import { act } from 'react-dom/test-utils';
import { SessionStatsProvider, useSessionStats } from './SessionContext.js';
import { describe, it, expect, vi } from 'vitest';
import { GenerateContentResponseUsageMetadata } from '@google/genai';

// Mock data that simulates what the Gemini API would return.
const mockMetadata1: GenerateContentResponseUsageMetadata = {
  promptTokenCount: 100,
  candidatesTokenCount: 200,
  totalTokenCount: 300,
  cachedContentTokenCount: 50,
  toolUsePromptTokenCount: 10,
  thoughtsTokenCount: 20,
};

const mockMetadata2: GenerateContentResponseUsageMetadata = {
  promptTokenCount: 10,
  candidatesTokenCount: 20,
  totalTokenCount: 30,
  cachedContentTokenCount: 5,
  toolUsePromptTokenCount: 1,
  thoughtsTokenCount: 2,
};

/**
 * A test harness component that uses the hook and exposes the context value
 * via a mutable ref. This allows us to interact with the context's functions
 * and assert against its state directly in our tests.
 */
const TestHarness = ({
  contextRef,
}: {
  contextRef: MutableRefObject<ReturnType<typeof useSessionStats> | undefined>;
}) => {
  contextRef.current = useSessionStats();
  return null;
};

describe('SessionStatsContext', () => {
  it('should provide the correct initial state', () => {
    const contextRef: MutableRefObject<
      ReturnType<typeof useSessionStats> | undefined
    > = { current: undefined };

    render(
      <SessionStatsProvider>
        <TestHarness contextRef={contextRef} />
      </SessionStatsProvider>,
    );

    const stats = contextRef.current?.stats;

    expect(stats?.sessionStartTime).toBeInstanceOf(Date);
    expect(stats?.currentTurn).toBeDefined();
    expect(stats?.cumulative.turnCount).toBe(0);
    expect(stats?.cumulative.totalTokenCount).toBe(0);
    expect(stats?.cumulative.promptTokenCount).toBe(0);
  });

  it('should increment turnCount when startNewTurn is called', () => {
    const contextRef: MutableRefObject<
      ReturnType<typeof useSessionStats> | undefined
    > = { current: undefined };

    render(
      <SessionStatsProvider>
        <TestHarness contextRef={contextRef} />
      </SessionStatsProvider>,
    );

    act(() => {
      contextRef.current?.startNewTurn();
    });

    const stats = contextRef.current?.stats;
    expect(stats?.currentTurn.totalTokenCount).toBe(0);
    expect(stats?.cumulative.turnCount).toBe(1);
    // Ensure token counts are unaffected
    expect(stats?.cumulative.totalTokenCount).toBe(0);
  });

  it('should aggregate token usage correctly when addUsage is called', () => {
    const contextRef: MutableRefObject<
      ReturnType<typeof useSessionStats> | undefined
    > = { current: undefined };

    render(
      <SessionStatsProvider>
        <TestHarness contextRef={contextRef} />
      </SessionStatsProvider>,
    );

    act(() => {
      contextRef.current?.addUsage({ ...mockMetadata1, apiTimeMs: 123 });
    });

    const stats = contextRef.current?.stats;

    // Check that token counts are updated
    expect(stats?.cumulative.totalTokenCount).toBe(
      mockMetadata1.totalTokenCount ?? 0,
    );
    expect(stats?.cumulative.promptTokenCount).toBe(
      mockMetadata1.promptTokenCount ?? 0,
    );
    expect(stats?.cumulative.apiTimeMs).toBe(123);

    // Check that turn count is NOT incremented
    expect(stats?.cumulative.turnCount).toBe(0);

    // Check that currentTurn is updated
    expect(stats?.currentTurn?.totalTokenCount).toEqual(
      mockMetadata1.totalTokenCount,
    );
    expect(stats?.currentTurn?.apiTimeMs).toBe(123);
  });

  it('should correctly track a full logical turn with multiple API calls', () => {
    const contextRef: MutableRefObject<
      ReturnType<typeof useSessionStats> | undefined
    > = { current: undefined };

    render(
      <SessionStatsProvider>
        <TestHarness contextRef={contextRef} />
      </SessionStatsProvider>,
    );

    // 1. User starts a new turn
    act(() => {
      contextRef.current?.startNewTurn();
    });

    // 2. First API call (e.g., prompt with a tool request)
    act(() => {
      contextRef.current?.addUsage({ ...mockMetadata1, apiTimeMs: 100 });
    });

    // 3. Second API call (e.g., sending tool response back)
    act(() => {
      contextRef.current?.addUsage({ ...mockMetadata2, apiTimeMs: 50 });
    });

    const stats = contextRef.current?.stats;

    // Turn count should only be 1
    expect(stats?.cumulative.turnCount).toBe(1);

    // --- Check Cumulative Stats ---
    // These fields should be the SUM of both calls
    expect(stats?.cumulative.totalTokenCount).toBe(300 + 30);
    expect(stats?.cumulative.candidatesTokenCount).toBe(200 + 20);
    expect(stats?.cumulative.thoughtsTokenCount).toBe(20 + 2);
    expect(stats?.cumulative.apiTimeMs).toBe(100 + 50);

    // These fields should be the SUM of both calls
    expect(stats?.cumulative.promptTokenCount).toBe(100 + 10);
    expect(stats?.cumulative.cachedContentTokenCount).toBe(50 + 5);
    expect(stats?.cumulative.toolUsePromptTokenCount).toBe(10 + 1);

    // --- Check Current Turn Stats ---
    // All fields should be the SUM of both calls for the turn
    expect(stats?.currentTurn.totalTokenCount).toBe(300 + 30);
    expect(stats?.currentTurn.candidatesTokenCount).toBe(200 + 20);
    expect(stats?.currentTurn.thoughtsTokenCount).toBe(20 + 2);
    expect(stats?.currentTurn.promptTokenCount).toBe(100 + 10);
    expect(stats?.currentTurn.cachedContentTokenCount).toBe(50 + 5);
    expect(stats?.currentTurn.toolUsePromptTokenCount).toBe(10 + 1);
    expect(stats?.currentTurn.apiTimeMs).toBe(100 + 50);
  });

  it('should overwrite currentResponse with each API call', () => {
    const contextRef: MutableRefObject<
      ReturnType<typeof useSessionStats> | undefined
    > = { current: undefined };

    render(
      <SessionStatsProvider>
        <TestHarness contextRef={contextRef} />
      </SessionStatsProvider>,
    );

    // 1. First API call
    act(() => {
      contextRef.current?.addUsage({ ...mockMetadata1, apiTimeMs: 100 });
    });

    let stats = contextRef.current?.stats;

    // currentResponse should match the first call
    expect(stats?.currentResponse.totalTokenCount).toBe(300);
    expect(stats?.currentResponse.apiTimeMs).toBe(100);

    // 2. Second API call
    act(() => {
      contextRef.current?.addUsage({ ...mockMetadata2, apiTimeMs: 50 });
    });

    stats = contextRef.current?.stats;

    // currentResponse should now match the second call
    expect(stats?.currentResponse.totalTokenCount).toBe(30);
    expect(stats?.currentResponse.apiTimeMs).toBe(50);

    // 3. Start a new turn
    act(() => {
      contextRef.current?.startNewTurn();
    });

    stats = contextRef.current?.stats;

    // currentResponse should be reset
    expect(stats?.currentResponse.totalTokenCount).toBe(0);
    expect(stats?.currentResponse.apiTimeMs).toBe(0);
  });

  it('should throw an error when useSessionStats is used outside of a provider', () => {
    // Suppress the expected console error during this test.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const contextRef = { current: undefined };

    // We expect rendering to fail, which React will catch and log as an error.
    render(<TestHarness contextRef={contextRef} />);

    // Assert that the first argument of the first call to console.error
    // contains the expected message. This is more robust than checking
    // the exact arguments, which can be affected by React/JSDOM internals.
    expect(errorSpy.mock.calls[0][0]).toContain(
      'useSessionStats must be used within a SessionStatsProvider',
    );

    errorSpy.mockRestore();
  });
});
