/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { useState, useEffect } from 'react';
import { Text } from 'ink';
import { renderHook, render } from './render.js';
import { waitFor } from './async.js';

describe('render', () => {
  it('should render a component', () => {
    const { lastFrame } = render(<Text>Hello World</Text>);
    expect(lastFrame()).toBe('Hello World');
  });

  it('should support rerender', () => {
    const { lastFrame, rerender } = render(<Text>Hello</Text>);
    expect(lastFrame()).toBe('Hello');

    rerender(<Text>World</Text>);
    expect(lastFrame()).toBe('World');
  });

  it('should support unmount', () => {
    const cleanup = vi.fn();
    function TestComponent() {
      useEffect(() => cleanup, []);
      return <Text>Hello</Text>;
    }

    const { unmount } = render(<TestComponent />);
    unmount();

    expect(cleanup).toHaveBeenCalled();
  });
});

describe('renderHook', () => {
  it('should rerender with previous props when called without arguments', async () => {
    const useTestHook = ({ value }: { value: number }) => {
      const [count, setCount] = useState(0);
      useEffect(() => {
        setCount((c) => c + 1);
      }, [value]);
      return { count, value };
    };

    const { result, rerender } = renderHook(useTestHook, {
      initialProps: { value: 1 },
    });

    expect(result.current.value).toBe(1);
    await waitFor(() => expect(result.current.count).toBe(1));

    // Rerender with new props
    rerender({ value: 2 });
    expect(result.current.value).toBe(2);
    await waitFor(() => expect(result.current.count).toBe(2));

    // Rerender without arguments should use previous props (value: 2)
    // This would previously crash or pass undefined if not fixed
    rerender();
    expect(result.current.value).toBe(2);
    // Count should not increase because value didn't change
    await waitFor(() => expect(result.current.count).toBe(2));
  });

  it('should handle initial render without props', () => {
    const useTestHook = () => {
      const [count, setCount] = useState(0);
      return { count, increment: () => setCount((c) => c + 1) };
    };

    const { result, rerender } = renderHook(useTestHook);

    expect(result.current.count).toBe(0);

    rerender();
    expect(result.current.count).toBe(0);
  });

  it('should update props if undefined is passed explicitly', () => {
    const useTestHook = (val: string | undefined) => val;
    const { result, rerender } = renderHook(useTestHook, {
      initialProps: 'initial',
    });

    expect(result.current).toBe('initial');

    rerender(undefined);
    expect(result.current).toBeUndefined();
  });
});
