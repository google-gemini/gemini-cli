/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { Text } from 'ink';
import { LoadingIndicator } from './LoadingIndicator.js';
import { StreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { renderWithProviders } from '../../test-utils/render.js';

// Mock GeminiRespondingSpinner
vi.mock('./GeminiRespondingSpinner', () => ({
  GeminiRespondingSpinner: ({
    nonRespondingDisplay,
  }: {
    nonRespondingDisplay?: string;
  }) => {
    const streamingState = React.useContext(StreamingContext)!;
    if (streamingState === StreamingState.Responding) {
      return <Text>MockRespondingSpinner</Text>;
    } else if (nonRespondingDisplay) {
      return <Text>{nonRespondingDisplay}</Text>;
    }
    return null;
  },
}));

const { useTerminalSizeMock } = vi.hoisted(() => ({
  useTerminalSizeMock: vi.fn(),
}));

vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: useTerminalSizeMock,
}));

const renderWithContext = (
  ui: React.ReactElement,
  streamingStateValue: StreamingState,
  width = 120,
) => {
  useTerminalSizeMock.mockReturnValue({ columns: width, rows: 24 });
  return renderWithProviders(ui, {
    uiState: { streamingState: streamingStateValue },
    width,
  });
};

describe('<LoadingIndicator />', () => {
  it('should render blank when streamingState is Idle and no loading phrase or thought', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator currentLoadingPhrase="" elapsedTime={0} />,
      StreamingState.Idle,
    );
    await waitUntilReady();
    expect(lastFrame()).toBeNull();
    unmount();
  });

  it('should render spinner, phrase, and time when streamingState is Responding', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator currentLoadingPhrase="Loading..." elapsedTime={5} />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('MockRespondingSpinner');
    expect(output).toContain('Loading...');
    expect(output).toContain('(esc to cancel, 5s)');
    unmount();
  });

  it('should render spinner (static), phrase but no time/cancel when streamingState is WaitingForConfirmation', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator
        currentLoadingPhrase="Confirm action"
        elapsedTime={5}
        showCancelAndTimer={false}
      />,
      StreamingState.WaitingForConfirmation,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('⠏');
    expect(output).toContain('Confirm action');
    expect(output).not.toContain('(esc to cancel, 5s)');
    unmount();
  });

  it('should display the currentLoadingPhrase correctly', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator
        currentLoadingPhrase="Processing data..."
        elapsedTime={10}
      />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Processing data...');
    unmount();
  });

  it('should display the elapsedTime correctly when Responding', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator currentLoadingPhrase="Working..." elapsedTime={45} />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('(esc to cancel, 45s)');
    unmount();
  });

  it('should display the elapsedTime correctly in human-readable format', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator currentLoadingPhrase="Working..." elapsedTime={125} />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    // Reverted format check to match existing behavior (it used to be "2m 5s" but commit 57965c5 might have changed formatters too? No.)
    // Wait, 125s is 2m 5s.
    expect(lastFrame()).toContain('(esc to cancel, 2m 5s)');
    unmount();
  });

  it('should render rightContent when provided', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator
        currentLoadingPhrase="Loading..."
        elapsedTime={5}
        rightContent={<Text>Right</Text>}
      />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Right');
    unmount();
  });

  it('should prioritize thought.subject over currentLoadingPhrase', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator
        thought={{
          subject: 'Thinking about pizza',
          description: 'description',
        }}
        currentLoadingPhrase="This should not be displayed"
        elapsedTime={5}
      />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Thinking about pizza');
    expect(output).not.toContain('This should not be displayed');
    unmount();
  });

  it('should use thoughtLabel if provided', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator
        thought={{
          subject: 'Thinking about pizza',
          description: 'description',
        }}
        thoughtLabel="Food thoughts"
        currentLoadingPhrase="Loading..."
        elapsedTime={5}
      />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Food thoughts');
    expect(output).not.toContain('Thinking about pizza');
    unmount();
  });

  it('should show "Thinking..." indicator for thought-based phrases', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator
        thought={{
          subject: 'Pizza',
          description: 'description',
        }}
        currentLoadingPhrase="Tip of the day"
        elapsedTime={5}
      />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Thinking... Pizza');
    unmount();
  });

  it('should not show duplicate "Thinking..." if subject already starts with it', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator
        thought={{
          subject: 'Thinking of stuff',
          description: 'description',
        }}
        elapsedTime={5}
      />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Thinking of stuff');
    // Should NOT contain "Thinking... Thinking of stuff"
    expect(output).not.toContain('Thinking... Thinking of stuff');
    unmount();
  });

  it('should not display thought indicator for non-thought loading phrases', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator
        currentLoadingPhrase="Just a tip"
        elapsedTime={5}
        thought={null}
      />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('Just a tip');
    expect(output).not.toContain('Thinking...');
    unmount();
  });

  it('should truncate long primary text instead of wrapping', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator
        currentLoadingPhrase="This is an extremely long loading phrase that should be truncated in the UI to prevent it from wrapping to multiple lines and breaking the layout"
        elapsedTime={5}
      />,
      StreamingState.Responding,
      80,
    );
    await waitUntilReady();

    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  describe('responsive layout', () => {
    it('should render on a single line on a wide terminal', async () => {
      const { lastFrame, unmount, waitUntilReady } = renderWithContext(
        <LoadingIndicator
          currentLoadingPhrase="Loading..."
          elapsedTime={5}
          rightContent={<Text>Right</Text>}
        />,
        StreamingState.Responding,
        120,
      );
      await waitUntilReady();
      const output = lastFrame();
      // Check for single line output
      expect(output?.trim().includes('\n')).toBe(false);
      expect(output).toContain('Loading...');
      expect(output).toContain('(esc to cancel, 5s)');
      expect(output).toContain('Right');
      unmount();
    });

    it('should render on multiple lines on a narrow terminal', async () => {
      const { lastFrame, unmount, waitUntilReady } = renderWithContext(
        <LoadingIndicator
          currentLoadingPhrase="Loading..."
          elapsedTime={5}
          rightContent={<Text>Right</Text>}
        />,
        StreamingState.Responding,
        40,
      );
      await waitUntilReady();
      const output = lastFrame();
      const lines = output?.trim().split('\n');
      // Expecting 3 lines:
      // 1. Spinner + Primary Text
      // 2. Cancel + Timer
      // 3. Right Content
      expect(lines).toHaveLength(3);
      if (lines) {
        expect(lines[0]).toContain('Loading...');
        expect(lines[0]).not.toContain('(esc to cancel, 5s)');
        expect(lines[1]).toContain('(esc to cancel, 5s)');
        expect(lines[2]).toContain('Right');
      }
      unmount();
    });

    it('should use wide layout at 80 columns', async () => {
      const { lastFrame, unmount, waitUntilReady } = renderWithContext(
        <LoadingIndicator
          currentLoadingPhrase="Loading..."
          elapsedTime={5}
          rightContent={<Text>Right</Text>}
        />,
        StreamingState.Responding,
        80,
      );
      await waitUntilReady();
      expect(lastFrame()?.trim().includes('\n')).toBe(false);
      unmount();
    });

    it('should transition correctly between states', async () => {
      // Transition test requires StreamingContextProvider in the rig if we use renderWithContext which uses renderWithProviders
      // which I assume provides it.
      const { lastFrame, unmount, waitUntilReady, rerender } =
        renderWithContext(
          <LoadingIndicator currentLoadingPhrase="Initial" elapsedTime={1} />,
          StreamingState.Responding,
        );
      await waitUntilReady();
      expect(lastFrame()).toContain('Initial');

      rerender(
        <LoadingIndicator
          currentLoadingPhrase="Now Responding"
          elapsedTime={2}
        />,
      );
      await waitUntilReady();
      const output = lastFrame();
      expect(output).toContain('MockRespondingSpinner');
      expect(output).toContain('Now Responding');
      expect(output).toContain('(esc to cancel, 2s)');

      unmount();
    });
  });
});
