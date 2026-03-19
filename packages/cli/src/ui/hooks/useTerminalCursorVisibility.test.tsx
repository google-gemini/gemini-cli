/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '../../test-utils/render.js';
import {
  useTerminalCursorVisibility,
  resetVisibleInstancesForTesting,
} from './useTerminalCursorVisibility.js';
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
    resetVisibleInstancesForTesting();
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

  it('should not write anything when visible is false', () => {
    function TestComponent() {
      useTerminalCursorVisibility(false);
      return null;
    }
    render(<TestComponent />);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('should show cursor when visibility changes from false to true', () => {
    function TestComponent({ visible }: { visible: boolean }) {
      useTerminalCursorVisibility(visible);
      return null;
    }
    const { rerender } = render(<TestComponent visible={false} />);

    mockWrite.mockClear();
    rerender(<TestComponent visible={true} />);

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

    // Cleanup from previous visible=true effect hides the cursor
    expect(mockWrite).toHaveBeenCalledWith(HIDE_CURSOR);
  });

  it('should hide cursor on unmount when visible', () => {
    function TestComponent() {
      useTerminalCursorVisibility(true);
      return null;
    }
    const { unmount } = render(<TestComponent />);

    mockWrite.mockClear();
    unmount();

    expect(mockWrite).toHaveBeenCalledWith(HIDE_CURSOR);
  });

  it('should not hide cursor when one of multiple visible components unmounts', () => {
    function TestComponentA() {
      useTerminalCursorVisibility(true);
      return null;
    }
    function TestComponentB() {
      useTerminalCursorVisibility(true);
      return null;
    }

    // Render a wrapper that includes both components
    function Wrapper({ showA }: { showA: boolean }) {
      return (
        <>
          {showA ? <TestComponentA /> : null}
          <TestComponentB />
        </>
      );
    }

    const { rerender } = render(<Wrapper showA={true} />);

    // Cursor should have been shown once (first component triggers it)
    expect(mockWrite).toHaveBeenCalledWith(SHOW_CURSOR);

    mockWrite.mockClear();
    // Unmount component A, but B still wants cursor visible
    rerender(<Wrapper showA={false} />);

    // Cursor should NOT be hidden because B still requires visibility
    expect(mockWrite).not.toHaveBeenCalledWith(HIDE_CURSOR);
  });
});
