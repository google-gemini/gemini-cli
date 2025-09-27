/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test-utils/render.js';
import {
  BaseSelectionList,
  type BaseSelectionListProps,
  type RenderItemContext,
} from './BaseSelectionList.js';
import { useSelectionList } from '../../hooks/useSelectionList.js';
import { Text } from 'ink';
import type { theme } from '../../semantic-colors.js';

vi.mock('../../hooks/useSelectionList.js');

const mockTheme = {
  text: { primary: 'COLOR_PRIMARY', secondary: 'COLOR_SECONDARY' },
  status: { success: 'COLOR_SUCCESS' },
} as typeof theme;

vi.mock('../../semantic-colors.js', () => ({
  theme: {
    text: { primary: 'COLOR_PRIMARY', secondary: 'COLOR_SECONDARY' },
    status: { success: 'COLOR_SUCCESS' },
  },
}));

describe('BaseSelectionList', () => {
  const mockOnSelect = vi.fn();
  const mockOnHighlight = vi.fn();
  const mockRenderItem = vi.fn();

  const items = [
    { value: 'A', label: 'Item A', key: 'A' },
    { value: 'B', label: 'Item B', disabled: true, key: 'B' },
    { value: 'C', label: 'Item C', key: 'C' },
  ];

  // Helper to render the component with default props
  const renderComponent = (
    props: Partial<
      BaseSelectionListProps<
        string,
        { value: string; label: string; disabled?: boolean; key: string }
      >
    > = {},
    activeIndex: number = 0,
  ) => {
    vi.mocked(useSelectionList).mockReturnValue({
      activeIndex,
      setActiveIndex: vi.fn(),
    });

    mockRenderItem.mockImplementation(
      (
        item: { value: string; label: string; disabled?: boolean; key: string },
        context: RenderItemContext,
      ) => <Text color={context.titleColor}>{item.label}</Text>,
    );

    const defaultProps: BaseSelectionListProps<
      string,
      { value: string; label: string; disabled?: boolean; key: string }
    > = {
      items,
      onSelect: mockOnSelect,
      onHighlight: mockOnHighlight,
      renderItem: mockRenderItem,
      ...props,
    };

    return renderWithProviders(<BaseSelectionList {...defaultProps} />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering and Structure', () => {
    it('should render all items using the renderItem prop', () => {
      const { lastFrame } = renderComponent();

      expect(lastFrame()).toContain('Item A');
      expect(lastFrame()).toContain('Item B');
      expect(lastFrame()).toContain('Item C');

      expect(mockRenderItem).toHaveBeenCalledTimes(3);
      expect(mockRenderItem).toHaveBeenCalledWith(items[0], expect.any(Object));
    });

    it('should render the selection indicator (● or space) and layout', () => {
      const { lastFrame } = renderComponent({}, 0);
      const output = lastFrame();

      // Use regex to assert the structure: Indicator + Whitespace + Number + Label
      expect(output).toMatch(/●\s+1\.\s+Item A/);
      expect(output).toMatch(/\s+2\.\s+Item B/);
      expect(output).toMatch(/\s+3\.\s+Item C/);
    });

    it('should handle an empty list gracefully', () => {
      const { lastFrame } = renderComponent({ items: [] });
      expect(mockRenderItem).not.toHaveBeenCalled();
      expect(lastFrame()).toBe('');
    });
  });

  describe('useSelectionList Integration', () => {
    it('should pass props correctly to useSelectionList', () => {
      const initialIndex = 1;
      const isFocused = false;
      const showNumbers = false;

      renderComponent({ initialIndex, isFocused, showNumbers });

      expect(useSelectionList).toHaveBeenCalledWith({
        items,
        initialIndex,
        onSelect: mockOnSelect,
        onHighlight: mockOnHighlight,
        isFocused,
        showNumbers,
      });
    });

    it('should use the activeIndex returned by the hook', () => {
      renderComponent({}, 2); // Active index is C

      expect(mockRenderItem).toHaveBeenCalledWith(
        items[0],
        expect.objectContaining({ isSelected: false }),
      );
      expect(mockRenderItem).toHaveBeenCalledWith(
        items[2],
        expect.objectContaining({ isSelected: true }),
      );
    });
  });

  describe('Styling and Colors', () => {
    it('should apply success color to the selected item', () => {
      renderComponent({}, 0); // Item A selected

      // Check renderItem context colors against the mocked theme
      expect(mockRenderItem).toHaveBeenCalledWith(
        items[0],
        expect.objectContaining({
          titleColor: mockTheme.status.success,
          numberColor: mockTheme.status.success,
          isSelected: true,
        }),
      );
    });

    it('should apply primary color to unselected, enabled items', () => {
      renderComponent({}, 0); // Item A selected, Item C unselected/enabled

      // Check renderItem context colors for Item C
      expect(mockRenderItem).toHaveBeenCalledWith(
        items[2],
        expect.objectContaining({
          titleColor: mockTheme.text.primary,
          numberColor: mockTheme.text.primary,
          isSelected: false,
        }),
      );
    });

    it('should apply secondary color to disabled items (when not selected)', () => {
      renderComponent({}, 0); // Item A selected, Item B disabled

      // Check renderItem context colors for Item B
      expect(mockRenderItem).toHaveBeenCalledWith(
        items[1],
        expect.objectContaining({
          titleColor: mockTheme.text.secondary,
          numberColor: mockTheme.text.secondary,
          isSelected: false,
        }),
      );
    });

    it('should apply success color to disabled items if they are selected', () => {
      // The component should visually reflect the selection even if the item is disabled.
      renderComponent({}, 1); // Item B (disabled) selected

      // Check renderItem context colors for Item B
      expect(mockRenderItem).toHaveBeenCalledWith(
        items[1],
        expect.objectContaining({
          titleColor: mockTheme.status.success,
          numberColor: mockTheme.status.success,
          isSelected: true,
        }),
      );
    });
  });

  describe('Numbering (showNumbers)', () => {
    it('should show numbers by default with correct formatting', () => {
      const { lastFrame } = renderComponent();
      const output = lastFrame();

      expect(output).toContain('1.');
      expect(output).toContain('2.');
      expect(output).toContain('3.');
    });

    it('should hide numbers when showNumbers is false', () => {
      const { lastFrame } = renderComponent({ showNumbers: false });
      const output = lastFrame();

      expect(output).not.toContain('1.');
      expect(output).not.toContain('2.');
      expect(output).not.toContain('3.');
    });

    it('should apply correct padding for alignment in long lists', () => {
      const longList = Array.from({ length: 15 }, (_, i) => ({
        value: `Item ${i + 1}`,
        label: `Item ${i + 1}`,
        key: `Item ${i + 1}`,
      }));

      // We must increase maxItemsToShow (default 10) to see the 10th item and beyond
      const { lastFrame } = renderComponent({
        items: longList,
        maxItemsToShow: 15,
      });
      const output = lastFrame();

      // Check formatting for single and double digits.
      // The implementation uses padStart, resulting in " 1." and "10.".
      expect(output).toContain(' 1.');
      expect(output).toContain('10.');
    });

    it('should apply secondary color to numbers if showNumbers is false (internal logic check)', () => {
      renderComponent({ showNumbers: false }, 0);

      expect(mockRenderItem).toHaveBeenCalledWith(
        items[0],
        expect.objectContaining({
          isSelected: true,
          titleColor: mockTheme.status.success,
          numberColor: mockTheme.text.secondary,
        }),
      );
    });
  });

  describe('Scrolling and Pagination (maxItemsToShow)', () => {
    const longList = Array.from({ length: 10 }, (_, i) => ({
      value: `Item ${i + 1}`,
      label: `Item ${i + 1}`,
      key: `Item ${i + 1}`,
    }));
    const MAX_ITEMS = 3;

    const renderScrollableList = (initialActiveIndex: number = 0) => {
      // Define the props used for the initial render and subsequent rerenders
      const componentProps: BaseSelectionListProps<
        string,
        { value: string; label: string; key: string }
      > = {
        items: longList,
        maxItemsToShow: MAX_ITEMS,
        onSelect: mockOnSelect,
        onHighlight: mockOnHighlight,
        renderItem: mockRenderItem,
      };

      vi.mocked(useSelectionList).mockReturnValue({
        activeIndex: initialActiveIndex,
        setActiveIndex: vi.fn(),
      });

      mockRenderItem.mockImplementation(
        (item: (typeof longList)[0], context: RenderItemContext) => (
          <Text color={context.titleColor}>{item.label}</Text>
        ),
      );

      const { rerender, lastFrame } = renderWithProviders(
        <BaseSelectionList {...componentProps} />,
      );

      // Function to simulate the activeIndex changing over time
      const updateActiveIndex = async (newIndex: number) => {
        vi.mocked(useSelectionList).mockReturnValue({
          activeIndex: newIndex,
          setActiveIndex: vi.fn(),
        });

        rerender(<BaseSelectionList {...componentProps} />);

        await waitFor(() => {
          expect(lastFrame()).toBeTruthy();
        });
      };

      return { updateActiveIndex, lastFrame };
    };

    it('should only show maxItemsToShow items initially', () => {
      const { lastFrame } = renderScrollableList(0);
      const output = lastFrame();

      expect(output).toContain('Item 1');
      expect(output).toContain('Item 3');
      expect(output).not.toContain('Item 4');
    });

    it('should scroll down when activeIndex moves beyond the visible window', async () => {
      const { updateActiveIndex, lastFrame } = renderScrollableList(0);

      // Move to index 3 (Item 4). Should trigger scroll.
      // New visible window should be Items 2, 3, 4 (scroll offset 1).
      await updateActiveIndex(3);

      const output = lastFrame();
      expect(output).not.toContain('Item 1');
      expect(output).toContain('Item 2');
      expect(output).toContain('Item 4');
      expect(output).not.toContain('Item 5');
    });

    it('should scroll up when activeIndex moves before the visible window', async () => {
      const { updateActiveIndex, lastFrame } = renderScrollableList(0);

      await updateActiveIndex(4);

      let output = lastFrame();
      expect(output).toContain('Item 3'); // Should see items 3, 4, 5
      expect(output).toContain('Item 5');
      expect(output).not.toContain('Item 2');

      // Now test scrolling up: move to index 1 (Item 2)
      // This should trigger scroll up to show items 2, 3, 4
      await updateActiveIndex(1);

      output = lastFrame();
      expect(output).toContain('Item 2');
      expect(output).toContain('Item 4');
      expect(output).not.toContain('Item 5'); // Item 5 should no longer be visible
    });

    it('should pin the scroll offset to the end if selection starts near the end', async () => {
      // List length 10. Max items 3. Active index 9 (last item).
      // Scroll offset should be 10 - 3 = 7.
      // Visible items: 8, 9, 10.
      const { lastFrame } = renderScrollableList(9);

      await waitFor(() => {
        const output = lastFrame();
        expect(output).toContain('Item 10');
        expect(output).toContain('Item 8');
        expect(output).not.toContain('Item 7');
      });
    });

    it('should handle dynamic scrolling through multiple activeIndex changes', async () => {
      const { updateActiveIndex, lastFrame } = renderScrollableList(0);

      expect(lastFrame()).toContain('Item 1');
      expect(lastFrame()).toContain('Item 3');

      // Scroll down gradually
      await updateActiveIndex(2); // Still within window
      expect(lastFrame()).toContain('Item 1');

      await updateActiveIndex(3); // Should trigger scroll
      let output = lastFrame();
      expect(output).toContain('Item 2');
      expect(output).toContain('Item 4');
      expect(output).not.toContain('Item 1');

      await updateActiveIndex(5); // Scroll further
      output = lastFrame();
      expect(output).toContain('Item 4');
      expect(output).toContain('Item 6');
      expect(output).not.toContain('Item 3');
    });

    it('should correctly identify the selected item within the visible window', () => {
      renderScrollableList(1); // activeIndex 1 = Item 2

      expect(mockRenderItem).toHaveBeenCalledTimes(MAX_ITEMS);

      expect(mockRenderItem).toHaveBeenCalledWith(
        expect.objectContaining({ value: 'Item 1' }),
        expect.objectContaining({ isSelected: false }),
      );

      expect(mockRenderItem).toHaveBeenCalledWith(
        expect.objectContaining({ value: 'Item 2' }),
        expect.objectContaining({ isSelected: true }),
      );
    });

    it('should correctly identify the selected item when scrolled (high index)', async () => {
      renderScrollableList(5);

      await waitFor(() => {
        // Item 6 (index 5) should be selected
        expect(mockRenderItem).toHaveBeenCalledWith(
          expect.objectContaining({ value: 'Item 6' }),
          expect.objectContaining({ isSelected: true }),
        );
      });

      // Item 4 (index 3) should not be selected
      expect(mockRenderItem).toHaveBeenCalledWith(
        expect.objectContaining({ value: 'Item 4' }),
        expect.objectContaining({ isSelected: false }),
      );
    });

    it('should handle maxItemsToShow larger than the list length', () => {
      // Test edge case where maxItemsToShow exceeds available items
      const { lastFrame } = renderComponent(
        { items: longList, maxItemsToShow: 15 },
        0,
      );
      const output = lastFrame();

      // Should show all available items (10 items)
      expect(output).toContain('Item 1');
      expect(output).toContain('Item 10');
      expect(mockRenderItem).toHaveBeenCalledTimes(10);
    });
  });

  describe('Scroll Arrows (showScrollArrows)', () => {
    const longList = Array.from({ length: 10 }, (_, i) => ({
      value: `Item ${i + 1}`,
      label: `Item ${i + 1}`,
      key: `Item ${i + 1}`,
    }));
    const MAX_ITEMS = 3;

    it('should not show arrows by default', () => {
      const { lastFrame } = renderComponent({
        items: longList,
        maxItemsToShow: MAX_ITEMS,
      });
      const output = lastFrame();

      expect(output).not.toContain('▲');
      expect(output).not.toContain('▼');
    });

    it('should show arrows with correct colors when enabled (at the top)', async () => {
      const { lastFrame } = renderComponent(
        {
          items: longList,
          maxItemsToShow: MAX_ITEMS,
          showScrollArrows: true,
        },
        0,
      );

      await waitFor(() => {
        const output = lastFrame();
        // At the top, should show first 3 items
        expect(output).toContain('Item 1');
        expect(output).toContain('Item 3');
        expect(output).not.toContain('Item 4');
        // Both arrows should be visible
        expect(output).toContain('▲');
        expect(output).toContain('▼');
      });
    });

    it('should show arrows and correct items when scrolled to the middle', async () => {
      const { lastFrame } = renderComponent(
        { items: longList, maxItemsToShow: MAX_ITEMS, showScrollArrows: true },
        5,
      );

      await waitFor(() => {
        const output = lastFrame();
        // After scrolling to middle, should see items around index 5
        expect(output).toContain('Item 4');
        expect(output).toContain('Item 6');
        expect(output).not.toContain('Item 3');
        expect(output).not.toContain('Item 7');
        // Both scroll arrows should be visible
        expect(output).toContain('▲');
        expect(output).toContain('▼');
      });
    });

    it('should show arrows and correct items when scrolled to the end', async () => {
      const { lastFrame } = renderComponent(
        { items: longList, maxItemsToShow: MAX_ITEMS, showScrollArrows: true },
        9,
      );

      await waitFor(() => {
        const output = lastFrame();
        // At the end, should show last 3 items
        expect(output).toContain('Item 8');
        expect(output).toContain('Item 10');
        expect(output).not.toContain('Item 7');
        // Both arrows should be visible
        expect(output).toContain('▲');
        expect(output).toContain('▼');
      });
    });

    it('should show both arrows dimmed when list fits entirely', () => {
      const { lastFrame } = renderComponent({
        items,
        maxItemsToShow: 5,
        showScrollArrows: true,
      });

      const output = lastFrame();
      // Should show all items since maxItemsToShow > items.length
      expect(output).toContain('Item A');
      expect(output).toContain('Item B');
      expect(output).toContain('Item C');
      // Both arrows should be visible but dimmed (this test doesn't need waitFor since no scrolling occurs)
      expect(output).toContain('▲');
      expect(output).toContain('▼');
    });
  });
});
