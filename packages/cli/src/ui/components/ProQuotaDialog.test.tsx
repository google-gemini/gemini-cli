/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ProQuotaDialog } from './ProQuotaDialog.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

// Mock the child component to make it easier to test the parent
vi.mock('./shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(),
}));

describe('ProQuotaDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render with correct title and options', () => {
    const { lastFrame, unmount } = render(
      <ProQuotaDialog fallbackModel="gemini-2.5-flash" onChoice={() => {}} />,
    );

    const output = lastFrame();
    expect(output).toContain(
      'Note: You can always use /model to select a different option.',
    );

    // Check that RadioButtonSelect was called with the correct items
    expect(RadioButtonSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          {
            label: 'Try again later',
            value: 'retry_later' as const,
            key: 'retry_later',
          },
          {
            label: `Switch to gemini-2.5-flash for the rest of this session`,
            value: 'retry' as const,
            key: 'retry',
          },
        ],
      }),
      undefined,
    );
    unmount();
  });

  it('should call onChoice with "auth" when "Change auth" is selected', () => {
    const mockOnChoice = vi.fn();
    const { unmount } = render(
      <ProQuotaDialog
        fallbackModel="gemini-2.5-flash"
        onChoice={mockOnChoice}
      />,
    );

    // Get the onSelect function passed to RadioButtonSelect
    const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;

    // Simulate the selection
    act(() => {
      onSelect('auth');
    });

    expect(mockOnChoice).toHaveBeenCalledWith('auth');
    unmount();
  });

  it('should call onChoice with "continue" when "Continue with flash" is selected', () => {
    const mockOnChoice = vi.fn();
    const { unmount } = render(
      <ProQuotaDialog
        fallbackModel="gemini-2.5-flash"
        onChoice={mockOnChoice}
      />,
    );

    // Get the onSelect function passed to RadioButtonSelect
    const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;

    // Simulate the selection
    act(() => {
      onSelect('retry');
    });

    expect(mockOnChoice).toHaveBeenCalledWith('retry');
    unmount();
  });
});
