/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
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
    const { lastFrame } = render(
      <ProQuotaDialog
        failedModel="gemini-2.5-pro"
        fallbackModel="gemini-2.5-flash"
        onChoice={() => {}}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Pro quota limit reached for gemini-2.5-pro.');

    // Check that RadioButtonSelect was called with the correct items
    expect(RadioButtonSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          {
            label: 'Change auth (executes the /auth command)',
            value: 'auth',
          },
          {
            label: `Continue with gemini-2.5-flash`,
            value: 'continue',
          },
        ],
      }),
      undefined,
    );
  });

  it('should call onChoice with "auth" when "Change auth" is selected', () => {
    const mockOnChoice = vi.fn();
    render(
      <ProQuotaDialog
        failedModel="gemini-2.5-pro"
        fallbackModel="gemini-2.5-flash"
        onChoice={mockOnChoice}
      />,
    );

    // Get the onSelect function passed to RadioButtonSelect
    const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;

    // Simulate the selection
    onSelect('auth');

    expect(mockOnChoice).toHaveBeenCalledWith('auth');
  });

  it('should call onChoice with "continue" when "Continue with flash" is selected', () => {
    const mockOnChoice = vi.fn();
    render(
      <ProQuotaDialog
        failedModel="gemini-2.5-pro"
        fallbackModel="gemini-2.5-flash"
        onChoice={mockOnChoice}
      />,
    );

    // Get the onSelect function passed to RadioButtonSelect
    const onSelect = (RadioButtonSelect as Mock).mock.calls[0][0].onSelect;

    // Simulate the selection
    onSelect('continue');

    expect(mockOnChoice).toHaveBeenCalledWith('continue');
  });
});
