/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type React from 'react';
import { Box, type Text } from 'ink';
import { type RadioSelectItem } from './RadioButtonSelect.js';
import { type RenderItemContext } from './BaseSelectionList.js';

import { defaultRadioRenderItem } from './RadioButtonSelect.js';

import { theme } from '../../semantic-colors.js';

describe('RadioButtonSelect', () => {
  const ITEMS: Array<RadioSelectItem<string>> = [
    { label: 'Option 1', value: 'one', key: 'one' },
    { label: 'Option 2', value: 'two', key: 'two' },
    { label: 'Option 3', value: 'three', disabled: true, key: 'three' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('renderItem implementation', () => {
    const mockContext: RenderItemContext = {
      isSelected: false,
      titleColor: 'MOCK_TITLE_COLOR',
      numberColor: 'MOCK_NUMBER_COLOR',
    };

    const renderItem = defaultRadioRenderItem;

    it('should render the standard label display with correct color and truncation', () => {
      const item = ITEMS[0];

      const result = renderItem(item, mockContext);

      expect(result.type).toBe(Box);
      const props = result.props as { children: React.ReactNode };
      const textComponent = (props.children as React.ReactElement[])[0];
      const textProps = textComponent?.props as React.ComponentProps<
        typeof Text
      >;

      expect(textProps?.color).toBe(mockContext.titleColor);
      expect(textProps?.children).toBe('Option 1');
      expect(textProps?.wrap).toBe('truncate');
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
      expect(nestedTextElement?.props?.color).toBe(theme.text.secondary);
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

      expect(result.type).toBe(Box);
      const props = result.props as { children: React.ReactNode };
      const textComponent = (props.children as React.ReactElement[])[0];
      const textProps = textComponent?.props as React.ComponentProps<
        typeof Text
      >;
      expect(textProps?.children).toBe('Incomplete Theme');
    });
  });
});
