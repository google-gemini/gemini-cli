/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, cleanup } from 'ink-testing-library';
import { act } from 'react-dom/test-utils';
import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
} from 'vitest';
import {
  DescriptiveRadioButtonSelect,
  type DescriptiveRadioSelectItem,
} from './DescriptiveRadioButtonSelect.js';

const { mockUseKeypress, state } = vi.hoisted(() => {
  const state: {
    keypressHandler: (key: { sequence: string; name: string }) => void;
    hookOptions: { isActive?: boolean };
  } = {
    keypressHandler: () => {},
    hookOptions: {},
  };

  const mockUseKeypress = vi.fn((handler, options) => {
    state.keypressHandler = handler;
    state.hookOptions = options ?? {};
  });

  return { mockUseKeypress, state };
});

vi.mock('../../hooks/useKeypress.js', () => ({
  useKeypress: mockUseKeypress,
}));

const pressKey = async (key: { sequence: string; name: string }) => {
  if (state.hookOptions.isActive) {
    await act(async () => {
      state.keypressHandler(key);
    });
  }
};

const testItems: Array<DescriptiveRadioSelectItem<string>> = [
  { value: 'foo', title: 'Foo', description: 'This is Foo.' },
  { value: 'bar', title: 'Bar', description: 'This is Bar.' },
  { value: 'baz', title: 'Baz', description: 'This is Baz.' },
];

describe('DescriptiveRadioButtonSelect', () => {
  const onSelect = vi.fn();
  const onHighlight = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    state.keypressHandler = () => {};
    state.hookOptions = {};
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('renders all items with titles and descriptions', () => {
    const { lastFrame } = render(
      <DescriptiveRadioButtonSelect
        items={testItems}
        onSelect={onSelect}
        onHighlight={onHighlight}
      />,
    );

    const output = lastFrame();
    expect(output).toBeDefined();
    if (!output) return;

    expect(output).toContain('Foo');
    expect(output).toContain('This is Foo.');
    expect(output).toContain('Bar');
    expect(output).toContain('This is Bar.');
    expect(output).toContain('Baz');
    expect(output).toContain('This is Baz.');
  });

  it('highlights the initialIndex item', () => {
    const { lastFrame } = render(
      <DescriptiveRadioButtonSelect
        items={testItems}
        initialIndex={1}
        onSelect={onSelect}
      />,
    );

    const output = lastFrame();
    expect(output).toBeDefined();
    if (!output) return;

    const lines = output.split('\n');

    // Each item renders as 3 lines: Title, Description, Margin (newline)
    // Item 0 (Foo) is lines 0-2
    // Item 1 (Bar) is lines 3-5
    // Item 2 (Baz) is lines 6-8

    expect(lines[0]).toContain('  '); // 2 spaces for '●'
    expect(lines[0]).not.toContain('●');
    expect(lines[3]).toContain('●');
    expect(lines[6]).toContain('  ');
    expect(lines[6]).not.toContain('●');
  });

  it('shows numbers when showNumbers is true', () => {
    const { lastFrame } = render(
      <DescriptiveRadioButtonSelect
        items={testItems}
        onSelect={onSelect}
        showNumbers={true}
      />,
    );

    const output = lastFrame();
    expect(output).toBeDefined();
    if (!output) return;

    expect(output).toContain('1.');
    expect(output).toContain('2.');
    expect(output).toContain('3.');
  });

  it('does not show numbers when showNumbers is false', () => {
    const { lastFrame } = render(
      <DescriptiveRadioButtonSelect
        items={testItems}
        onSelect={onSelect}
        showNumbers={false}
      />,
    );

    const output = lastFrame();
    expect(output).toBeDefined();
    if (!output) return;

    expect(output).not.toContain('1.');
    expect(output).not.toContain('2.');
    expect(output).not.toContain('3.');
  });

  describe('Keyboard Navigation', () => {
    it('navigates down with "j" or "down"', async () => {
      const { lastFrame } = render(
        <DescriptiveRadioButtonSelect
          items={testItems}
          onSelect={onSelect}
          onHighlight={onHighlight}
        />,
      );

      let output = lastFrame();
      expect(output).toBeDefined();
      if (!output) return;

      expect(output.split('\n')[0]).toContain('●');
      expect(onHighlight).not.toHaveBeenCalled();

      await pressKey({ name: 'j', sequence: 'j' });
      output = lastFrame();
      expect(output).toBeDefined();
      if (!output) return;

      expect(output.split('\n')[3]).toContain('●');
      expect(onHighlight).toHaveBeenCalledWith('bar');

      await pressKey({ name: 'down', sequence: '\u001B[B' });
      output = lastFrame();
      expect(output).toBeDefined();
      if (!output) return;

      expect(output.split('\n')[6]).toContain('●');
      expect(onHighlight).toHaveBeenCalledWith('baz');
    });

    it('wraps from last to first item when navigating down', () => {
      render(
        <DescriptiveRadioButtonSelect
          items={testItems}
          initialIndex={2}
          onSelect={onSelect}
          onHighlight={onHighlight}
        />,
      );

      pressKey({ name: 'j', sequence: 'j' });
      expect(onHighlight).toHaveBeenCalledWith('foo');
    });

    it('navigates up with "k" or "up"', async () => {
      const { lastFrame } = render(
        <DescriptiveRadioButtonSelect
          items={testItems}
          initialIndex={2}
          onSelect={onSelect}
          onHighlight={onHighlight}
        />,
      );

      // Initial state (index 2)
      let output = lastFrame();
      expect(output).toBeDefined();
      if (!output) return;

      expect(output.split('\n')[6]).toContain('●');
      expect(onHighlight).not.toHaveBeenCalled();

      await pressKey({ name: 'k', sequence: 'k' });
      output = lastFrame();
      expect(output).toBeDefined();
      if (!output) return;

      expect(output.split('\n')[3]).toContain('●');
      expect(onHighlight).toHaveBeenCalledWith('bar');

      await pressKey({ name: 'up', sequence: '\u001B[A' });
      output = lastFrame();
      expect(output).toBeDefined();
      if (!output) return;

      expect(output.split('\n')[0]).toContain('●');
      expect(onHighlight).toHaveBeenCalledWith('foo');
    });

    it('wraps from first to last item when navigating up', () => {
      render(
        <DescriptiveRadioButtonSelect
          items={testItems}
          initialIndex={0}
          onSelect={onSelect}
          onHighlight={onHighlight}
        />,
      );

      pressKey({ name: 'k', sequence: 'k' });
      expect(onHighlight).toHaveBeenCalledWith('baz');
    });

    it('selects the active item with "return"', () => {
      render(
        <DescriptiveRadioButtonSelect
          items={testItems}
          initialIndex={1}
          onSelect={onSelect}
          onHighlight={onHighlight}
        />,
      );

      pressKey({ name: 'return', sequence: '\r' });
      expect(onSelect).toHaveBeenCalledWith('bar');
      expect(onHighlight).not.toHaveBeenCalled();
    });
  });

  describe('Numeric Input', () => {
    it('selects an item by number immediately (for lists < 10)', () => {
      render(
        <DescriptiveRadioButtonSelect
          items={testItems}
          onSelect={onSelect}
          onHighlight={onHighlight}
          showNumbers={true}
        />,
      );

      pressKey({ name: '2', sequence: '2' });

      expect(onHighlight).toHaveBeenCalledWith('bar');

      expect(onSelect).toHaveBeenCalledWith('bar');
    });

    it('selects an item with multi-digit input', () => {
      const manyItems = Array.from({ length: 12 }, (_, i) => ({
        value: `item-${i + 1}`,
        title: `Item ${i + 1}`,
        description: `Desc ${i + 1}`,
      }));

      render(
        <DescriptiveRadioButtonSelect
          items={manyItems}
          onSelect={onSelect}
          onHighlight={onHighlight}
          showNumbers={true}
        />,
      );

      pressKey({ name: '1', sequence: '1' });
      expect(onHighlight).toHaveBeenCalledWith('item-1');
      expect(onSelect).not.toHaveBeenCalled();
      onHighlight.mockClear();

      pressKey({ name: '2', sequence: '2' });

      expect(onHighlight).toHaveBeenCalledWith('item-12');

      expect(onSelect).toHaveBeenCalledWith('item-12');

      vi.advanceTimersByTime(350);
      expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('resets number input on invalid number', () => {
      render(
        <DescriptiveRadioButtonSelect
          items={testItems}
          onSelect={onSelect}
          onHighlight={onHighlight}
          showNumbers={true}
        />,
      );

      pressKey({ name: '9', sequence: '9' });
      expect(onHighlight).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();

      pressKey({ name: '1', sequence: '1' });
      expect(onHighlight).toHaveBeenCalledWith('foo');
    });

    it('resets number input on "0"', () => {
      render(
        <DescriptiveRadioButtonSelect
          items={testItems}
          onSelect={onSelect}
          onHighlight={onHighlight}
          showNumbers={true}
        />,
      );

      pressKey({ name: '0', sequence: '0' });
      expect(onHighlight).not.toHaveBeenCalled();

      vi.advanceTimersByTime(350);
      pressKey({ name: '1', sequence: '1' });
      expect(onHighlight).toHaveBeenCalledWith('foo');
    });

    it('resets number input on non-numeric key', () => {
      render(
        <DescriptiveRadioButtonSelect
          items={testItems}
          onSelect={onSelect}
          onHighlight={onHighlight}
          showNumbers={true}
        />,
      );

      pressKey({ name: '1', sequence: '1' });
      expect(onHighlight).toHaveBeenCalledWith('foo');
      onHighlight.mockClear();

      pressKey({ name: 'j', sequence: 'j' });
      expect(onHighlight).toHaveBeenCalledWith('bar');
      onHighlight.mockClear();

      pressKey({ name: '2', sequence: '2' });
      expect(onHighlight).toHaveBeenCalledWith('bar');
      expect(onSelect).toHaveBeenCalledWith('bar');
    });
  });

  describe('Focus Management', () => {
    it('does not register keypresses when isFocused is false', () => {
      render(
        <DescriptiveRadioButtonSelect
          items={testItems}
          onSelect={onSelect}
          onHighlight={onHighlight}
          isFocused={false}
        />,
      );

      expect(mockUseKeypress).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isActive: false }),
      );
      expect(state.hookOptions.isActive).toBe(false);

      pressKey({ name: 'j', sequence: 'j' });
      pressKey({ name: 'return', sequence: '\r' });
      pressKey({ name: '1', sequence: '1' });

      expect(onHighlight).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('registers keypresses when isFocused is true', () => {
      render(
        <DescriptiveRadioButtonSelect
          items={testItems}
          onSelect={onSelect}
          onHighlight={onHighlight}
          isFocused={true}
        />,
      );

      expect(state.hookOptions.isActive).toBe(true);

      pressKey({ name: 'j', sequence: 'j' });
      expect(onHighlight).toHaveBeenCalledWith('bar');
    });
  });
});
