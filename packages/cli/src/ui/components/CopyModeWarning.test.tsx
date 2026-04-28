/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CopyModeWarning } from './CopyModeWarning.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { useInputState } from '../contexts/InputContext.js';

vi.mock('../contexts/InputContext.js');

describe('CopyModeWarning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when copy mode is disabled', async () => {
    vi.mocked(useInputState).mockReturnValue({
      copyModeEnabled: false,
    } as unknown as ReturnType<typeof useInputState>);
    const { lastFrame, unmount } = await renderWithProviders(
      <CopyModeWarning />,
    );
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders warning when copy mode is enabled', async () => {
    vi.mocked(useInputState).mockReturnValue({
      copyModeEnabled: true,
    } as unknown as ReturnType<typeof useInputState>);
    const { lastFrame, unmount } = await renderWithProviders(
      <CopyModeWarning />,
    );
    expect(lastFrame()).toContain('In Copy Mode');
    expect(lastFrame()).toContain('Use Page Up/Down to scroll');
    expect(lastFrame()).toContain('Press Ctrl+S or any other key to exit');
    unmount();
  });
});
