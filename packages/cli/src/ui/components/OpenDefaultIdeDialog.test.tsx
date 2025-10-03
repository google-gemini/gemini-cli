/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../../test-utils/render.js';
import { OpenDefaultIdeDialog } from './OpenDefaultIdeDialog.js';

describe('OpenDefaultIdeDialog', () => {
  it('should render dialog with title and options', () => {
    const onChoice = vi.fn();
    const { lastFrame } = renderWithProviders(
      <OpenDefaultIdeDialog onChoice={onChoice} />,
    );

    expect(lastFrame()).toContain('Do you want to open your default IDE?');
    expect(lastFrame()).toContain('Yes');
    expect(lastFrame()).toContain('No (esc)');
  });

  it('should call onChoice with "yes" when Yes is selected', async () => {
    const onChoice = vi.fn();
    const { stdin } = renderWithProviders(
      <OpenDefaultIdeDialog onChoice={onChoice} />,
    );

    // Simulate pressing Enter (should select the first option by default)
    act(() => {
      stdin.write('\r');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(onChoice).toHaveBeenCalledWith('yes');
  });

  it('should call onChoice with "no" when escape is pressed', async () => {
    const onChoice = vi.fn();
    const { stdin } = renderWithProviders(
      <OpenDefaultIdeDialog onChoice={onChoice} />,
    );

    // Simulate pressing Escape
    act(() => {
      stdin.write('\x1b');
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(onChoice).toHaveBeenCalledWith('no');
  });
});
