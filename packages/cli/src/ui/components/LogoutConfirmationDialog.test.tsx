/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { act } from 'react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  LogoutConfirmationDialog,
  LogoutChoice,
} from './LogoutConfirmationDialog.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

vi.mock('./shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(() => null),
}));

describe('LogoutConfirmationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the dialog with title, description, and hint', () => {
    const { lastFrame } = renderWithProviders(
      <LogoutConfirmationDialog onSelect={vi.fn()} />,
    );

    expect(lastFrame()).toContain('You are now logged out.');
    expect(lastFrame()).toContain(
      'Login again to continue using Gemini CLI, or exit the application.',
    );
    expect(lastFrame()).toContain('(Use Enter to select, Esc to close)');
  });

  it('should render RadioButtonSelect with Login and Exit options', () => {
    renderWithProviders(<LogoutConfirmationDialog onSelect={vi.fn()} />);

    expect(RadioButtonSelect).toHaveBeenCalled();
    const mockCall = vi.mocked(RadioButtonSelect).mock.calls[0][0];
    expect(mockCall.items).toEqual([
      { label: 'Login', value: LogoutChoice.LOGIN, key: 'login' },
      { label: 'Exit', value: LogoutChoice.EXIT, key: 'exit' },
    ]);
    expect(mockCall.isFocused).toBe(true);
  });

  it('should call onSelect with LOGIN when Login is selected', () => {
    const onSelect = vi.fn();
    renderWithProviders(<LogoutConfirmationDialog onSelect={onSelect} />);

    const mockCall = vi.mocked(RadioButtonSelect).mock.calls[0][0];
    mockCall.onSelect(LogoutChoice.LOGIN);

    expect(onSelect).toHaveBeenCalledWith(LogoutChoice.LOGIN);
  });

  it('should call onSelect with EXIT when Exit is selected', () => {
    const onSelect = vi.fn();
    renderWithProviders(<LogoutConfirmationDialog onSelect={onSelect} />);

    const mockCall = vi.mocked(RadioButtonSelect).mock.calls[0][0];
    mockCall.onSelect(LogoutChoice.EXIT);

    expect(onSelect).toHaveBeenCalledWith(LogoutChoice.EXIT);
  });

  it('should call onSelect with EXIT when escape key is pressed', () => {
    const onSelect = vi.fn();
    const { stdin } = renderWithProviders(
      <LogoutConfirmationDialog onSelect={onSelect} />,
    );

    act(() => {
      // Send kitty escape key sequence
      stdin.write('\u001b[27u');
    });

    expect(onSelect).toHaveBeenCalledWith(LogoutChoice.EXIT);
  });
});
