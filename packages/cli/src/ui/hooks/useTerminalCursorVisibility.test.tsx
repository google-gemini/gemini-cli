/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '../../test-utils/render.js';
import { useTerminalCursorVisibility } from './useTerminalCursorVisibility.js';
import { useStdout } from 'ink';
import type { Mock } from 'vitest';

vi.mock('ink', async (importOriginal) => {
  const original = await importOriginal<typeof import('ink')>();
  return {
    ...original,
    useStdout: vi.fn(),
  };
});

const SHOW_CURSOR = '\x1b[?25h';
const HIDE_CURSOR = '\x1b[?25l';

describe('useTerminalCursorVisibility', () => {
  let mockWrite: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWrite = vi.fn();
    (useStdout as Mock).mockReturnValue({
      stdout: { write: mockWrite },
    });
  });

  it('should show cursor when visible is true', () => {
    function TestComponent() {
      useTerminalCursorVisibility(true);
      return null;
    }
    render(<TestComponent />);
    expect(mockWrite).toHaveBeenCalledWith(SHOW_CURSOR);
  });

  it('should hide cursor when visible is false', () => {
    function TestComponent() {
      useTerminalCursorVisibility(false);
      return null;
    }
    render(<TestComponent />);
    expect(mockWrite).toHaveBeenCalledWith(HIDE_CURSOR);
  });

  it('should show cursor when visibility changes from false to true', () => {
    function TestComponent({ visible }: { visible: boolean }) {
      useTerminalCursorVisibility(visible);
      return null;
    }
    const { rerender } = render(<TestComponent visible={false} />);

    mockWrite.mockClear();
    rerender(<TestComponent visible={true} />);

    // Cleanup of previous effect hides cursor, then new effect shows it
    expect(mockWrite).toHaveBeenCalledWith(HIDE_CURSOR);
    expect(mockWrite).toHaveBeenCalledWith(SHOW_CURSOR);
  });

  it('should hide cursor when visibility changes from true to false', () => {
    function TestComponent({ visible }: { visible: boolean }) {
      useTerminalCursorVisibility(visible);
      return null;
    }
    const { rerender } = render(<TestComponent visible={true} />);

    mockWrite.mockClear();
    rerender(<TestComponent visible={false} />);

    expect(mockWrite).toHaveBeenCalledWith(HIDE_CURSOR);
  });

  it('should hide cursor on unmount', () => {
    function TestComponent() {
      useTerminalCursorVisibility(true);
      return null;
    }
    const { unmount } = render(<TestComponent />);

    mockWrite.mockClear();
    unmount();

    expect(mockWrite).toHaveBeenCalledWith(HIDE_CURSOR);
  });
});
