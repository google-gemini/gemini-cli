/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { act } from 'react';
import { waitFor } from '../../../test-utils/async.js';
import { HookEventName } from '@google/gemini-cli-core';
import { HookReview, type HookReviewProps } from './HookReview.js';
import { RadioButtonSelect } from '../shared/RadioButtonSelect.js';

vi.mock('../shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(() => null),
}));

const MockedRadioButtonSelect = vi.mocked(RadioButtonSelect);

describe('HookReview', () => {
  const defaultProps: Omit<
    HookReviewProps,
    'onConfirm' | 'onEdit' | 'onCancel'
  > & {
    onConfirm: ReturnType<typeof vi.fn>;
    onEdit: ReturnType<typeof vi.fn>;
    onCancel: ReturnType<typeof vi.fn>;
  } = {
    event: HookEventName.BeforeTool,
    command: '/path/to/script.sh',
    onConfirm: vi.fn(),
    onEdit: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the step title', () => {
    const { lastFrame } = renderWithProviders(<HookReview {...defaultProps} />);

    expect(lastFrame()).toContain('Step 5: Review Configuration');
    expect(lastFrame()).toContain('Hook Configuration Summary');
  });

  it('should display all configuration values', () => {
    const { lastFrame } = renderWithProviders(
      <HookReview
        {...defaultProps}
        matcher="read_file"
        name="my-hook"
        description="A test hook"
        timeout={30000}
      />,
    );

    expect(lastFrame()).toContain('BeforeTool');
    expect(lastFrame()).toContain('read_file');
    expect(lastFrame()).toContain('/path/to/script.sh');
    expect(lastFrame()).toContain('my-hook');
    expect(lastFrame()).toContain('A test hook');
    expect(lastFrame()).toContain('30000ms');
    expect(lastFrame()).toContain('.gemini/settings.json');
  });

  it('should display default values when optional fields are not set', () => {
    const { lastFrame } = renderWithProviders(<HookReview {...defaultProps} />);

    expect(lastFrame()).toContain('*'); // Matcher default
    expect(lastFrame()).toContain('(not set)'); // Name and description
    expect(lastFrame()).toContain('60000ms'); // Default timeout
  });

  it('should render RadioButtonSelect with action options', () => {
    renderWithProviders(<HookReview {...defaultProps} />);

    expect(MockedRadioButtonSelect).toHaveBeenCalled();
    const props = MockedRadioButtonSelect.mock.calls[0][0];
    expect(props.items).toHaveLength(5);
  });

  it('should call onConfirm when save is selected', () => {
    renderWithProviders(<HookReview {...defaultProps} />);

    const props = MockedRadioButtonSelect.mock.calls[0][0];
    act(() => {
      props.onSelect('save');
    });

    expect(defaultProps.onConfirm).toHaveBeenCalled();
  });

  it('should call onEdit with correct step when edit options are selected', () => {
    renderWithProviders(<HookReview {...defaultProps} />);

    const props = MockedRadioButtonSelect.mock.calls[0][0];

    act(() => {
      props.onSelect('edit-event');
    });
    expect(defaultProps.onEdit).toHaveBeenCalledWith('event');

    act(() => {
      props.onSelect('edit-matcher');
    });
    expect(defaultProps.onEdit).toHaveBeenCalledWith('matcher');

    act(() => {
      props.onSelect('edit-details');
    });
    expect(defaultProps.onEdit).toHaveBeenCalledWith('details');
  });

  it('should call onCancel when cancel is selected', () => {
    renderWithProviders(<HookReview {...defaultProps} />);

    const props = MockedRadioButtonSelect.mock.calls[0][0];
    act(() => {
      props.onSelect('cancel');
    });

    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('should call onCancel when escape is pressed', async () => {
    const { stdin } = renderWithProviders(<HookReview {...defaultProps} />);

    await act(async () => {
      stdin.write('\u001B');
    });

    await waitFor(() => {
      expect(defaultProps.onCancel).toHaveBeenCalled();
    });
  });
});
