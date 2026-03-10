/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { useState, useEffect, act } from 'react';
import { Text } from 'ink';
import { renderHook, render } from './render.js';
import { waitFor } from './async.js';

describe('render', () => {
  it('should render a component', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <Text>Hello World</Text>,
    );
    await waitUntilReady();
    expect(lastFrame()).toBe('Hello World\n');
    unmount();
  });

  it('should support rerender', async () => {
    const { lastFrame, rerender, waitUntilReady, unmount } = render(
      <Text>Hello</Text>,
    );
    await waitUntilReady();
    expect(lastFrame()).toBe('Hello\n');

    await act(async () => {
      rerender(<Text>World</Text>);
    });
    await waitUntilReady();
    expect(lastFrame()).toBe('World\n');
    unmount();
  });

  it('should support unmount', async () => {
    const cleanupMock = vi.fn();
    function TestComponent() {
      useEffect(() => cleanupMock, []);
      return <Text>Hello</Text>;
    }

    const { unmount, waitUntilReady } = render(<TestComponent />);
    await waitUntilReady();
    unmount();

    expect(cleanupMock).toHaveBeenCalled();
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

    const { result, rerender, waitUntilReady, unmount } = renderHook(
      useTestHook,
      {
        initialProps: { value: 1 },
      },
    );
    await waitUntilReady();

    expect(result.current.value).toBe(1);
    await waitFor(() => expect(result.current.count).toBe(1));

    // Rerender with new props
    await act(async () => {
      rerender({ value: 2 });
    });
    await waitUntilReady();
    expect(result.current.value).toBe(2);
    await waitFor(() => expect(result.current.count).toBe(2));

    // Rerender without arguments should use previous props (value: 2)
    // This would previously crash or pass undefined if not fixed
    await act(async () => {
      rerender();
    });
    await waitUntilReady();
    expect(result.current.value).toBe(2);
    // Count should not increase because value didn't change
    await waitFor(() => expect(result.current.count).toBe(2));
    unmount();
  });

  it('should handle initial render without props', async () => {
    const useTestHook = () => {
      const [count, setCount] = useState(0);
      return { count, increment: () => setCount((c) => c + 1) };
    };

    const { result, rerender, waitUntilReady, unmount } =
      renderHook(useTestHook);
    await waitUntilReady();

    expect(result.current.count).toBe(0);

    await act(async () => {
      rerender();
    });
    await waitUntilReady();
    expect(result.current.count).toBe(0);
    unmount();
  });

  it('should update props if undefined is passed explicitly', async () => {
    const useTestHook = (val: string | undefined) => val;
    const { result, rerender, waitUntilReady, unmount } = renderHook(
      useTestHook,
      {
        initialProps: 'initial' as string | undefined,
      },
    );
    await waitUntilReady();

    expect(result.current).toBe('initial');

    await act(async () => {
      rerender(undefined);
    });
    await waitUntilReady();
    expect(result.current).toBeUndefined();
    unmount();
  });
});
