/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { render } from 'ink-testing-library';
import { useModelCommand } from './useModelCommand.js';

describe('useModelCommand', () => {
  let result: ReturnType<typeof useModelCommand>;

  function TestComponent() {
    result = useModelCommand();
    return null;
  }

  it('should initialize with the model dialog closed', () => {
    render(<TestComponent />);
    expect(result.isModelDialogOpen).toBe(false);
  });

  it('should open the model dialog when openModelDialog is called', () => {
    render(<TestComponent />);

    act(() => {
      result.openModelDialog();
    });

    expect(result.isModelDialogOpen).toBe(true);
  });

  it('should close the model dialog when closeModelDialog is called', () => {
    render(<TestComponent />);

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
  });
});
