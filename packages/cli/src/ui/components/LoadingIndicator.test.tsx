/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import { Text } from 'ink';
import { LoadingIndicator } from './LoadingIndicator.js';
import { StreamingContext } from '../contexts/StreamingContext.js';
import { StreamingState } from '../types.js';
import { vi, describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';

// Mock GeminiRespondingSpinner
vi.mock('./GeminiRespondingSpinner', () => ({
  GeminiRespondingSpinner: ({
    nonRespondingDisplay,
  }: {
    nonRespondingDisplay?: string;
  }) => (
    <Text>
      {nonRespondingDisplay ? nonRespondingDisplay : 'MockRespondingSpinner'}
    </Text>
  ),
}));

const { useTerminalSizeMock } = vi.hoisted(() => ({
  useTerminalSizeMock: vi.fn().mockReturnValue({ columns: 80, rows: 24 }),
}));

vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: useTerminalSizeMock,
}));

const renderWithContext = (
  ui: React.ReactElement,
  state: StreamingState,
  terminalWidth: number = 80,
) => {
  useTerminalSizeMock.mockReturnValue({ columns: terminalWidth, rows: 24 });
  return renderWithProviders(
    <StreamingContext.Provider value={state}>{ui}</StreamingContext.Provider>,
    {
      uiState: { streamingState: state },
      width: terminalWidth,
    },
  );
};

describe('<LoadingIndicator />', () => {
  const defaultProps = {
    currentLoadingPhrase: 'Loading...',
    elapsedTime: 5,
  };

  it('should render correctly in Responding state', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator {...defaultProps} />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]|MockRespondingSpinner/);
    expect(output).toContain('Loading...');
    expect(output).toContain('(esc to cancel, 5s)');
    unmount();
  });

  it('should display the elapsedTime correctly', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator currentLoadingPhrase="Working..." elapsedTime={45} />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('(esc to cancel, 45s)');
    unmount();
  });

  it('should display the elapsedTime correctly in human-readable format', async () => {
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator currentLoadingPhrase="Working..." elapsedTime={125} />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).toContain('(esc to cancel, 2m 5s)');
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
    const frame = lastFrame();
    expect(frame.length).toBeLessThan(200);
    expect(frame).toContain('This is an extremely long loading');
    unmount();
  });

  it('should suppress all text when suppressText is true', async () => {
    const props = {
      thought: {
        subject: 'Secret thought',
        description: 'description',
      },
      currentLoadingPhrase: 'Tip of the day',
      elapsedTime: 5,
      suppressText: true,
    };
    const { lastFrame, unmount, waitUntilReady } = renderWithContext(
      <LoadingIndicator {...props} />,
      StreamingState.Responding,
    );
    await waitUntilReady();
    const output = lastFrame();
    expect(output).not.toContain('Secret thought');
    expect(output).not.toContain('Tip of the day');
    expect(output).toContain('(esc to cancel, 5s)');
    unmount();
  });

  describe('layout', () => {
    it('should render correctly on wide terminal', async () => {
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
      const output = lastFrame();
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
      expect(lines.length).toBeGreaterThanOrEqual(2);
      unmount();
    });

    it('should transition correctly between states', async () => {
      let setTestState: React.Dispatch<
        React.SetStateAction<{
          state: StreamingState;
          phrase: string;
          elapsedTime: number;
        }>
      >;

      const TestWrapper = () => {
        const [config, setConfig] = React.useState({
          state: StreamingState.Responding,
          phrase: 'Initial',
          elapsedTime: 1,
        });
        setTestState = setConfig;

        return (
          <StreamingContext.Provider value={config.state}>
            <LoadingIndicator
              currentLoadingPhrase={config.phrase}
              elapsedTime={config.elapsedTime}
            />
          </StreamingContext.Provider>
        );
      };

      const { lastFrame, unmount, waitUntilReady } = renderWithProviders(
        <TestWrapper />,
      );
      await waitUntilReady();
      expect(lastFrame()).toContain('Initial');

      await act(async () => {
        setTestState({
          state: StreamingState.Responding,
          phrase: 'Now Responding',
          elapsedTime: 2,
        });
      });

      await waitUntilReady();
      const output = lastFrame();
      expect(output).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]|MockRespondingSpinner/);
      expect(output).toContain('Now Responding');
      expect(output).toContain('(esc to cancel, 2s)');

      unmount();
    });
  });
});
