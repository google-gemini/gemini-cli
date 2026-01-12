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
import { EventSelector } from './EventSelector.js';
import { DescriptiveRadioButtonSelect } from '../shared/DescriptiveRadioButtonSelect.js';

vi.mock('../shared/DescriptiveRadioButtonSelect.js', () => ({
  DescriptiveRadioButtonSelect: vi.fn(() => null),
}));

const MockedDescriptiveRadioButtonSelect = vi.mocked(
  DescriptiveRadioButtonSelect,
);

describe('EventSelector', () => {
  const onSelect = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the step title', () => {
    const { lastFrame } = renderWithProviders(
      <EventSelector onSelect={onSelect} onCancel={onCancel} />,
    );

    expect(lastFrame()).toContain('Step 1: Select Hook Event');
    expect(lastFrame()).toContain('Choose when your hook should execute');
  });

  it('should render DescriptiveRadioButtonSelect with all hook events', () => {
    renderWithProviders(
      <EventSelector onSelect={onSelect} onCancel={onCancel} />,
    );

    expect(MockedDescriptiveRadioButtonSelect).toHaveBeenCalled();
    const props = MockedDescriptiveRadioButtonSelect.mock.calls[0][0];
    expect(props.items).toHaveLength(11); // All HookEventName values
    expect(props.items[0].value).toBe(HookEventName.BeforeTool);
  });

  it('should call onSelect when an event is selected', () => {
    renderWithProviders(
      <EventSelector onSelect={onSelect} onCancel={onCancel} />,
    );

    const props = MockedDescriptiveRadioButtonSelect.mock.calls[0][0];
    act(() => {
      props.onSelect(HookEventName.AfterTool);
    });

    expect(onSelect).toHaveBeenCalledWith(HookEventName.AfterTool);
  });

  it('should call onCancel when escape is pressed', async () => {
    const { stdin } = renderWithProviders(
      <EventSelector onSelect={onSelect} onCancel={onCancel} />,
    );

    await act(async () => {
      stdin.write('\u001B'); // Escape key
    });

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalled();
    });
  });

  it('should set initial index when selectedEvent is provided', () => {
    renderWithProviders(
      <EventSelector
        selectedEvent={HookEventName.AfterTool}
        onSelect={onSelect}
        onCancel={onCancel}
      />,
    );

    const props = MockedDescriptiveRadioButtonSelect.mock.calls[0][0];
    expect(props.initialIndex).toBe(1); // AfterTool is at index 1
  });

  it('should render help text', () => {
    const { lastFrame } = renderWithProviders(
      <EventSelector onSelect={onSelect} onCancel={onCancel} />,
    );

    expect(lastFrame()).toContain('Enter to select');
    expect(lastFrame()).toContain('Esc to cancel');
  });
});
