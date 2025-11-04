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
  WITTY_LOADING_PHRASES,
  PHRASE_CHANGE_INTERVAL_MS,
} from './usePhraseCycler.js';

// Test component to consume the hook
const TestComponent = ({
  isActive,
  isWaiting,
  customPhrases,
}: {
  isActive: boolean;
  isWaiting: boolean;
  customPhrases?: string[];
}) => {
  const phrase = usePhraseCycler(isActive, isWaiting, customPhrases);
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

  it('should cycle through witty phrases when isActive is true and not waiting', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { lastFrame } = render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    // Initial phrase should be one of the witty phrases
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame());

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

    // Activate -> callCount 0 -> returns 0 -> 'Phrase A'
    rerender(
      <TestComponent
        isActive={true}
        isWaiting={false}
        customPhrases={customPhrases}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(lastFrame()).toBe('Phrase A');

    // Interval -> callCount 1 -> returns 0.99 -> 'Phrase B'
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS);
    });
    expect(lastFrame()).toBe('Phrase B');

    // Deactivate -> resets to customPhrases[0] -> 'Phrase A'
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
    expect(lastFrame()).toBe('Phrase A');

    // Activate again -> callCount 2 -> returns 0 -> 'Phrase A'
    rerender(
      <TestComponent
        isActive={true}
        isWaiting={false}
        customPhrases={customPhrases}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(lastFrame()).toBe('Phrase A');
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
    randomMock.mockReturnValue(0);

    const { lastFrame, rerender } = render(
      <TestComponent
        isActive={true}
        isWaiting={false}
        customPhrases={customPhrases}
      />,
    );

    expect(lastFrame()).toBe('Custom Phrase 1');

    randomMock.mockReturnValue(0.99);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PHRASE_CHANGE_INTERVAL_MS + 100);
    });

    expect(lastFrame()).toBe('Custom Phrase 2');

    // Test fallback to default phrases.
    randomMock.mockRestore();
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // Always witty

    rerender(
      <TestComponent isActive={true} isWaiting={false} customPhrases={[]} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(WITTY_LOADING_PHRASES).toContain(lastFrame());
  });

  it('should fall back to witty phrases if custom phrases are an empty array', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { lastFrame } = render(
      <TestComponent isActive={true} isWaiting={false} customPhrases={[]} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(WITTY_LOADING_PHRASES).toContain(lastFrame());
  });

  it('should reset to a witty phrase when transitioning from waiting to active', async () => {
    vi.spyOn(Math, 'random').mockImplementation(() => 0.5); // Always witty
    const { lastFrame, rerender } = render(
      <TestComponent isActive={true} isWaiting={false} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(WITTY_LOADING_PHRASES).toContain(lastFrame());

    // Cycle to a different phrase (potentially)
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

    // Go back to active cycling - should pick a random witty phrase
    rerender(<TestComponent isActive={true} isWaiting={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(WITTY_LOADING_PHRASES).toContain(lastFrame());
  });
});
