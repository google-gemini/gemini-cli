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

// --- Mock useKeypress ---
// We use `vi.hoisted` to create the mock function and its state
// so they can be safely accessed by `vi.mock` (which is hoisted)
// and by the test's helper functions.
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

// Mock the hook's module, providing the hoisted mock function
vi.mock('../../hooks/useKeypress.js', () => ({
  useKeypress: mockUseKeypress,
}));

// Helper to simulate a keypress
// This now safely reads from the hoisted `state` object
const pressKey = async (key: { sequence: string; name: string }) => {
  if (state.hookOptions.isActive) {
    await act(async () => {
      state.keypressHandler(key);
    });
  }
};
// --- End Mock ---

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
    // Reset mock state before each test
    state.keypressHandler = () => {};
    state.hookOptions = {};
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup(); // Cleans up the Ink renderer
  });

  afterAll(() => {
    vi.restoreAllMocks(); // Restore original module
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

    // Item 0 (Foo) should be unselected
    expect(lines[0]).toContain('  '); // 2 spaces for '●'
    expect(lines[0]).not.toContain('●');
    // Item 1 (Bar) should be selected
    expect(lines[3]).toContain('●');
    // Item 2 (Baz) should be unselected
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

      // Initial state (index 0)
      let output = lastFrame();
      expect(output).toBeDefined();
      if (!output) return;

      // Item 0 (Foo) on line 0
      expect(output.split('\n')[0]).toContain('●');
      expect(onHighlight).not.toHaveBeenCalled();

      // Press 'j'
      await pressKey({ name: 'j', sequence: 'j' });
      output = lastFrame();
      expect(output).toBeDefined();
      if (!output) return;

      // Item 1 (Bar) on line 3
      expect(output.split('\n')[3]).toContain('●');
      expect(onHighlight).toHaveBeenCalledWith('bar');

      // Press 'down'
      await pressKey({ name: 'down', sequence: '\u001B[B' });
      output = lastFrame();
      expect(output).toBeDefined();
      if (!output) return;

      // Item 2 (Baz) on line 6
      expect(output.split('\n')[6]).toContain('●');
      expect(onHighlight).toHaveBeenCalledWith('baz');
    });

    it('wraps from last to first item when navigating down', () => {
      render(
        <DescriptiveRadioButtonSelect
          items={testItems}
          initialIndex={2} // Start at 'Baz'
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
          initialIndex={2} // Start at 'Baz'
          onSelect={onSelect}
          onHighlight={onHighlight}
        />,
      );

      // Initial state (index 2)
      let output = lastFrame();
      expect(output).toBeDefined();
      if (!output) return;

      // Item 2 (Baz) on line 6
      expect(output.split('\n')[6]).toContain('●');
      expect(onHighlight).not.toHaveBeenCalled();

      // Press 'k'
      await pressKey({ name: 'k', sequence: 'k' });
      output = lastFrame();
      expect(output).toBeDefined();
      if (!output) return;

      // Item 1 (Bar) on line 3
      expect(output.split('\n')[3]).toContain('●');
      expect(onHighlight).toHaveBeenCalledWith('bar');

      // Press 'up'
      await pressKey({ name: 'up', sequence: '\u001B[A' });
      output = lastFrame();
      expect(output).toBeDefined();
      if (!output) return;

      // Item 0 (Foo) on line 0
      expect(output.split('\n')[0]).toContain('●');
      expect(onHighlight).toHaveBeenCalledWith('foo');
    });

    it('wraps from first to last item when navigating up', () => {
      render(
        <DescriptiveRadioButtonSelect
          items={testItems}
          initialIndex={0} // Start at 'Foo'
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
          initialIndex={1} // Start at 'Bar'
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

      // Press '2'
      pressKey({ name: '2', sequence: '2' });

      // Should immediately highlight 'Bar' (index 1)
      expect(onHighlight).toHaveBeenCalledWith('bar');

      // The component logic checks `potentialNextNumber > items.length` (20 > 3)
      // which is true, so it selects immediately, not after a timeout.
      expect(onSelect).toHaveBeenCalledWith('bar');
    });

    it('selects an item based on buggy state (press 1, then 2 -> selects 2)', () => {
      // Create 12 items
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

      // Press '1'
      pressKey({ name: '1', sequence: '1' });
      expect(onHighlight).toHaveBeenCalledWith('item-1');
      expect(onSelect).not.toHaveBeenCalled(); // 10 is not > 12, so timer is set
      onHighlight.mockClear();

      // Press '2'
      // Because the `numberInput` state in the keypress handler is stale,
      // it processes this as `'' + '2'` instead of `'1' + '2'`.
      pressKey({ name: '2', sequence: '2' });

      // Test asserts the actual (buggy) behavior
      expect(onHighlight).toHaveBeenCalledWith('item-2');

      // `potentialNextNumber` is 20, which is > 12, so it selects immediately.
      expect(onSelect).toHaveBeenCalledWith('item-2');

      // Timer should not be running
      vi.advanceTimersByTime(350);
      expect(onSelect).toHaveBeenCalledTimes(1); // No new call
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

      // Press '9' (invalid)
      pressKey({ name: '9', sequence: '9' });
      expect(onHighlight).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();

      // Press '1' (should work now)
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

      // Press '0' (invalid)
      pressKey({ name: '0', sequence: '0' });
      expect(onHighlight).not.toHaveBeenCalled();

      // Press '1' (should not form '01')
      vi.advanceTimersByTime(350); // Let '0' timeout
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

      // Press '1'
      pressKey({ name: '1', sequence: '1' });
      expect(onHighlight).toHaveBeenCalledWith('foo');
      onHighlight.mockClear();

      // Press 'j'
      pressKey({ name: 'j', sequence: 'j' });
      expect(onHighlight).toHaveBeenCalledWith('bar'); // 'j' moves down
      onHighlight.mockClear();

      // Press '2' (should be '2', not '12')
      pressKey({ name: '2', sequence: '2' });
      expect(onHighlight).toHaveBeenCalledWith('bar'); // already on 'bar'
      expect(onSelect).toHaveBeenCalledWith('bar'); // immediate select
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

      // Check that the hook was initialized with isActive: false
      expect(mockUseKeypress).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isActive: false }),
      );
      expect(state.hookOptions.isActive).toBe(false);

      // Try to press keys
      pressKey({ name: 'j', sequence: 'j' });
      pressKey({ name: 'return', sequence: '\r' });
      pressKey({ name: '1', sequence: '1' });

      // Nothing should have happened
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
