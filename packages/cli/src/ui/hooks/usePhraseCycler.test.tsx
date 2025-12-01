/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
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
  isInteractiveShellWaiting = false,
  lastOutputTime = 0,
  customPhrases,
}: {
  isActive: boolean;
  isWaiting: boolean;
  isInteractiveShellWaiting?: boolean;
  lastOutputTime?: number;
  customPhrases?: string[];
}) => {
  const phrase = usePhraseCycler(
    isActive,
    isWaiting,
    isInteractiveShellWaiting,
    lastOutputTime,
    customPhrases,
  );
  return <Text>{phrase}</Text>;
};

describe('usePhraseCycler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with a witty phrase when not active and not waiting', () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { lastFrame } = render(
      <TestComponent isActive={false} isWaiting={false} />,
    );
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame());
  });

  it('should show "Waiting for user confirmation..." when isWaiting is true', async () => {
    const { lastFrame, rerender } = render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    rerender(<TestComponent isActive={true} isWaiting={true} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(lastFrame()).toBe('Waiting for user confirmation...');
  });

  it('should show interactive shell waiting message when isInteractiveShellWaiting is true after 5s', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { lastFrame, rerender } = render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    rerender(
      <TestComponent
        isActive={true}
        isWaiting={false}
        isInteractiveShellWaiting={true}
        lastOutputTime={1}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // Should still be showing a witty phrase or tip initially
    expect([...WITTY_LOADING_PHRASES, ...INFORMATIVE_TIPS]).toContain(
      lastFrame(),
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(lastFrame()).toBe(INTERACTIVE_SHELL_WAITING_PHRASE);
  });

  it('should reset interactive shell waiting timer when lastOutputTime changes', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { lastFrame, rerender } = render(
      <TestComponent
        isActive={true}
        isWaiting={false}
        isInteractiveShellWaiting={true}
        lastOutputTime={1000}
      />,
    );

    // Advance 3 seconds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    // Should still be witty phrase or tip
    expect([...WITTY_LOADING_PHRASES, ...INFORMATIVE_TIPS]).toContain(
      lastFrame(),
    );

    // Update lastOutputTime
    rerender(
      <TestComponent
        isActive={true}
        isWaiting={false}
        isInteractiveShellWaiting={true}
        lastOutputTime={4000}
      />,
    );

    // Advance another 3 seconds (total 6s from start, but only 3s from last output)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    // Should STILL be witty phrase or tip because timer reset
    expect([...WITTY_LOADING_PHRASES, ...INFORMATIVE_TIPS]).toContain(
      lastFrame(),
    );

    // Advance another 2 seconds (total 5s from last output)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(lastFrame()).toBe(INTERACTIVE_SHELL_WAITING_PHRASE);
  });

  it('should prioritize interactive shell waiting over normal waiting after 5s', async () => {
    const { lastFrame, rerender } = render(
      <TestComponent isActive={true} isWaiting={true} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(lastFrame()).toBe('Waiting for user confirmation...');

    rerender(
      <TestComponent
        isActive={true}
        isWaiting={true}
        isInteractiveShellWaiting={true}
        lastOutputTime={1}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(lastFrame()).toBe(INTERACTIVE_SHELL_WAITING_PHRASE);
  });

  it('should not cycle phrases if isActive is false and not waiting', async () => {
    const { lastFrame } = render(
      <TestComponent isActive={false} isWaiting={false} />,
    );
    const initialPhrase = lastFrame();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS * 2);
    });
    expect(lastFrame()).toBe(initialPhrase);
  });

  it('should show a tip on first activation, then a witty phrase', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.99); // Subsequent phrases are witty
    const { lastFrame } = render(
      <TestComponent isActive={true} isWaiting={false} />,
    );

    // Initial phrase on first activation should be a tip
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(INFORMATIVE_TIPS).toContain(lastFrame());

    // After the first interval, it should be a witty phrase
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS + 100);
    });
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame());
  });

  it('should cycle through phrases when isActive is true and not waiting', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty for subsequent phrases
    const { lastFrame } = render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    // Initial phrase on first activation will be a tip, not necessarily from witty phrases
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // First activation shows a tip, so we can't guarantee it's in WITTY_LOADING_PHRASES

    // After the first interval, it should follow the random pattern (witty phrases due to mock)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS + 100);
    });
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS);
    });
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame());
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

    const { lastFrame, rerender } = render(
      <TestComponent
        isActive={false}
        isWaiting={false}
        customPhrases={customPhrases}
      />,
    );

    // Activate -> On first activation will show tip on initial call, then first interval will use first mock value for 'Phrase A'
    rerender(
      <TestComponent
        isActive={true}
        isWaiting={false}
        customPhrases={customPhrases}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS); // First interval after initial state -> callCount 0 -> 'Phrase A'
    });
    expect(customPhrases).toContain(lastFrame()); // Should be one of the custom phrases

    // Second interval -> callCount 1 -> returns 0.99 -> 'Phrase B'
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS);
    });
    expect(customPhrases).toContain(lastFrame()); // Should be one of the custom phrases

    // Deactivate -> resets to first phrase in sequence
    rerender(
      <TestComponent
        isActive={false}
        isWaiting={false}
        customPhrases={customPhrases}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // The phrase should be the first phrase after reset
    expect(customPhrases).toContain(lastFrame());

    // Activate again -> this will show a tip on first activation, then cycle from where mock is
    rerender(
      <TestComponent
        isActive={true}
        isWaiting={false}
        customPhrases={customPhrases}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS); // First interval after re-activation -> should contain phrase
    });
    expect(customPhrases).toContain(lastFrame()); // Should be one of the custom phrases
  });

  it('should clear phrase interval on unmount when active', () => {
    const { unmount } = render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledOnce();
  });

  it('should use custom phrases when provided', async () => {
    const customPhrases = ['Custom Phrase 1', 'Custom Phrase 2'];
    const randomMock = vi.spyOn(Math, 'random');

    const { lastFrame, rerender } = render(
      <TestComponent
        isActive={true}
        isWaiting={false}
        customPhrases={customPhrases}
      />,
    );

    // After first interval, it should use custom phrases
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS + 100);
    });

    randomMock.mockReturnValue(0);
    rerender(
      <TestComponent
        isActive={true}
        isWaiting={false}
        customPhrases={customPhrases}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS + 100);
    });
    expect(customPhrases).toContain(lastFrame());

    randomMock.mockReturnValue(0.99);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS);
    });
    expect(customPhrases).toContain(lastFrame());

    // Test fallback to default phrases.
    randomMock.mockRestore();
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // Always witty

    rerender(
      <TestComponent isActive={true} isWaiting={false} customPhrases={[]} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS); // Wait for first cycle
    });

    expect(WITTY_LOADING_PHRASES).toContain(lastFrame());
  });

  it('should fall back to witty phrases if custom phrases are an empty array', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty for subsequent phrases
    const { lastFrame } = render(
      <TestComponent isActive={true} isWaiting={false} customPhrases={[]} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // First activation will be a tip
    });
    // First activation shows a tip, so we can't guarantee it's in WITTY_LOADING_PHRASES

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS); // Next phrase after tip
    });
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame());
  });

  it('should reset phrase when transitioning from waiting to active', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty for subsequent phrases
    const { lastFrame, rerender } = render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // First activation will be a tip
    });
    // First activation shows a tip, so we can't guarantee it's in WITTY_LOADING_PHRASES

    // Cycle to a different phrase (should be witty due to mock)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS);
    });
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame());

    // Go to waiting state
    rerender(<TestComponent isActive={false} isWaiting={true} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(lastFrame()).toBe('Waiting for user confirmation...');

    // Go back to active cycling - should pick a phrase based on the logic (witty due to mock)
    rerender(<TestComponent isActive={true} isWaiting={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS); // Skip the tip and get next phrase
    });
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame());
  });
});
