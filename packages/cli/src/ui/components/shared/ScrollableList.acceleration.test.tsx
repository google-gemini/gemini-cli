/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, act } from 'react';
import { render } from 'ink-testing-library';
import { Box, Text } from 'ink';
import { ScrollableList, type ScrollableListRef } from './ScrollableList.js';
import { ScrollProvider } from '../../contexts/ScrollProvider.js';
import { KeypressProvider } from '../../contexts/KeypressContext.js';
import { MouseProvider } from '../../contexts/MouseContext.js';
import { SettingsContext } from '../../contexts/SettingsContext.js';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { LoadedSettings } from '../../../config/settings.js';
import type { Settings } from '../../../config/settingsSchema.js';

// Mock useStdout
vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    useStdout: () => ({
      stdout: {
        columns: 80,
        rows: 24,
        on: vi.fn(),
        off: vi.fn(),
        write: vi.fn(),
      },
    }),
  };
});

interface Item {
  id: string;
  title: string;
}

const mockSettings = new LoadedSettings(
  { path: '', settings: {}, originalSettings: {} },
  { path: '', settings: {}, originalSettings: {} },
  {
    path: '',
    settings: {
      ui: {
        scrollAccelerationDuration: 1000,
        maxScrollSpeedFraction: 0.4,
      },
    } as Settings,
    originalSettings: {},
  },
  { path: '', settings: {}, originalSettings: {} },
  true,
  new Set(),
);

const items: Item[] = Array.from({ length: 1000 }, (_, i) => ({
  id: String(i),
  title: `Item ${i}`,
}));

const TestComponent = ({
  onRef,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRef: (ref: any) => void;
}) => {
  const ref = useRef<ScrollableListRef<Item>>(null);
  useEffect(() => {
    onRef(ref.current);
  }, [onRef]);

  return (
    <SettingsContext.Provider value={mockSettings}>
      <MouseProvider mouseEventsEnabled={false}>
        <KeypressProvider>
          <ScrollProvider>
            <Box height={10}>
              <ScrollableList
                ref={ref}
                data={items}
                renderItem={({ item }) => <Text>{item.title}</Text>}
                estimatedItemHeight={() => 1}
                keyExtractor={(item) => item.id}
                hasFocus={true}
              />
            </Box>
          </ScrollProvider>
        </KeypressProvider>
      </MouseProvider>
    </SettingsContext.Provider>
  );
};

describe('ScrollableList Acceleration & Navigation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('handles HOME and END keys', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let listRef: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stdin: any;

    await act(async () => {
      const res = render(<TestComponent onRef={(r) => (listRef = r)} />);
      stdin = res.stdin;
    });

    if (!stdin) throw new Error('stdin not found');

    // Initial
    expect(listRef?.getScrollState().scrollTop).toBe(0);

    // Press END (ESC [ F)
    await act(async () => {
      stdin.write('\u001B[F');
      vi.advanceTimersByTime(1);
    });

    // Should be at bottom
    // Total height 1000. Inner height 10. Max scrollTop 990.
    expect(listRef?.getScrollState().scrollTop).toBeGreaterThan(900);

    // Press HOME (ESC [ H)
    await act(async () => {
      stdin.write('\u001B[H');
      vi.advanceTimersByTime(1);
    });

    expect(listRef?.getScrollState().scrollTop).toBe(0);
  });

  it('handles PAGEUP and PAGEDOWN keys', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let listRef: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stdin: any;
    await act(async () => {
      const res = render(<TestComponent onRef={(r) => (listRef = r)} />);
      stdin = res.stdin;
    });

    if (!stdin) throw new Error('stdin not found');

    expect(listRef?.getScrollState().scrollTop).toBe(0);

    // Press PAGEDOWN (ESC [ 6 ~)
    await act(async () => {
      stdin.write('\u001B[6~');
      vi.advanceTimersByTime(300);
    });

    // Should scroll by innerHeight (10)
    expect(listRef?.getScrollState().scrollTop).toBe(10);

    // Press PAGEUP (ESC [ 5 ~)
    await act(async () => {
      stdin.write('\u001B[5~');
      vi.advanceTimersByTime(300);
    });

    expect(listRef?.getScrollState().scrollTop).toBe(0);
  });

  it('does not accelerate on repeated DOWN arrow (linear scroll)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let listRef: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stdin: any;
    await act(async () => {
      const res = render(<TestComponent onRef={(r) => (listRef = r)} />);
      stdin = res.stdin;
    });

    if (!stdin) throw new Error('stdin not found');

    expect(listRef?.getScrollState().scrollTop).toBe(0);

    // 1. First press: base scroll (1 unit)
    await act(async () => {
      stdin.write('\u001B[1;2B'); // Shift+Down
      vi.advanceTimersByTime(1);
    });
    expect(listRef?.getScrollState().scrollTop).toBe(1);

    // 2. Press repeatedly
    // Press every 50ms. 10 times.
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        vi.advanceTimersByTime(50);
        stdin.write('\u001B[1;2B');
        vi.advanceTimersByTime(1);
      });
    }

    // Should be exactly 11 (1 + 10)
    expect(listRef?.getScrollState().scrollTop).toBe(11);
  });

  it('accumulates Page Down scroll distance when pressed rapidly', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let listRef: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stdin: any;
    await act(async () => {
      const res = render(<TestComponent onRef={(r) => (listRef = r)} />);
      stdin = res.stdin;
    });

    if (!stdin) throw new Error('stdin not found');

    expect(listRef?.getScrollState().scrollTop).toBe(0);

    // Press PAGEDOWN (ESC [ 6 ~) twice quickly
    // First press
    await act(async () => {
      stdin.write('\u001B[6~');
      // Advance slightly, but not enough to finish animation
      vi.advanceTimersByTime(50);
    });

    // We should be somewhere in between 0 and 10
    const midScroll = listRef?.getScrollState().scrollTop ?? 0;
    expect(midScroll).toBeGreaterThan(0);
    expect(midScroll).toBeLessThan(10);

    // Second press - should add another 10 to the target
    await act(async () => {
      stdin.write('\u001B[6~');
      // Advance to finish
      vi.advanceTimersByTime(300);
    });

    // Should be at 20 (10 + 10)
    expect(listRef?.getScrollState().scrollTop).toBe(20);
  });
});
