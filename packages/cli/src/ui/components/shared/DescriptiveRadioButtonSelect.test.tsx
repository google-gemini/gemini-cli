/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import {
  DescriptiveRadioButtonSelect,
  type DescriptiveRadioSelectItem,
  type DescriptiveRadioButtonSelectProps,
} from './DescriptiveRadioButtonSelect.js';

vi.mock('./BaseSelectionList.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./BaseSelectionList.js')>();
  return {
    ...actual,
    BaseSelectionList: vi.fn(({ children, ...props }) => (
      <actual.BaseSelectionList {...props}>{children}</actual.BaseSelectionList>
    )),
  };
});

vi.mock('../../semantic-colors.js', () => ({
  theme: {
    text: {
      primary: 'COLOR_PRIMARY',
      secondary: 'COLOR_SECONDARY',
    },
    status: {
      success: 'COLOR_SUCCESS',
    },
  },
}));

describe('DescriptiveRadioButtonSelect', () => {
  const mockOnSelect = vi.fn();
  const mockOnHighlight = vi.fn();

  const ITEMS: Array<DescriptiveRadioSelectItem<string>> = [
    {
      title: 'Foo Title',
      description: 'This is Foo.',
      value: 'foo',
      key: 'foo',
    },
    {
      title: 'Bar Title',
      description: 'This is Bar.',
      value: 'bar',
      key: 'bar',
    },
    {
      title: 'Baz Title',
      description: 'This is Baz.',
      value: 'baz',
      disabled: true,
      key: 'baz',
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

  it('should render correctly with default props', () => {
    const { lastFrame } = renderComponent();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('should render correctly with custom props', () => {
    const { lastFrame } = renderComponent({
      initialIndex: 1,
      isFocused: false,
      showScrollArrows: true,
      maxItemsToShow: 5,
      showNumbers: true,
      onHighlight: mockOnHighlight,
    });
    expect(lastFrame()).toMatchSnapshot();
  });
});
