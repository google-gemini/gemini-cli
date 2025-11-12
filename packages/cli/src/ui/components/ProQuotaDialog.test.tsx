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

import { PREVIEW_GEMINI_MODEL } from '@google/gemini-cli-core';

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
      <ProQuotaDialog
        failedModel="gemini-2.5-pro"
        fallbackModel="gemini-2.5-flash"
        onChoice={() => {}}
      />,
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
            value: 'retry_later',
            key: 'retry_later',
          },
          {
            label: `Switch to gemini-2.5-flash for the rest of this session`,
            value: 'retry_always',
            key: 'retry_always',
          },
        ],
      }),
      undefined,
    );
    unmount();
  });

  it('should call onChoice with "retry_always" when "Continue with flash" is selected', () => {
    const mockOnChoice = vi.fn();
    const { unmount } = render(
      <ProQuotaDialog
        failedModel="gemini-2.5-pro"
        fallbackModel="gemini-2.5-flash"
        onChoice={mockOnChoice}
      />,
    );

    // Get the onSelect function passed to RadioButtonSelect
    const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;

    // Simulate the selection
    act(() => {
      onSelect('retry_always');
    });

    expect(mockOnChoice).toHaveBeenCalledWith('retry_always');
    unmount();
  });
  it('should render correct options for Preview Model (Gemini 3.0 Pro) failure', () => {
    const { lastFrame, unmount } = render(
      <ProQuotaDialog
        failedModel={PREVIEW_GEMINI_MODEL}
        fallbackModel="gemini-2.5-pro"
        onChoice={() => {}}
      />,
    );

    const output = lastFrame();
    expect(output).toContain(
      'Note: We will periodically retry Preview Model to see if congestion has cleared.',
    );

    // Check that RadioButtonSelect was called with the correct items for Preview Model
    expect(RadioButtonSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          {
            label: 'Continue with gemini-2.5-pro (this time)',
            value: 'retry_once',
            key: 'retry_once',
          },
          {
            label: 'Continue with gemini-2.5-pro (always)',
            value: 'retry_always',
            key: 'retry_always',
          },
        ],
      }),
      undefined,
    );
    unmount();
  });
});
