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
} from './usePhraseCycler.js';
import { INFORMATIVE_TIPS } from '../constants/tips.js';
import { WITTY_LOADING_PHRASES } from '../constants/wittyPhrases.js';
import type { LoadingPhrasesMode } from '../../config/settings.js';

// Test component to consume the hook
const TestComponent = ({
  isActive,
  isWaiting,
  isInteractiveShellWaiting = false,
  loadingPhrasesMode = 'all',
  customPhrases,
}: {
  isActive: boolean;
  isWaiting: boolean;
  isInteractiveShellWaiting?: boolean;
  loadingPhrasesMode?: LoadingPhrasesMode;
  customPhrases?: string[];
}) => {
  const phrase = usePhraseCycler(
    isActive,
    isWaiting,
    isInteractiveShellWaiting,
    loadingPhrasesMode,
    customPhrases,
  );
  return <Text>{phrase}</Text>;
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
    const { lastFrame, waitUntilReady, unmount } = render(
      <TestComponent isActive={false} isWaiting={false} />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true }).trim()).toBe('');
    unmount();
  });

  it('should show "Waiting for user confirmation..." when isWaiting is true', async () => {
    const { lastFrame, rerender, waitUntilReady, unmount } = render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    await waitUntilReady();

    await act(async () => {
      rerender(<TestComponent isActive={true} isWaiting={true} />);
    });
    await waitUntilReady();

    expect(lastFrame().trim()).toMatchSnapshot();
    unmount();
  });

  it('should show interactive shell waiting message immediately when isInteractiveShellWaiting is true', async () => {
    const { lastFrame, rerender, waitUntilReady, unmount } = render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    await waitUntilReady();

    await act(async () => {
      rerender(
        <TestComponent
          isActive={true}
          isWaiting={false}
          isInteractiveShellWaiting={true}
        />,
      );
    });
    await waitUntilReady();

    expect(lastFrame().trim()).toMatchSnapshot();
    unmount();
  });

  it('should prioritize interactive shell waiting over normal waiting immediately', async () => {
    const { lastFrame, rerender, waitUntilReady, unmount } = render(
      <TestComponent isActive={true} isWaiting={true} />,
    );
    await waitUntilReady();
    expect(lastFrame().trim()).toMatchSnapshot();

    await act(async () => {
      rerender(
        <TestComponent
          isActive={true}
          isWaiting={true}
          isInteractiveShellWaiting={true}
        />,
      );
    });
    await waitUntilReady();
    expect(lastFrame().trim()).toMatchSnapshot();
    unmount();
  });

  it('should not cycle phrases if isActive is false and not waiting', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
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

  it('should show a tip on first activation, then a witty phrase', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.99); // Subsequent phrases are witty
    const { lastFrame, waitUntilReady, unmount } = render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    await waitUntilReady();

    // Initial phrase on first activation should be a tip
    expect(INFORMATIVE_TIPS).toContain(lastFrame().trim());

    // After the first interval, it should be a witty phrase
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS + 100);
    });
    await waitUntilReady();
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame().trim());
    unmount();
  });

  it('should cycle through phrases when isActive is true and not waiting', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty for subsequent phrases
    const { lastFrame, waitUntilReady, unmount } = render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    await waitUntilReady();
    // Initial phrase on first activation will be a tip

    // After the first interval, it should follow the random pattern (witty phrases due to mock)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS + 100);
    });
    await waitUntilReady();
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame().trim());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS);
    });
    await waitUntilReady();
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame().trim());
    unmount();
  });

  it('should reset to a phrase when isActive becomes true after being false', async () => {
    const customPhrases = ['Phrase A', 'Phrase B'];
    let callCount = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      // For custom phrases, only 1 Math.random call is made per update.
      // 0 -> index 0 ('Phrase A')
      // 0.99 -> index 1 ('Phrase B')
      const val = callCount % 2 === 0 ? 0 : 0.99;
      callCount++;
      return val;
    });

    const { lastFrame, rerender, waitUntilReady, unmount } = render(
      <TestComponent
        isActive={false}
        isWaiting={false}
        customPhrases={customPhrases}
      />,
    );
    await waitUntilReady();

    // Activate -> On first activation will show tip on initial call, then first interval will use first mock value for 'Phrase A'
    await act(async () => {
      rerender(
        <TestComponent
          isActive={true}
          isWaiting={false}
          customPhrases={customPhrases}
        />,
      );
    });
    await waitUntilReady();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS); // First interval after initial state -> callCount 0 -> 'Phrase A'
    });
    await waitUntilReady();
    expect(customPhrases).toContain(lastFrame().trim()); // Should be one of the custom phrases

    // Second interval -> callCount 1 -> returns 0.99 -> 'Phrase B'
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS);
    });
    await waitUntilReady();
    expect(customPhrases).toContain(lastFrame().trim()); // Should be one of the custom phrases

    // Deactivate -> resets to undefined (empty string in output)
    await act(async () => {
      rerender(
        <TestComponent
          isActive={false}
          isWaiting={false}
          customPhrases={customPhrases}
        />,
      );
    });
    await waitUntilReady();

    // The phrase should be empty after reset
    expect(lastFrame({ allowEmpty: true }).trim()).toBe('');

    // Activate again -> this will show a tip on first activation, then cycle from where mock is
    await act(async () => {
      rerender(
        <TestComponent
          isActive={true}
          isWaiting={false}
          customPhrases={customPhrases}
        />,
      );
    });
    await waitUntilReady();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS); // First interval after re-activation -> should contain phrase
    });
    await waitUntilReady();
    expect(customPhrases).toContain(lastFrame().trim()); // Should be one of the custom phrases
    unmount();
  });

  it('should clear phrase interval on unmount when active', async () => {
    const { unmount, waitUntilReady } = render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    await waitUntilReady();

    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledOnce();
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
          loadingPhrasesMode="witty"
          customPhrases={config.customPhrases}
        />
      );
    };

    const { lastFrame, waitUntilReady, unmount } = render(<StatefulWrapper />);
    await waitUntilReady();

    // After first interval, it should use custom phrases
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS + 100);
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

    randomMock.mockReturnValue(0.99);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS);
    });
    await waitUntilReady();
    expect(customPhrases).toContain(lastFrame({ allowEmpty: true }).trim());

    // Test fallback to default phrases.
    randomMock.mockRestore();
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // Always witty

    await act(async () => {
      setStateExternally?.({
        isActive: true,
        customPhrases: [],
      });
    });
    await waitUntilReady();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS); // Wait for first cycle
    });
    await waitUntilReady();

    expect(WITTY_LOADING_PHRASES).toContain(lastFrame().trim());
    unmount();
  });

  it('should fall back to witty phrases if custom phrases are an empty array', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty for subsequent phrases
    const { lastFrame, waitUntilReady, unmount } = render(
      <TestComponent isActive={true} isWaiting={false} customPhrases={[]} />,
    );
    await waitUntilReady();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS); // Next phrase after tip
    });
    await waitUntilReady();
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame().trim());
    unmount();
  });

  it('should reset phrase when transitioning from waiting to active', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty for subsequent phrases
    const { lastFrame, rerender, waitUntilReady, unmount } = render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    await waitUntilReady();

    // Cycle to a different phrase (should be witty due to mock)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS);
    });
    await waitUntilReady();
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame().trim());

    // Go to waiting state
    await act(async () => {
      rerender(<TestComponent isActive={false} isWaiting={true} />);
    });
    await waitUntilReady();
    expect(lastFrame().trim()).toMatchSnapshot();

    // Go back to active cycling - should pick a phrase based on the logic (witty due to mock)
    await act(async () => {
      rerender(<TestComponent isActive={true} isWaiting={false} />);
    });
    await waitUntilReady();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS); // Skip the tip and get next phrase
    });
    await waitUntilReady();
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame().trim());
    unmount();
  });
});
