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

  it('should render the dialog with title, description, and hint', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <LogoutConfirmationDialog onSelect={vi.fn()} />,
    );
    await waitUntilReady();

    expect(lastFrame()).toContain('You are now logged out.');
    expect(lastFrame()).toContain(
      'Login again to continue using Gemini CLI, or exit the application.',
    );
    expect(lastFrame()).toContain('(Use Enter to select, Esc to close)');
    unmount();
  });

  it('should render RadioButtonSelect with Login and Exit options', async () => {
    const { waitUntilReady, unmount } = renderWithProviders(
      <LogoutConfirmationDialog onSelect={vi.fn()} />,
    );
    await waitUntilReady();

    expect(RadioButtonSelect).toHaveBeenCalled();
    const mockCall = vi.mocked(RadioButtonSelect).mock.calls[0][0];
    expect(mockCall.items).toEqual([
      { label: 'Login', value: LogoutChoice.LOGIN, key: 'login' },
      { label: 'Exit', value: LogoutChoice.EXIT, key: 'exit' },
    ]);
    expect(mockCall.isFocused).toBe(true);
    unmount();
  });

  it('should call onSelect with LOGIN when Login is selected', async () => {
    const onSelect = vi.fn();
    const { waitUntilReady, unmount } = renderWithProviders(
      <LogoutConfirmationDialog onSelect={onSelect} />,
    );
    await waitUntilReady();

    const mockCall = vi.mocked(RadioButtonSelect).mock.calls[0][0];
    await act(async () => {
      mockCall.onSelect(LogoutChoice.LOGIN);
    });
    await waitUntilReady();

    expect(onSelect).toHaveBeenCalledWith(LogoutChoice.LOGIN);
    unmount();
  });

  it('should call onSelect with EXIT when Exit is selected', async () => {
    const onSelect = vi.fn();
    const { waitUntilReady, unmount } = renderWithProviders(
      <LogoutConfirmationDialog onSelect={onSelect} />,
    );
    await waitUntilReady();

    const mockCall = vi.mocked(RadioButtonSelect).mock.calls[0][0];
    await act(async () => {
      mockCall.onSelect(LogoutChoice.EXIT);
    });
    await waitUntilReady();

    expect(onSelect).toHaveBeenCalledWith(LogoutChoice.EXIT);
    unmount();
  });

  it('should call onSelect with EXIT when escape key is pressed', async () => {
    const onSelect = vi.fn();
    const { stdin, waitUntilReady, unmount } = renderWithProviders(
      <LogoutConfirmationDialog onSelect={onSelect} />,
    );
    await waitUntilReady();

    await act(async () => {
      // Send kitty escape key sequence
      stdin.write('\u001b[27u');
    });
    // Escape key has a 50ms timeout in KeypressContext, so we need to wrap waitUntilReady in act
    await act(async () => {
      await waitUntilReady();
    });

    expect(onSelect).toHaveBeenCalledWith(LogoutChoice.EXIT);
    unmount();
  });
});
