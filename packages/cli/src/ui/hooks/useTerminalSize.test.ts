/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { useTerminalSize } from './useTerminalSize.js';
import { renderHookWithProviders } from '../../test-utils/render.js';

const mockRerender = vi.fn();

vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useApp: () => ({ rerender: mockRerender }),
  };
});

describe('useTerminalSize', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.stdout.removeAllListeners('resize');
  });

  it('should return current terminal dimensions', async () => {
    const originalColumns = process.stdout.columns;
    const originalRows = process.stdout.rows;
    process.stdout.columns = 120;
    process.stdout.rows = 40;

    const { result } = await renderHookWithProviders(() => useTerminalSize());
    expect(result.current.columns).toBe(120);
    expect(result.current.rows).toBe(40);

    process.stdout.columns = originalColumns;
    process.stdout.rows = originalRows;
  });

  it('should call rerender on resize to force full redraw', async () => {
    const originalColumns = process.stdout.columns;
    const originalRows = process.stdout.rows;
    process.stdout.columns = 80;
    process.stdout.rows = 24;

    await renderHookWithProviders(() => useTerminalSize());

    mockRerender.mockClear();
    process.stdout.columns = 100;
    process.stdout.rows = 30;
    process.stdout.emit('resize');

    expect(mockRerender).toHaveBeenCalled();

    process.stdout.columns = originalColumns;
    process.stdout.rows = originalRows;
  });
});
