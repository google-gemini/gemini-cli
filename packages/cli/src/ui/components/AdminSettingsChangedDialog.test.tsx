/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { AdminSettingsChangedDialog } from './AdminSettingsChangedDialog.js';
import * as cleanup from '../../utils/cleanup.js';

vi.mock('../../utils/cleanup.js', () => ({
  runExitCleanup: vi.fn(),
}));

vi.mock('../../utils/processUtils.js', () => ({
  RELAUNCH_EXIT_CODE: 199,
}));

describe('AdminSettingsChangedDialog', () => {
  it('renders correctly', () => {
    const { lastFrame } = renderWithProviders(<AdminSettingsChangedDialog />);
    expect(lastFrame()).toContain('Admin settings have changed');
  });

  it('restarts on "r" key press', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as unknown as (
        code?: number | string | null,
      ) => never);
    const { stdin } = renderWithProviders(<AdminSettingsChangedDialog />);

    act(() => {
      stdin.write('r');
    });

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(cleanup.runExitCleanup).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(199);

    exitSpy.mockRestore();
  });
});
