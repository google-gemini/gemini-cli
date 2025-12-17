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

  it('renders children', () => {
    const { lastFrame } = renderWithProviders(
      <Scrollable hasFocus={false} height={5}>
        <Text>Hello World</Text>
      </Scrollable>,
    );
    expect(lastFrame()).toContain('Hello World');
  });

  it('renders multiple children', () => {
    const { lastFrame } = renderWithProviders(
      <Scrollable hasFocus={false} height={5}>
        <Text>Line 1</Text>
        <Text>Line 2</Text>
        <Text>Line 3</Text>
      </Scrollable>,
    );
    expect(lastFrame()).toContain('Line 1');
    expect(lastFrame()).toContain('Line 2');
    expect(lastFrame()).toContain('Line 3');
  });

  it('matches snapshot', () => {
    const { lastFrame } = renderWithProviders(
      <Scrollable hasFocus={false} height={5}>
        <Text>Line 1</Text>
        <Text>Line 2</Text>
        <Text>Line 3</Text>
      </Scrollable>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('updates scroll position correctly when scrollBy is called multiple times in the same tick', () => {
    let capturedEntry: ScrollProviderModule.ScrollableEntry | undefined;
    vi.spyOn(ScrollProviderModule, 'useScrollable').mockImplementation(
      (entry, isActive) => {
        if (isActive) {
          capturedEntry = entry as ScrollProviderModule.ScrollableEntry;
        }
      },
    );

    renderWithProviders(
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

    expect(capturedEntry).toBeDefined();

    if (!capturedEntry) {
      throw new Error('capturedEntry is undefined');
    }

    // Initial state (starts at bottom because of auto-scroll logic)
    expect(capturedEntry.getScrollState().scrollTop).toBe(5);

    // Call scrollBy multiple times (upwards) in the same tick
    act(() => {
      capturedEntry!.scrollBy(-1);
      capturedEntry!.scrollBy(-1);
    });
    // Should have moved up by 2
    expect(capturedEntry.getScrollState().scrollTop).toBe(3);

    act(() => {
      capturedEntry!.scrollBy(-2);
    });
    expect(capturedEntry.getScrollState().scrollTop).toBe(1);
  });
});
