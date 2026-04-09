/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { render } from '../../test-utils/render.js';
import { Text } from 'ink';
import {
  usePhraseCycler,
  PHRASE_CHANGE_INTERVAL_MS,
  INTERACTIVE_SHELL_WAITING_PHRASE,
} from './usePhraseCycler.js';
import { INFORMATIVE_TIPS } from '../constants/tips.js';
import { WITTY_LOADING_PHRASES } from '../constants/wittyPhrases.js';

// Test component to consume the hook
const TestComponent = ({
  isActive,
  isWaiting,
  shouldShowFocusHint = false,
  showTips = true,
  showWit = true,
  customPhrases,
}: {
  isActive: boolean;
  isWaiting: boolean;
  shouldShowFocusHint?: boolean;
  showTips?: boolean;
  showWit?: boolean;
  customPhrases?: string[];
}) => {
  const { currentTip, currentWittyPhrase } = usePhraseCycler(
    isActive,
    isWaiting,
    shouldShowFocusHint,
    showTips,
    showWit,
    customPhrases,
  );
  // For tests, we'll combine them to verify existence
  return (
    <Text>{[currentTip, currentWittyPhrase].filter(Boolean).join(' | ')}</Text>
  );
};

describe('usePhraseCycler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should initialize with an empty string when not active and not waiting', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { lastFrame, unmount, waitUntilReady } = await render(
      <TestComponent isActive={false} isWaiting={false} />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true }).trim()).toBe('');
    unmount();
  });

  it('should show "Waiting for user confirmation..." when isWaiting is true', async () => {
    const { lastFrame, rerender, waitUntilReady, unmount } = await render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    await waitUntilReady();

    await act(async () => {
      rerender(<TestComponent isActive={true} isWaiting={true} />);
    });
    await waitUntilReady();

    expect(lastFrame().trim()).toBe('Waiting for user confirmation...');
    unmount();
  });

  it('should show interactive shell waiting message immediately when shouldShowFocusHint is true', async () => {
    const { lastFrame, rerender, waitUntilReady, unmount } = await render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    await waitUntilReady();

    await act(async () => {
      rerender(
        <TestComponent
          isActive={true}
          isWaiting={false}
          shouldShowFocusHint={true}
        />,
      );
    });
    await waitUntilReady();

    expect(lastFrame().trim()).toBe(INTERACTIVE_SHELL_WAITING_PHRASE);
    unmount();
  });

  it('should prioritize interactive shell waiting over normal waiting immediately', async () => {
    const { lastFrame, rerender, waitUntilReady, unmount } = await render(
      <TestComponent isActive={true} isWaiting={true} />,
    );
    await waitUntilReady();
    expect(lastFrame().trim()).toBe('Waiting for user confirmation...');

    await act(async () => {
      rerender(
        <TestComponent
          isActive={true}
          isWaiting={true}
          shouldShowFocusHint={true}
        />,
      );
    });
    await waitUntilReady();
    expect(lastFrame().trim()).toBe(INTERACTIVE_SHELL_WAITING_PHRASE);
    unmount();
  });

  it('should not cycle phrases if isActive is false and not waiting', async () => {
    const { lastFrame, waitUntilReady, unmount } = await render(
      <TestComponent isActive={false} isWaiting={false} />,
    );
    await waitUntilReady();
    const initialPhrase = lastFrame({ allowEmpty: true }).trim();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS * 2);
    });
    await waitUntilReady();

    expect(lastFrame({ allowEmpty: true }).trim()).toBe(initialPhrase);
    unmount();
  });

  it('should show both a tip and a witty phrase when both are enabled', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5);
    const { lastFrame, waitUntilReady, unmount } = await render(
      <TestComponent
        isActive={true}
        isWaiting={false}
        showTips={true}
        showWit={true}
      />,
    );
    await waitUntilReady();

    // In the new logic, both are selected independently if enabled.
    const frame = lastFrame().trim();
    const parts = frame.split(' | ');
    expect(parts).toHaveLength(2);
    expect(INFORMATIVE_TIPS).toContain(parts[0]);
    expect(WITTY_LOADING_PHRASES).toContain(parts[1]);
    unmount();
  });

  it('should cycle through phrases when isActive is true and not waiting', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5);
    const { lastFrame, waitUntilReady, unmount } = await render(
      <TestComponent
        isActive={true}
        isWaiting={false}
        showTips={true}
        showWit={true}
      />,
    );
    await waitUntilReady();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS + 100);
    });
    await waitUntilReady();
    const frame = lastFrame().trim();
    const parts = frame.split(' | ');
    expect(parts).toHaveLength(2);
    expect(INFORMATIVE_TIPS).toContain(parts[0]);
    expect(WITTY_LOADING_PHRASES).toContain(parts[1]);

    unmount();
  });

  it('should reset to phrases when isActive becomes true after being false', async () => {
    const customPhrases = ['Phrase A', 'Phrase B'];
    let callCount = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      const val = callCount % 2 === 0 ? 0 : 0.99;
      callCount++;
      return val;
    });

    const { lastFrame, rerender, waitUntilReady, unmount } = await render(
      <TestComponent
        isActive={false}
        isWaiting={false}
        customPhrases={customPhrases}
        showWit={true}
        showTips={false}
      />,
    );
    await waitUntilReady();

    // Activate
    await act(async () => {
      rerender(
        <TestComponent
          isActive={true}
          isWaiting={false}
          customPhrases={customPhrases}
          showWit={true}
          showTips={false}
        />,
      );
    });
    await waitUntilReady();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await waitUntilReady();
    expect(customPhrases).toContain(lastFrame().trim());

    // Deactivate -> resets to undefined (empty string in output)
    await act(async () => {
      rerender(
        <TestComponent
          isActive={false}
          isWaiting={false}
          customPhrases={customPhrases}
          showWit={true}
          showTips={false}
        />,
      );
    });
    await waitUntilReady();

    // The phrase should be empty after reset
    expect(lastFrame({ allowEmpty: true }).trim()).toBe('');
    unmount();
  });

  it('should clear phrase interval on unmount when active', async () => {
    const { unmount, waitUntilReady } = await render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    await waitUntilReady();

    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('should use custom phrases when provided', async () => {
    const customPhrases = ['Custom Phrase 1', 'Custom Phrase 2'];
    const randomMock = vi.spyOn(Math, 'random');

    let setStateExternally:
      | React.Dispatch<
          React.SetStateAction<{
            isActive: boolean;
            customPhrases?: string[];
          }>
        >
      | undefined;

    const StatefulWrapper = () => {
      const [config, setConfig] = React.useState<{
        isActive: boolean;
        customPhrases?: string[];
      }>({
        isActive: true,
        customPhrases,
      });
      setStateExternally = setConfig;
      return (
        <TestComponent
          isActive={config.isActive}
          isWaiting={false}
          showTips={false}
          showWit={true}
          customPhrases={config.customPhrases}
        />
      );
    };

    const { lastFrame, unmount, waitUntilReady } = await render(
      <StatefulWrapper />,
    );
    await waitUntilReady();

    // After first interval, it should use custom phrases
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await waitUntilReady();

    randomMock.mockReturnValue(0);
    await act(async () => {
      setStateExternally?.({
        isActive: true,
        customPhrases,
      });
    });
    await waitUntilReady();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS + 100);
    });
    await waitUntilReady();
    expect(customPhrases).toContain(lastFrame({ allowEmpty: true }).trim());

    unmount();
  });

  it('should fall back to witty phrases if custom phrases are an empty array', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5);
    const { lastFrame, waitUntilReady, unmount } = await render(
      <TestComponent
        isActive={true}
        isWaiting={false}
        showTips={false}
        showWit={true}
        customPhrases={[]}
      />,
    );
    await waitUntilReady();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await waitUntilReady();
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame().trim());
    unmount();
  });
});
