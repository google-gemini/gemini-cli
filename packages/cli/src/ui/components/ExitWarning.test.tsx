/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { ExitWarning } from './ExitWarning.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUIState, type UIState } from '../contexts/UIStateContext.js';
import { TransientMessageType } from '../../utils/events.js';

vi.mock('../contexts/UIStateContext.js');

describe('ExitWarning', () => {
  const mockUseUIState = vi.mocked(useUIState);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing by default', async () => {
    mockUseUIState.mockReturnValue({
      dialogsVisible: false,
      transientMessage: null,
    } as unknown as UIState);
    const { lastFrame, waitUntilReady, unmount } = render(<ExitWarning />);
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders warning when transient message is a warning and dialogs visible', async () => {
    mockUseUIState.mockReturnValue({
      dialogsVisible: true,
      transientMessage: {
        message: 'Test Warning',
        type: TransientMessageType.Warning,
      },
    } as unknown as UIState);
    const { lastFrame, waitUntilReady, unmount } = render(<ExitWarning />);
    await waitUntilReady();
    expect(lastFrame()).toContain('Test Warning');
    unmount();
  });

  it('renders nothing if transient message is not a warning', async () => {
    mockUseUIState.mockReturnValue({
      dialogsVisible: true,
      transientMessage: {
        message: 'Test Hint',
        type: TransientMessageType.Hint,
      },
    } as unknown as UIState);
    const { lastFrame, waitUntilReady, unmount } = render(<ExitWarning />);
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders nothing if dialogs are not visible', async () => {
    mockUseUIState.mockReturnValue({
      dialogsVisible: false,
      transientMessage: {
        message: 'Test Warning',
        type: TransientMessageType.Warning,
      },
    } as unknown as UIState);
    const { lastFrame, waitUntilReady, unmount } = render(<ExitWarning />);
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });
});
