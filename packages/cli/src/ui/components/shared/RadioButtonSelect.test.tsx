/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import type React from 'react';
import {
  RadioButtonSelect,
  type RadioSelectItem,
  type RadioButtonSelectProps,
} from './RadioButtonSelect.js';
import {
  BaseSelectionList,
  type BaseSelectionListProps,
  type RenderItemContext,
} from './BaseSelectionList.js';

vi.mock('./BaseSelectionList.js', () => ({
  BaseSelectionList: vi.fn(() => null),
}));

vi.mock('../../semantic-colors.js', () => ({
  theme: {
    text: { secondary: 'COLOR_SECONDARY' },
  },
}));

const MockedBaseSelectionList = vi.mocked(
  BaseSelectionList,
) as unknown as ReturnType<typeof vi.fn>;

type RadioRenderItemFn = (
  item: RadioSelectItem<string>,
  context: RenderItemContext,
) => React.JSX.Element;
const extractRenderItem = (): RadioRenderItemFn => {
  const mockCalls = MockedBaseSelectionList.mock.calls;

  if (mockCalls.length === 0) {
    throw new Error(
      'BaseSelectionList was not called. Ensure RadioButtonSelect is rendered before calling extractRenderItem.',
    );
  }

  const props = mockCalls[0][0] as BaseSelectionListProps<
    string,
    RadioSelectItem<string>
  >;

  if (typeof props.renderItem !== 'function') {
    throw new Error('renderItem prop was not found on BaseSelectionList call.');
  }

  return props.renderItem as RadioRenderItemFn;
};

describe('RadioButtonSelect', () => {
  const mockOnSelect = vi.fn();
  const mockOnHighlight = vi.fn();

  const ITEMS: Array<RadioSelectItem<string>> = [
    { label: 'Option 1', value: 'one', key: 'one' },
    { label: 'Option 2', value: 'two', key: 'two' },
    { label: 'Option 3', value: 'three', disabled: true, key: 'three' },
  ];

  const renderComponent = (
    props: Partial<RadioButtonSelectProps<string>> = {},
  ) => {
    const defaultProps: RadioButtonSelectProps<string> = {
      items: ITEMS,
      onSelect: mockOnSelect,
      ...props,
    };
    return renderWithProviders(<RadioButtonSelect {...defaultProps} />);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Prop forwarding to BaseSelectionList', () => {
    it('should forward all props correctly when provided', () => {
      const props = {
        items: ITEMS,
        initialIndex: 1,
        onSelect: mockOnSelect,
        onHighlight: mockOnHighlight,
        isFocused: false,
        showScrollArrows: true,
        maxItemsToShow: 5,
        showNumbers: false,
      };

      renderComponent(props);

      expect(BaseSelectionList).toHaveBeenCalledTimes(1);
      expect(BaseSelectionList).toHaveBeenCalledWith(
        expect.objectContaining({
          ...props,
          renderItem: expect.any(Function),
        }),
        undefined,
      );
    });

    it('should use default props if not provided', () => {
      renderComponent({
        items: ITEMS,
        onSelect: mockOnSelect,
      });

      expect(BaseSelectionList).toHaveBeenCalledWith(
        expect.objectContaining({
          initialIndex: 0,
          isFocused: true,
          showScrollArrows: false,
          maxItemsToShow: 10,
          showNumbers: true,
        }),
        undefined,
      );
    });
  });

  describe('renderItem implementation', () => {
    let renderItem: RadioRenderItemFn;
    const mockContext: RenderItemContext = {
      isSelected: false,
      titleColor: 'MOCK_TITLE_COLOR',
      numberColor: 'MOCK_NUMBER_COLOR',
    };

    beforeEach(() => {
      renderComponent();
      renderItem = extractRenderItem();
    });

    it('should render the standard label display with correct color and truncation', () => {
      const item = ITEMS[0];

      const result = renderItem(item, mockContext);

      expect(result?.props?.color).toBe(mockContext.titleColor);
      expect(result?.props?.children).toBe('Option 1');
      expect(result?.props?.wrap).toBe('truncate');
    });

    it('should render the special theme display when theme props are present', () => {
      const themeItem: RadioSelectItem<string> = {
        label: 'Theme A (Light)',
        value: 'a-light',
        themeNameDisplay: 'Theme A',
        themeTypeDisplay: '(Light)',
        key: 'a-light',
      };

      const result = renderItem(themeItem, mockContext);

      expect(result?.props?.color).toBe(mockContext.titleColor);
      expect(result?.props?.wrap).toBe('truncate');

      const children = result?.props?.children;

      if (!Array.isArray(children) || children.length < 3) {
        throw new Error(
          'Expected children to be an array with at least 3 elements for theme display',
        );
      }

      expect(children[0]).toBe('Theme A');
      expect(children[1]).toBe(' ');

      const nestedTextElement = children[2] as React.ReactElement<{
        color?: string;
        children?: React.ReactNode;
      }>;
      expect(nestedTextElement?.props?.color).toBe('COLOR_SECONDARY');
      expect(nestedTextElement?.props?.children).toBe('(Light)');
    });

    it('should fall back to standard display if only one theme prop is present', () => {
      const partialThemeItem: RadioSelectItem<string> = {
        label: 'Incomplete Theme',
        value: 'incomplete',
        themeNameDisplay: 'Only Name',
        key: 'incomplete',
      };

      const result = renderItem(partialThemeItem, mockContext);

      expect(result?.props?.children).toBe('Incomplete Theme');
    });
  });
});
