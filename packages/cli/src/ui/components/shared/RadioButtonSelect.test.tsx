/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { waitFor } from '@testing-library/react';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './RadioButtonSelect.js';
import { describe, it, expect, vi } from 'vitest';

const ITEMS: Array<RadioSelectItem<string>> = [
  { label: 'Option 1', value: 'one' },
  { label: 'Option 2', value: 'two' },
  { label: 'Option 3', value: 'three', disabled: true },
];

describe('<RadioButtonSelect />', () => {
  it('renders a list of items and matches snapshot', () => {
    const { lastFrame } = renderWithProviders(
      <RadioButtonSelect items={ITEMS} onSelect={() => {}} isFocused={true} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders with the second item selected and matches snapshot', () => {
    const { lastFrame } = renderWithProviders(
      <RadioButtonSelect items={ITEMS} initialIndex={1} onSelect={() => {}} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders with numbers hidden and matches snapshot', () => {
    const { lastFrame } = renderWithProviders(
      <RadioButtonSelect
        items={ITEMS}
        onSelect={() => {}}
        showNumbers={false}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders with scroll arrows and matches snapshot', () => {
    const manyItems = Array.from({ length: 20 }, (_, i) => ({
      label: `Item ${i + 1}`,
      value: `item-${i + 1}`,
    }));
    const { lastFrame } = renderWithProviders(
      <RadioButtonSelect
        items={manyItems}
        onSelect={() => {}}
        showScrollArrows={true}
        maxItemsToShow={5}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders with special theme display and matches snapshot', () => {
    const themeItems: Array<RadioSelectItem<string>> = [
      {
        label: 'Theme A (Light)',
        value: 'a-light',
        themeNameDisplay: 'Theme A',
        themeTypeDisplay: '(Light)',
      },
      {
        label: 'Theme B (Dark)',
        value: 'b-dark',
        themeNameDisplay: 'Theme B',
        themeTypeDisplay: '(Dark)',
      },
    ];
    const { lastFrame } = renderWithProviders(
      <RadioButtonSelect items={themeItems} onSelect={() => {}} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a list with >10 items and matches snapshot', () => {
    const manyItems = Array.from({ length: 12 }, (_, i) => ({
      label: `Item ${i + 1}`,
      value: `item-${i + 1}`,
    }));
    const { lastFrame } = renderWithProviders(
      <RadioButtonSelect items={manyItems} onSelect={() => {}} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders nothing when no items are provided', () => {
    const { lastFrame } = renderWithProviders(
      <RadioButtonSelect items={[]} onSelect={() => {}} isFocused={true} />,
    );
    expect(lastFrame()).toBe('');
  });
});

describe('keyboard navigation', () => {
  it('should call onSelect when "enter" is pressed', () => {
    const onSelect = vi.fn();
    const { stdin } = renderWithProviders(
      <RadioButtonSelect items={ITEMS} onSelect={onSelect} />,
    );

    stdin.write('\r');

    expect(onSelect).toHaveBeenCalledWith('one');
  });

  describe('when isFocused is false', () => {
    it('should not handle any keyboard input', () => {
      const onSelect = vi.fn();
      const { stdin } = renderWithProviders(
        <RadioButtonSelect
          items={ITEMS}
          onSelect={onSelect}
          isFocused={false}
        />,
      );

      stdin.write('\u001B[B'); // Down arrow
      stdin.write('\u001B[A'); // Up arrow
      stdin.write('\r'); // Enter

      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe.each([
    { description: 'when isFocused is true', isFocused: true },
    { description: 'when isFocused is omitted', isFocused: undefined },
  ])('$description', ({ isFocused }) => {
    it('should navigate down with arrow key and select with enter', async () => {
      const onSelect = vi.fn();
      const { stdin, lastFrame } = renderWithProviders(
        <RadioButtonSelect
          items={ITEMS}
          onSelect={onSelect}
          isFocused={isFocused}
        />,
      );

      stdin.write('\u001B[B'); // Down arrow

      await waitFor(() => {
        expect(lastFrame()).toContain('● 2. Option 2');
      });

      stdin.write('\r');

      expect(onSelect).toHaveBeenCalledWith('two');
    });

    it('should navigate up with arrow key and select with enter', async () => {
      const onSelect = vi.fn();
      const { stdin, lastFrame } = renderWithProviders(
        <RadioButtonSelect
          items={ITEMS}
          onSelect={onSelect}
          initialIndex={1}
          isFocused={isFocused}
        />,
      );

      stdin.write('\u001B[A'); // Up arrow

      await waitFor(() => {
        expect(lastFrame()).toContain('● 1. Option 1');
      });

      stdin.write('\r');

      expect(onSelect).toHaveBeenCalledWith('one');
    });
  });
});
