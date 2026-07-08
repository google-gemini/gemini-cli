/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { render } from '../../test-utils/render.js';
import { useModelCommand } from './useModelCommand.js';

describe('useModelCommand', () => {
  let result: ReturnType<typeof useModelCommand>;

  function TestComponent() {
    result = useModelCommand();
    return null;
  }

  it('should initialize with the model dialog closed', async () => {
    const { unmount } = await render(<TestComponent />);
    expect(result.isModelDialogOpen).toBe(false);
    unmount();
  });

  it('should open the model dialog when openModelDialog is called', async () => {
    const { unmount } = await render(<TestComponent />);

    act(() => {
      result.openModelDialog();
    });

    expect(result.isModelDialogOpen).toBe(true);
    unmount();
  });

  it('should close the model dialog when closeModelDialog is called', async () => {
    const { unmount } = await render(<TestComponent />);

    // Open it first
    act(() => {
      result.openModelDialog();
    });
    expect(result.isModelDialogOpen).toBe(true);

    // Then close it
    act(() => {
      result.closeModelDialog();
    });
    expect(result.isModelDialogOpen).toBe(false);
    unmount();
  });
});
