/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { Scrollable } from './Scrollable.js';
import { Text } from 'ink';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ScrollProviderModule from '../../contexts/ScrollProvider.js';
import { act } from 'react';

vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    getInnerHeight: vi.fn(() => 5),
    getScrollHeight: vi.fn(() => 10),
    getBoundingBox: vi.fn(() => ({ x: 0, y: 0, width: 10, height: 5 })),
  };
});

vi.mock('../../hooks/useAnimatedScrollbar.js', () => ({
  useAnimatedScrollbar: (
    hasFocus: boolean,
    scrollBy: (delta: number) => void,
  ) => ({
    scrollbarColor: 'white',
    flashScrollbar: vi.fn(),
    scrollByWithAnimation: scrollBy,
  }),
}));

describe('<Scrollable />', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Scrollable hasFocus={false} height={5}>
        <Text>Hello World</Text>
      </Scrollable>,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Hello World');
    unmount();
  });

  it('renders multiple children', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Scrollable hasFocus={false} height={5}>
        <Text>Line 1</Text>
        <Text>Line 2</Text>
        <Text>Line 3</Text>
      </Scrollable>,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Line 1');
    expect(lastFrame()).toContain('Line 2');
    expect(lastFrame()).toContain('Line 3');
    unmount();
  });

  it('matches snapshot', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <Scrollable hasFocus={false} height={5}>
        <Text>Line 1</Text>
        <Text>Line 2</Text>
        <Text>Line 3</Text>
      </Scrollable>,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('updates scroll position correctly when scrollBy is called multiple times in the same tick', async () => {
    let capturedEntry: ScrollProviderModule.ScrollableEntry | undefined;
    vi.spyOn(ScrollProviderModule, 'useScrollable').mockImplementation(
      async (entry, isActive) => {
        if (isActive) {
          capturedEntry = entry as ScrollProviderModule.ScrollableEntry;
        }
      },
    );

    const { waitUntilReady, unmount } = renderWithProviders(
      <Scrollable hasFocus={true} height={5}>
        <Text>Line 1</Text>
        <Text>Line 2</Text>
        <Text>Line 3</Text>
        <Text>Line 4</Text>
        <Text>Line 5</Text>
        <Text>Line 6</Text>
        <Text>Line 7</Text>
        <Text>Line 8</Text>
        <Text>Line 9</Text>
        <Text>Line 10</Text>
      </Scrollable>,
    );
    await waitUntilReady();

    expect(capturedEntry).toBeDefined();

    if (!capturedEntry) {
      throw new Error('capturedEntry is undefined');
    }

    // Initial state (starts at top by default)
    expect(capturedEntry.getScrollState().scrollTop).toBe(0);

    // Initial state with scrollToBottom={true}
    unmount();
    const { waitUntilReady: waitUntilReady2, unmount: unmount2 } =
      renderWithProviders(
        <Scrollable hasFocus={true} height={5} scrollToBottom={true}>
          <Text>Line 1</Text>
          <Text>Line 2</Text>
          <Text>Line 3</Text>
          <Text>Line 4</Text>
          <Text>Line 5</Text>
          <Text>Line 6</Text>
          <Text>Line 7</Text>
          <Text>Line 8</Text>
          <Text>Line 9</Text>
          <Text>Line 10</Text>
        </Scrollable>,
      );
    await waitUntilReady2();
    expect(capturedEntry.getScrollState().scrollTop).toBe(5);

    // Call scrollBy multiple times (upwards) in the same tick
    await act(async () => {
      capturedEntry!.scrollBy(-1);
      capturedEntry!.scrollBy(-1);
    });
    // Should have moved up by 2 (5 -> 3)
    expect(capturedEntry.getScrollState().scrollTop).toBe(3);

    await act(async () => {
      capturedEntry!.scrollBy(-2);
    });
    expect(capturedEntry.getScrollState().scrollTop).toBe(1);
    unmount2();
  });

  describe('keypress handling', () => {
    it.each([
      {
        name: 'scrolls down when overflow exists and not at bottom',
        initialScrollTop: 0,
        scrollHeight: 10,
        keySequence: '\u001B[1;2B', // Shift+Down
        expectedScrollTop: 1,
      },
      {
        name: 'scrolls up when overflow exists and not at top',
        initialScrollTop: 2,
        scrollHeight: 10,
        keySequence: '\u001B[1;2A', // Shift+Up
        expectedScrollTop: 1,
      },
      {
        name: 'does not scroll up when at top (allows event to bubble)',
        initialScrollTop: 0,
        scrollHeight: 10,
        keySequence: '\u001B[1;2A', // Shift+Up
        expectedScrollTop: 0,
      },
      {
        name: 'does not scroll down when at bottom (allows event to bubble)',
        initialScrollTop: 5, // maxScroll = 10 - 5 = 5
        scrollHeight: 10,
        keySequence: '\u001B[1;2B', // Shift+Down
        expectedScrollTop: 5,
      },
      {
        name: 'does not scroll when content fits (allows event to bubble)',
        initialScrollTop: 0,
        scrollHeight: 5, // Same as innerHeight (5)
        keySequence: '\u001B[1;2B', // Shift+Down
        expectedScrollTop: 0,
      },
    ])(
      '$name',
      async ({
        initialScrollTop,
        scrollHeight,
        keySequence,
        expectedScrollTop,
      }) => {
        // Dynamically import ink to mock getScrollHeight
        const ink = await import('ink');
        vi.mocked(ink.getScrollHeight).mockReturnValue(scrollHeight);

        let capturedEntry: ScrollProviderModule.ScrollableEntry | undefined;
        vi.spyOn(ScrollProviderModule, 'useScrollable').mockImplementation(
          async (entry, isActive) => {
            if (isActive) {
              capturedEntry = entry as ScrollProviderModule.ScrollableEntry;
            }
          },
        );

        const { stdin, waitUntilReady, unmount } = renderWithProviders(
          <Scrollable hasFocus={true} height={5}>
            <Text>Content</Text>
          </Scrollable>,
        );
        await waitUntilReady();

        // Ensure initial state using existing scrollBy method
        await act(async () => {
          // Reset to top first, then scroll to desired start position
          capturedEntry!.scrollBy(-100);
          if (initialScrollTop > 0) {
            capturedEntry!.scrollBy(initialScrollTop);
          }
        });
        expect(capturedEntry!.getScrollState().scrollTop).toBe(
          initialScrollTop,
        );

        await act(async () => {
          stdin.write(keySequence);
        });
        await waitUntilReady();

        expect(capturedEntry!.getScrollState().scrollTop).toBe(
          expectedScrollTop,
        );
        unmount();
      },
    );
  });
});
