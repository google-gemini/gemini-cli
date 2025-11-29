/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { CustomGoalInput } from './CustomGoalInput.js';
import { TextInput } from './shared/TextInput.js';

// Mock TextInput to test submission behavior
vi.mock('./shared/TextInput.js', () => ({
  TextInput: vi.fn(() => null),
}));

const MockedTextInput = vi.mocked(TextInput);

describe('CustomGoalInput', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render with correct prompt text', () => {
    const { lastFrame } = renderWithProviders(
      <CustomGoalInput
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        terminalWidth={80}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Enter your current goal');
  });

  it('should render TextInput component', () => {
    renderWithProviders(
      <CustomGoalInput
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        terminalWidth={80}
      />,
    );

    expect(MockedTextInput).toHaveBeenCalled();
  });

  it('should pass onSubmit to TextInput', () => {
    renderWithProviders(
      <CustomGoalInput
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        terminalWidth={80}
      />,
    );

    // Get the onSubmit callback passed to TextInput
    const textInputProps = MockedTextInput.mock.calls[0][0];

    // Simulate user submitting a custom goal
    textInputProps.onSubmit?.('My custom goal');

    expect(mockOnSubmit).toHaveBeenCalledWith('My custom goal');
  });

  it('should pass onCancel to TextInput', () => {
    renderWithProviders(
      <CustomGoalInput
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        terminalWidth={80}
      />,
    );

    // Get the onCancel callback passed to TextInput
    const textInputProps = MockedTextInput.mock.calls[0][0];

    // Simulate user pressing Escape
    textInputProps.onCancel?.();

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should show placeholder text in TextInput', () => {
    renderWithProviders(
      <CustomGoalInput
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        terminalWidth={80}
      />,
    );

    const textInputProps = MockedTextInput.mock.calls[0][0];
    expect(textInputProps.placeholder).toBeDefined();
    expect(textInputProps.placeholder!.length).toBeGreaterThan(0);
  });

  it('should show instructions for Enter and Esc', () => {
    const { lastFrame } = renderWithProviders(
      <CustomGoalInput
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        terminalWidth={80}
      />,
    );

    const output = lastFrame();
    expect(output).toContain('Enter');
    expect(output).toContain('Esc');
  });
});
