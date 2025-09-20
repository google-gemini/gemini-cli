/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import type React from 'react';
import {
  DescriptiveRadioButtonSelect,
  type DescriptiveRadioSelectItem,
  type DescriptiveRadioButtonSelectProps,
} from './DescriptiveRadioButtonSelect.js';
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

type DescriptiveRenderItemFn = (
  item: DescriptiveRadioSelectItem<string>,
  context: RenderItemContext,
) => React.JSX.Element;

const extractRenderItem = (): DescriptiveRenderItemFn => {
  const mockCalls = MockedBaseSelectionList.mock.calls;

  if (mockCalls.length === 0) {
    throw new Error(
      'BaseSelectionList was not called. Ensure DescriptiveRadioButtonSelect is rendered before calling extractRenderItem.',
    );
  }

  const props = mockCalls[0][0] as BaseSelectionListProps<
    string,
    DescriptiveRadioSelectItem<string>
  >;

  if (typeof props.renderItem !== 'function') {
    throw new Error('renderItem prop was not found on BaseSelectionList call.');
  }

  return props.renderItem as DescriptiveRenderItemFn;
};

describe('DescriptiveRadioButtonSelect', () => {
  const mockOnSelect = vi.fn();
  const mockOnHighlight = vi.fn();

  const ITEMS: Array<DescriptiveRadioSelectItem<string>> = [
    { title: 'Foo Title', description: 'This is Foo.', value: 'foo' },
    { title: 'Bar Title', description: 'This is Bar.', value: 'bar' },
    {
      title: 'Baz Title',
      description: 'This is Baz.',
      value: 'baz',
      disabled: true,
    },
  ];

  const renderComponent = (
    props: Partial<DescriptiveRadioButtonSelectProps<string>> = {},
  ) => {
    const defaultProps: DescriptiveRadioButtonSelectProps<string> = {
      items: ITEMS,
      onSelect: mockOnSelect,
      ...props,
    };
    return renderWithProviders(
      <DescriptiveRadioButtonSelect {...defaultProps} />,
    );
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
          showNumbers: false,
        }),
        undefined,
      );
    });
  });

  describe('renderItem implementation', () => {
    let renderItem: DescriptiveRenderItemFn;
    const mockContext: RenderItemContext = {
      isSelected: false,
      titleColor: 'MOCK_TITLE_COLOR',
      numberColor: 'MOCK_NUMBER_COLOR',
    };

    beforeEach(() => {
      renderComponent();
      renderItem = extractRenderItem();
    });

    it('should render title and description with correct colors', () => {
      const item = ITEMS[0];

      const result = renderItem(item, mockContext);

      // Should be a Box with flexDirection="column"
      expect(result?.props?.flexDirection).toBe('column');
      expect(result?.props?.children).toHaveLength(2);

      const [titleElement, descriptionElement] = result?.props?.children || [];

      // Title should use titleColor
      expect(titleElement?.props?.color).toBe(mockContext.titleColor);
      expect(titleElement?.props?.children).toBe('Foo Title');

      // Description should use secondary color
      expect(descriptionElement?.props?.color).toBe('COLOR_SECONDARY');
      expect(descriptionElement?.props?.children).toBe('This is Foo.');
    });

    it('should render different items with their respective content', () => {
      const item = ITEMS[1];

      const result = renderItem(item, mockContext);

      const [titleElement, descriptionElement] = result?.props?.children || [];

      expect(titleElement?.props?.children).toBe('Bar Title');
      expect(descriptionElement?.props?.children).toBe('This is Bar.');
    });
  });
});
