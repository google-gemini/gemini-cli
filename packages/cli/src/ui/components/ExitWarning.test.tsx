/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { ExitWarning } from './ExitWarning.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUIState, type UIState } from '../contexts/UIStateContext.js';

vi.mock('../contexts/UIStateContext.js');

describe('ExitWarning', () => {
  const mockUseUIState = vi.mocked(useUIState);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing by default', async () => {
    mockUseUIState.mockReturnValue({
      dialogsVisible: false,
      ctrlCPressedOnce: false,
      ctrlDPressedOnce: false,
    } as unknown as UIState);
    const { lastFrame, waitUntilReady, unmount } = render(<ExitWarning />);
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders Ctrl+C warning when pressed once and dialogs visible', async () => {
    mockUseUIState.mockReturnValue({
      dialogsVisible: true,
      ctrlCPressedOnce: true,
      ctrlDPressedOnce: false,
    } as unknown as UIState);
    const { lastFrame, waitUntilReady, unmount } = render(<ExitWarning />);
    await waitUntilReady();
    expect(lastFrame()).toContain('Press Ctrl+C again to exit');
    unmount();
  });

  it('renders Ctrl+D warning when pressed once and dialogs visible', async () => {
    mockUseUIState.mockReturnValue({
      dialogsVisible: true,
      ctrlCPressedOnce: false,
      ctrlDPressedOnce: true,
    } as unknown as UIState);
    const { lastFrame, waitUntilReady, unmount } = render(<ExitWarning />);
    await waitUntilReady();
    expect(lastFrame()).toContain('Press Ctrl+D again to exit');
    unmount();
  });

  it('renders nothing if dialogs are not visible', async () => {
    mockUseUIState.mockReturnValue({
      dialogsVisible: false,
      ctrlCPressedOnce: true,
      ctrlDPressedOnce: true,
    } as unknown as UIState);
    const { lastFrame, waitUntilReady, unmount } = render(<ExitWarning />);
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });
});
