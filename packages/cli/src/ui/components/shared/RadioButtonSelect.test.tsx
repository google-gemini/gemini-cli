/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './RadioButtonSelect.js';
import { describe, it, expect } from 'vitest';

const ITEMS: Array<RadioSelectItem<string>> = [
  { label: 'Option 1', value: 'one' },
  { label: 'Option 2', value: 'two' },
  { label: 'Option 3', value: 'three', disabled: true },
];

describe('<RadioButtonSelect />', () => {
  it('renders a list of items and matches snapshot', () => {
    const { lastFrame } = render(
      <RadioButtonSelect items={ITEMS} onSelect={() => {}} isFocused={true} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders with the second item selected and matches snapshot', () => {
    const { lastFrame } = render(
      <RadioButtonSelect
        items={ITEMS}
        initialIndex={1}
        onSelect={() => {}}
        isFocused={true}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders with numbers hidden and matches snapshot', () => {
    const { lastFrame } = render(
      <RadioButtonSelect
        items={ITEMS}
        onSelect={() => {}}
        isFocused={true}
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
    const { lastFrame } = render(
      <RadioButtonSelect
        items={manyItems}
        onSelect={() => {}}
        isFocused={true}
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
    const { lastFrame } = render(
      <RadioButtonSelect
        items={themeItems}
        onSelect={() => {}}
        isFocused={true}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders a list with >10 items and matches snapshot', () => {
    const manyItems = Array.from({ length: 12 }, (_, i) => ({
      label: `Item ${i + 1}`,
      value: `item-${i + 1}`,
    }));
    const { lastFrame } = render(
      <RadioButtonSelect
        items={manyItems}
        onSelect={() => {}}
        isFocused={true}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders nothing when no items are provided', () => {
    const { lastFrame } = render(
      <RadioButtonSelect items={[]} onSelect={() => {}} isFocused={true} />,
    );
    expect(lastFrame()).toBe('');
  });
});
