/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import {
  useSelectionList,
  type SelectionListItem,
} from './useSelectionList.js';
import { useKeypress } from './useKeypress.js';

import type { KeypressHandler, Key } from '../contexts/KeypressContext.js';

type UseKeypressMockOptions = { isActive: boolean };

vi.mock('./useKeypress.js');

let activeKeypressHandler: KeypressHandler | null = null;

describe('useSelectionList', () => {
  const mockOnSelect = vi.fn();
  const mockOnHighlight = vi.fn();

  const items: Array<SelectionListItem<string>> = [
    { value: 'A', key: 'A' },
    { value: 'B', disabled: true, key: 'B' },
    { value: 'C', key: 'C' },
    { value: 'D', key: 'D' },
  ];

  beforeEach(() => {
    activeKeypressHandler = null;
    vi.mocked(useKeypress).mockImplementation(
      (handler: KeypressHandler, options?: UseKeypressMockOptions) => {
        if (options?.isActive) {
          activeKeypressHandler = handler;
        } else {
          activeKeypressHandler = null;
        }
      },
    );
    mockOnSelect.mockClear();
    mockOnHighlight.mockClear();
  });

  const pressKey = (
    name: string,
    sequence: string = name,
    options: { shift?: boolean; ctrl?: boolean } = {},
  ) => {
    act(() => {
      if (activeKeypressHandler) {
        const key: Key = {
          name,
          sequence,
          ctrl: options.ctrl ?? false,
          cmd: false,
          alt: false,
          shift: options.shift ?? false,
          insertable: false,
        };
        activeKeypressHandler(key);
      } else {
        throw new Error(
          `Test attempted to press key (${name}) but the keypress handler is not active. Ensure the hook is focused (isFocused=true) and the list is not empty.`,
        );
      }
    });
  };

  const renderSelectionListHook = async (initialProps: {
    items: Array<SelectionListItem<string>>;
    onSelect: (item: string) => void;
    onHighlight?: (item: string) => void;
    initialIndex?: number;
    isFocused?: boolean;
    showNumbers?: boolean;
    wrapAround?: boolean;
  }) => {
    let hookResult: ReturnType<typeof useSelectionList>;
    function TestComponent(props: typeof initialProps) {
      hookResult = useSelectionList(props);
      return null;
    }
    const { rerender, unmount, waitUntilReady } = render(
      <TestComponent {...initialProps} />,
    );
    await waitUntilReady();

    return {
      result: {
        get current() {
          return hookResult;
        },
      },
      rerender: async (newProps: Partial<typeof initialProps>) => {
        await act(async () => {
          rerender(<TestComponent {...initialProps} {...newProps} />);
        });
        await waitUntilReady();
      },
      unmount: async () => {
        unmount();
      },
      waitUntilReady,
    };
  };

  describe('Initialization', () => {
    it('should initialize with the default index (0) if enabled', async () => {
      const { result } = await renderSelectionListHook({
        items,
        onSelect: mockOnSelect,
      });
      expect(result.current.activeIndex).toBe(0);
    });

    it('should initialize with the provided initialIndex if enabled', async () => {
      const { result } = await renderSelectionListHook({
        items,
        initialIndex: 2,
        onSelect: mockOnSelect,
      });
      expect(result.current.activeIndex).toBe(2);
    });

    it('should handle an empty list gracefully', async () => {
      const { result } = await renderSelectionListHook({
        items: [],
        onSelect: mockOnSelect,
      });
      expect(result.current.activeIndex).toBe(0);
    });

    it('should find the next enabled item (downwards) if initialIndex is disabled', async () => {
      const { result } = await renderSelectionListHook({
        items,
        initialIndex: 1,
        onSelect: mockOnSelect,
      });
      expect(result.current.activeIndex).toBe(2);
    });

    it('should wrap around to find the next enabled item if initialIndex is disabled', async () => {
      const wrappingItems = [
        { value: 'A', key: 'A' },
        { value: 'B', disabled: true, key: 'B' },
        { value: 'C', disabled: true, key: 'C' },
      ];
      const { result } = await renderSelectionListHook({
        items: wrappingItems,
        initialIndex: 2,
        onSelect: mockOnSelect,
      });
      expect(result.current.activeIndex).toBe(0);
    });

    it('should default to 0 if initialIndex is out of bounds', async () => {
      const { result } = await renderSelectionListHook({
        items,
        initialIndex: 10,
        onSelect: mockOnSelect,
      });
      expect(result.current.activeIndex).toBe(0);

      const { result: resultNeg } = await renderSelectionListHook({
        items,
        initialIndex: -1,
        onSelect: mockOnSelect,
      });
      expect(resultNeg.current.activeIndex).toBe(0);
    });

    it('should stick to the initial index if all items are disabled', async () => {
      const allDisabled = [
        { value: 'A', disabled: true, key: 'A' },
        { value: 'B', disabled: true, key: 'B' },
      ];
      const { result } = await renderSelectionListHook({
        items: allDisabled,
        initialIndex: 1,
        onSelect: mockOnSelect,
      });
      expect(result.current.activeIndex).toBe(1);
    });
  });

  describe('Keyboard Navigation (Up/Down/J/K)', () => {
    it('should move down with "j" and "down" keys, skipping disabled items', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items,
        onSelect: mockOnSelect,
      });
      expect(result.current.activeIndex).toBe(0);
      pressKey('j');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(2);
      pressKey('down');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(3);
    });

    it('should move up with "k" and "up" keys, skipping disabled items', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items,
        initialIndex: 3,
        onSelect: mockOnSelect,
      });
      expect(result.current.activeIndex).toBe(3);
      pressKey('k');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(2);
      pressKey('up');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(0);
    });

    it('should ignore navigation keys when shift is pressed', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items,
        initialIndex: 2, // Start at middle item 'C'
        onSelect: mockOnSelect,
      });
      expect(result.current.activeIndex).toBe(2);

      // Shift+Down / Shift+J should not move down
      pressKey('down', undefined, { shift: true });
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(2);
      pressKey('j', undefined, { shift: true });
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(2);

      // Shift+Up / Shift+K should not move up
      pressKey('up', undefined, { shift: true });
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(2);
      pressKey('k', undefined, { shift: true });
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(2);

      // Verify normal navigation still works
      pressKey('down');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(3);
    });

    it('should wrap navigation correctly', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items,
        initialIndex: items.length - 1,
        onSelect: mockOnSelect,
      });
      expect(result.current.activeIndex).toBe(3);
      pressKey('down');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(0);

      pressKey('up');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(3);
    });

    it('should call onHighlight when index changes', async () => {
      const { waitUntilReady } = await renderSelectionListHook({
        items,
        onSelect: mockOnSelect,
        onHighlight: mockOnHighlight,
      });
      pressKey('down');
      await waitUntilReady();
      expect(mockOnHighlight).toHaveBeenCalledTimes(1);
      expect(mockOnHighlight).toHaveBeenCalledWith('C');
    });

    it('should not move or call onHighlight if navigation results in the same index (e.g., single item)', async () => {
      const singleItem = [{ value: 'A', key: 'A' }];
      const { result, waitUntilReady } = await renderSelectionListHook({
        items: singleItem,
        onSelect: mockOnSelect,
        onHighlight: mockOnHighlight,
      });
      pressKey('down');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(0);
      expect(mockOnHighlight).not.toHaveBeenCalled();
    });

    it('should not move or call onHighlight if all items are disabled', async () => {
      const allDisabled = [
        { value: 'A', disabled: true, key: 'A' },
        { value: 'B', disabled: true, key: 'B' },
      ];
      const { result, waitUntilReady } = await renderSelectionListHook({
        items: allDisabled,
        onSelect: mockOnSelect,
        onHighlight: mockOnHighlight,
      });
      const initialIndex = result.current.activeIndex;
      pressKey('down');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(initialIndex);
      expect(mockOnHighlight).not.toHaveBeenCalled();
    });
  });

  describe('Wrapping (wrapAround)', () => {
    it('should wrap by default (wrapAround=true)', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items,
        initialIndex: items.length - 1,
        onSelect: mockOnSelect,
      });
      expect(result.current.activeIndex).toBe(3);
      pressKey('down');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(0);

      pressKey('up');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(3);
    });

    it('should not wrap when wrapAround is false', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items,
        initialIndex: items.length - 1,
        onSelect: mockOnSelect,
        wrapAround: false,
      });
      expect(result.current.activeIndex).toBe(3);
      pressKey('down');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(3); // Should stay at bottom

      act(() => result.current.setActiveIndex(0));
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(0);
      pressKey('up');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(0); // Should stay at top
    });
  });

  describe('Selection (Enter)', () => {
    it('should call onSelect when "return" is pressed on enabled item', async () => {
      const { waitUntilReady } = await renderSelectionListHook({
        items,
        initialIndex: 2,
        onSelect: mockOnSelect,
      });
      pressKey('return');
      await waitUntilReady();
      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).toHaveBeenCalledWith('C');
    });

    it('should not call onSelect if the active item is disabled', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items,
        onSelect: mockOnSelect,
      });

      act(() => result.current.setActiveIndex(1));
      await waitUntilReady();

      pressKey('return');
      await waitUntilReady();
      expect(mockOnSelect).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard Navigation Robustness (Rapid Input)', () => {
    it('should handle rapid navigation and selection robustly (avoiding stale state)', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items, // A, B(disabled), C, D. Initial index 0 (A).
        onSelect: mockOnSelect,
        onHighlight: mockOnHighlight,
      });

      // Simulate rapid inputs with separate act blocks to allow effects to run
      if (!activeKeypressHandler) throw new Error('Handler not active');

      const handler = activeKeypressHandler;

      const press = (name: string) => {
        const key: Key = {
          name,
          sequence: name,
          ctrl: false,
          cmd: false,
          alt: false,
          shift: false,
          insertable: true,
        };
        handler(key);
      };

      // 1. Press Down. Should move 0 (A) -> 2 (C).
      act(() => {
        press('down');
      });
      await waitUntilReady();
      // 2. Press Down again. Should move 2 (C) -> 3 (D).
      act(() => {
        press('down');
      });
      await waitUntilReady();
      // 3. Press Enter. Should select D.
      act(() => {
        press('return');
      });
      await waitUntilReady();

      expect(result.current.activeIndex).toBe(3);

      expect(mockOnHighlight).toHaveBeenCalledTimes(2);
      expect(mockOnHighlight).toHaveBeenNthCalledWith(1, 'C');
      expect(mockOnHighlight).toHaveBeenNthCalledWith(2, 'D');

      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).toHaveBeenCalledWith('D');
      expect(mockOnSelect).not.toHaveBeenCalledWith('A');
    });

    it('should handle ultra-rapid input (multiple presses in single act) without stale state', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items, // A, B(disabled), C, D. Initial index 0 (A).
        onSelect: mockOnSelect,
        onHighlight: mockOnHighlight,
      });

      // Simulate ultra-rapid inputs where all keypresses happen faster than React can re-render
      act(() => {
        if (!activeKeypressHandler) throw new Error('Handler not active');

        const handler = activeKeypressHandler;

        const press = (name: string) => {
          const key: Key = {
            name,
            sequence: name,
            ctrl: false,
            cmd: false,
            alt: false,
            shift: false,
            insertable: false,
          };
          handler(key);
        };

        // All presses happen in same render cycle - React batches the state updates
        press('down'); // Should move 0 (A) -> 2 (C)
        press('down'); // Should move 2 (C) -> 3 (D)
        press('return'); // Should select D
      });
      await waitUntilReady();

      expect(result.current.activeIndex).toBe(3);

      expect(mockOnHighlight).toHaveBeenCalledWith('D');
      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).toHaveBeenCalledWith('D');
    });
  });

  describe('Focus Management (isFocused)', () => {
    it('should activate the keypress handler when focused (default) and items exist', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items,
        onSelect: mockOnSelect,
      });
      expect(activeKeypressHandler).not.toBeNull();
      pressKey('down');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(2);
    });

    it('should not activate the keypress handler when isFocused is false', async () => {
      await renderSelectionListHook({
        items,
        onSelect: mockOnSelect,
        isFocused: false,
      });
      expect(activeKeypressHandler).toBeNull();
      expect(() => pressKey('down')).toThrow(/keypress handler is not active/);
    });

    it('should not activate the keypress handler when items list is empty', async () => {
      await renderSelectionListHook({
        items: [],
        onSelect: mockOnSelect,
        isFocused: true,
      });
      expect(activeKeypressHandler).toBeNull();
      expect(() => pressKey('down')).toThrow(/keypress handler is not active/);
    });

    it('should activate/deactivate when isFocused prop changes', async () => {
      const { result, rerender, waitUntilReady } =
        await renderSelectionListHook({
          items,
          onSelect: mockOnSelect,
          isFocused: false,
        });

      expect(activeKeypressHandler).toBeNull();

      await rerender({ isFocused: true });
      expect(activeKeypressHandler).not.toBeNull();
      pressKey('down');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(2);

      await rerender({ isFocused: false });
      expect(activeKeypressHandler).toBeNull();
      expect(() => pressKey('down')).toThrow(/keypress handler is not active/);
    });
  });

  describe('Numeric Quick Selection (showNumbers=true)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const shortList = items;
    const longList: Array<SelectionListItem<string>> = Array.from(
      { length: 15 },
      (_, i) => ({ value: `Item ${i + 1}`, key: `Item ${i + 1}` }),
    );

    const pressNumber = (num: string) => pressKey(num, num);

    it('should not respond to numbers if showNumbers is false (default)', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items: shortList,
        onSelect: mockOnSelect,
      });
      pressNumber('1');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(0);
      expect(mockOnSelect).not.toHaveBeenCalled();
    });

    it('should select item immediately if the number cannot be extended (unambiguous)', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items: shortList,
        onSelect: mockOnSelect,
        onHighlight: mockOnHighlight,
        showNumbers: true,
      });
      pressNumber('3');
      await waitUntilReady();

      expect(result.current.activeIndex).toBe(2);
      expect(mockOnHighlight).toHaveBeenCalledWith('C');
      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).toHaveBeenCalledWith('C');
      expect(vi.getTimerCount()).toBe(0);
    });

    it('should highlight and wait for timeout if the number can be extended (ambiguous)', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items: longList,
        initialIndex: 1, // Start at index 1 so pressing "1" (index 0) causes a change
        onSelect: mockOnSelect,
        onHighlight: mockOnHighlight,
        showNumbers: true,
      });

      pressNumber('1');
      await waitUntilReady();

      expect(result.current.activeIndex).toBe(0);
      expect(mockOnHighlight).toHaveBeenCalledWith('Item 1');

      expect(mockOnSelect).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(1);

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      await waitUntilReady();

      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).toHaveBeenCalledWith('Item 1');
    });

    it('should handle multi-digit input correctly', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items: longList,
        onSelect: mockOnSelect,
        showNumbers: true,
      });

      pressNumber('1');
      await waitUntilReady();
      expect(mockOnSelect).not.toHaveBeenCalled();

      pressNumber('2');
      await waitUntilReady();

      expect(result.current.activeIndex).toBe(11);

      expect(mockOnSelect).toHaveBeenCalledTimes(1);
      expect(mockOnSelect).toHaveBeenCalledWith('Item 12');
    });

    it('should reset buffer if input becomes invalid (out of bounds)', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items: shortList,
        onSelect: mockOnSelect,
        showNumbers: true,
      });

      pressNumber('5');
      await waitUntilReady();

      expect(result.current.activeIndex).toBe(0);
      expect(mockOnSelect).not.toHaveBeenCalled();

      pressNumber('3');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(2);
      expect(mockOnSelect).toHaveBeenCalledWith('C');
    });

    it('should allow "0" as subsequent digit, but ignore as first digit', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items: longList,
        onSelect: mockOnSelect,
        showNumbers: true,
      });

      pressNumber('0');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(0);
      expect(mockOnSelect).not.toHaveBeenCalled();
      // Timer should be running to clear the '0' input buffer
      expect(vi.getTimerCount()).toBe(1);

      // Press '1', then '0' (Item 10, index 9)
      pressNumber('1');
      await waitUntilReady();
      pressNumber('0');
      await waitUntilReady();

      expect(result.current.activeIndex).toBe(9);
      expect(mockOnSelect).toHaveBeenCalledWith('Item 10');
    });

    it('should clear the initial "0" input after timeout', async () => {
      const { waitUntilReady } = await renderSelectionListHook({
        items: longList,
        onSelect: mockOnSelect,
        showNumbers: true,
      });

      pressNumber('0');
      await waitUntilReady();
      await act(async () => vi.advanceTimersByTime(1000)); // Timeout the '0' input
      await waitUntilReady();

      pressNumber('1');
      await waitUntilReady();
      expect(mockOnSelect).not.toHaveBeenCalled(); // Should be waiting for second digit

      await act(async () => vi.advanceTimersByTime(1000)); // Timeout '1'
      await waitUntilReady();
      expect(mockOnSelect).toHaveBeenCalledWith('Item 1');
    });

    it('should highlight but not select a disabled item (immediate selection case)', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items: shortList, // B (index 1, number 2) is disabled
        onSelect: mockOnSelect,
        onHighlight: mockOnHighlight,
        showNumbers: true,
      });

      pressNumber('2');
      await waitUntilReady();

      expect(result.current.activeIndex).toBe(1);
      expect(mockOnHighlight).toHaveBeenCalledWith('B');

      // Should not select immediately, even though 20 > 4
      expect(mockOnSelect).not.toHaveBeenCalled();
    });

    it('should highlight but not select a disabled item (timeout case)', async () => {
      // Create a list where the ambiguous prefix points to a disabled item
      const disabledAmbiguousList = [
        { value: 'Item 1 Disabled', disabled: true, key: 'Item 1 Disabled' },
        ...longList.slice(1),
      ];

      const { result, waitUntilReady } = await renderSelectionListHook({
        items: disabledAmbiguousList,
        onSelect: mockOnSelect,
        showNumbers: true,
      });

      pressNumber('1');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(0);
      expect(vi.getTimerCount()).toBe(1);

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      await waitUntilReady();

      // Should not select after timeout
      expect(mockOnSelect).not.toHaveBeenCalled();
    });

    it('should clear the number buffer if a non-numeric key (e.g., navigation) is pressed', async () => {
      const { result, waitUntilReady } = await renderSelectionListHook({
        items: longList,
        onSelect: mockOnSelect,
        showNumbers: true,
      });

      pressNumber('1');
      await waitUntilReady();
      expect(vi.getTimerCount()).toBe(1);

      pressKey('down');
      await waitUntilReady();

      expect(result.current.activeIndex).toBe(1);
      expect(vi.getTimerCount()).toBe(0);

      pressNumber('3');
      await waitUntilReady();
      // Should select '3', not '13'
      expect(result.current.activeIndex).toBe(2);
    });

    it('should clear the number buffer if "return" is pressed', async () => {
      const { waitUntilReady } = await renderSelectionListHook({
        items: longList,
        onSelect: mockOnSelect,
        showNumbers: true,
      });

      pressNumber('1');
      await waitUntilReady();

      pressKey('return');
      await waitUntilReady();
      expect(mockOnSelect).toHaveBeenCalledTimes(1);

      expect(vi.getTimerCount()).toBe(0);

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      await waitUntilReady();
      expect(mockOnSelect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Reactivity (Dynamic Updates)', () => {
    it('should update activeIndex when initialIndex prop changes', async () => {
      const { result, rerender } = await renderSelectionListHook({
        items,
        onSelect: mockOnSelect,
        initialIndex: 0,
      });

      await rerender({ initialIndex: 2 });
      await waitFor(() => {
        expect(result.current.activeIndex).toBe(2);
      });
    });

    it('should respect a new initialIndex even after user interaction', async () => {
      const { result, rerender, waitUntilReady } =
        await renderSelectionListHook({
          items,
          onSelect: mockOnSelect,
          initialIndex: 0,
        });

      // User navigates, changing the active index
      pressKey('down');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(2);

      // The component re-renders with a new initial index
      await rerender({ initialIndex: 3 });

      // The hook should now respect the new initial index
      await waitFor(() => {
        expect(result.current.activeIndex).toBe(3);
      });
    });

    it('should validate index when initialIndex prop changes to a disabled item', async () => {
      const { result, rerender } = await renderSelectionListHook({
        items,
        onSelect: mockOnSelect,
        initialIndex: 0,
      });

      await rerender({ initialIndex: 1 });

      await waitFor(() => {
        expect(result.current.activeIndex).toBe(2);
      });
    });

    it('should adjust activeIndex if items change and the initialIndex is now out of bounds', async () => {
      const { result, rerender } = await renderSelectionListHook({
        onSelect: mockOnSelect,
        initialIndex: 3,
        items,
      });

      expect(result.current.activeIndex).toBe(3);

      const shorterItems = [
        { value: 'X', key: 'X' },
        { value: 'Y', key: 'Y' },
      ];
      await rerender({ items: shorterItems }); // Length 2

      // The useEffect syncs based on the initialIndex (3) which is now out of bounds. It defaults to 0.
      await waitFor(() => {
        expect(result.current.activeIndex).toBe(0);
      });
    });

    it('should adjust activeIndex if items change and the initialIndex becomes disabled', async () => {
      const initialItems = [
        { value: 'A', key: 'A' },
        { value: 'B', key: 'B' },
        { value: 'C', key: 'C' },
      ];
      const { result, rerender } = await renderSelectionListHook({
        onSelect: mockOnSelect,
        initialIndex: 1,
        items: initialItems,
      });

      expect(result.current.activeIndex).toBe(1);

      const newItems = [
        { value: 'A', key: 'A' },
        { value: 'B', disabled: true, key: 'B' },
        { value: 'C', key: 'C' },
      ];
      await rerender({ items: newItems });

      await waitFor(() => {
        expect(result.current.activeIndex).toBe(2);
      });
    });

    it('should reset to 0 if items change to an empty list', async () => {
      const { result, rerender } = await renderSelectionListHook({
        onSelect: mockOnSelect,
        initialIndex: 2,
        items,
      });

      await rerender({ items: [] });
      await waitFor(() => {
        expect(result.current.activeIndex).toBe(0);
      });
    });

    it('should not reset activeIndex when items are deeply equal', async () => {
      const initialItems = [
        { value: 'A', key: 'A' },
        { value: 'B', disabled: true, key: 'B' },
        { value: 'C', key: 'C' },
        { value: 'D', key: 'D' },
      ];

      const { result, rerender, waitUntilReady } =
        await renderSelectionListHook({
          onSelect: mockOnSelect,
          onHighlight: mockOnHighlight,
          initialIndex: 2,
          items: initialItems,
        });

      expect(result.current.activeIndex).toBe(2);

      await act(async () => {
        result.current.setActiveIndex(3);
      });
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(3);

      mockOnHighlight.mockClear();

      // Create new array with same content (deeply equal but not identical)
      const newItems = [
        { value: 'A', key: 'A' },
        { value: 'B', disabled: true, key: 'B' },
        { value: 'C', key: 'C' },
        { value: 'D', key: 'D' },
      ];

      await rerender({ items: newItems });

      // Active index should remain the same since items are deeply equal
      await waitFor(() => {
        expect(result.current.activeIndex).toBe(3);
      });
      // onHighlight should NOT be called since the index didn't change
      expect(mockOnHighlight).not.toHaveBeenCalled();
    });

    it('should update activeIndex when items change structurally', async () => {
      const initialItems = [
        { value: 'A', key: 'A' },
        { value: 'B', disabled: true, key: 'B' },
        { value: 'C', key: 'C' },
        { value: 'D', key: 'D' },
      ];

      const { result, rerender } = await renderSelectionListHook({
        onSelect: mockOnSelect,
        onHighlight: mockOnHighlight,
        initialIndex: 3,
        items: initialItems,
      });

      expect(result.current.activeIndex).toBe(3);
      mockOnHighlight.mockClear();

      // Change item values (not deeply equal)
      const newItems = [
        { value: 'X', key: 'X' },
        { value: 'Y', key: 'Y' },
        { value: 'Z', key: 'Z' },
      ];

      await rerender({ items: newItems });

      // Active index should update based on initialIndex and new items
      await waitFor(() => {
        expect(result.current.activeIndex).toBe(0);
      });
    });

    it('should handle partial changes in items array', async () => {
      const initialItems = [
        { value: 'A', key: 'A' },
        { value: 'B', key: 'B' },
        { value: 'C', key: 'C' },
      ];

      const { result, rerender } = await renderSelectionListHook({
        onSelect: mockOnSelect,
        initialIndex: 1,
        items: initialItems,
      });

      expect(result.current.activeIndex).toBe(1);

      // Change only one item's disabled status
      const newItems = [
        { value: 'A', key: 'A' },
        { value: 'B', disabled: true, key: 'B' },
        { value: 'C', key: 'C' },
      ];

      await rerender({ items: newItems });

      // Should find next valid index since current became disabled
      await waitFor(() => {
        expect(result.current.activeIndex).toBe(2);
      });
    });

    it('should update selection when a new item is added to the start of the list', async () => {
      const initialItems = [
        { value: 'A', key: 'A' },
        { value: 'B', key: 'B' },
        { value: 'C', key: 'C' },
      ];

      const { result, rerender, waitUntilReady } =
        await renderSelectionListHook({
          onSelect: mockOnSelect,
          items: initialItems,
        });

      pressKey('down');
      await waitUntilReady();
      expect(result.current.activeIndex).toBe(1);

      const newItems = [
        { value: 'D', key: 'D' },
        { value: 'A', key: 'A' },
        { value: 'B', key: 'B' },
        { value: 'C', key: 'C' },
      ];

      await rerender({ items: newItems });

      await waitFor(() => {
        expect(result.current.activeIndex).toBe(2);
      });
    });

    it('should not re-initialize when items have identical keys but are different objects', async () => {
      const initialItems = [
        { value: 'A', key: 'A' },
        { value: 'B', key: 'B' },
      ];

      let renderCount = 0;

      const renderHookWithCount = async (initialProps: {
        items: Array<SelectionListItem<string>>;
      }) => {
        function TestComponent(props: typeof initialProps) {
          renderCount++;
          useSelectionList({
            onSelect: mockOnSelect,
            onHighlight: mockOnHighlight,
            items: props.items,
          });
          return null;
        }
        const { rerender, waitUntilReady } = render(
          <TestComponent {...initialProps} />,
        );
        await waitUntilReady();

        return {
          rerender: async (newProps: Partial<typeof initialProps>) => {
            await act(async () => {
              rerender(<TestComponent {...initialProps} {...newProps} />);
            });
            await waitUntilReady();
          },
        };
      };

      const { rerender } = await renderHookWithCount({ items: initialItems });

      // Initial render
      expect(renderCount).toBe(1);

      // Create new items with the same keys but different object references
      const newItems = [
        { value: 'A', key: 'A' },
        { value: 'B', key: 'B' },
      ];

      await rerender({ items: newItems });
      expect(renderCount).toBe(2);
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should clear timeout on unmount when timer is active', async () => {
      const longList: Array<SelectionListItem<string>> = Array.from(
        { length: 15 },
        (_, i) => ({ value: `Item ${i + 1}`, key: `Item ${i + 1}` }),
      );

      const { unmount, waitUntilReady } = await renderSelectionListHook({
        items: longList,
        onSelect: mockOnSelect,
        showNumbers: true,
      });

      pressKey('1', '1');
      await waitUntilReady();

      expect(vi.getTimerCount()).toBe(1);

      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      await waitUntilReady();
      expect(mockOnSelect).not.toHaveBeenCalled();

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      await unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      // No waitUntilReady here as component is unmounted
      expect(mockOnSelect).not.toHaveBeenCalled();
    });
  });
});
