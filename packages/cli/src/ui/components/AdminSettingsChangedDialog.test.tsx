/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import { AdminSettingsChangedDialog } from './AdminSettingsChangedDialog.js';

const handleRestartMock = vi.fn();

describe('AdminSettingsChangedDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders correctly', () => {
    const { lastFrame } = renderWithProviders(<AdminSettingsChangedDialog />);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('restarts on "r" key press', async () => {
    const { stdin } = renderWithProviders(<AdminSettingsChangedDialog />, {
      uiActions: {
        handleRestart: handleRestartMock,
      },
    });

    act(() => {
      stdin.write('r');
    });

    expect(handleRestartMock).toHaveBeenCalled();
  });

  it.each(['r', 'R'])('restarts on "%s" key press', async (key) => {
    const { stdin } = renderWithProviders(<AdminSettingsChangedDialog />, {
      uiActions: {
        handleRestart: handleRestartMock,
      },
    });

    act(() => {
      stdin.write(key);
    });

    expect(handleRestartMock).toHaveBeenCalled();
  });
});
