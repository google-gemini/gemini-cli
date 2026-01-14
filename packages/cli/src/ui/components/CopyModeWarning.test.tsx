/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { CopyModeWarning } from './CopyModeWarning.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUIState, type UIState } from '../contexts/UIStateContext.js';

vi.mock('../contexts/UIStateContext.js');

describe('CopyModeWarning', () => {
  const mockUseUIState = vi.mocked(useUIState);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when copy mode is disabled', () => {
    mockUseUIState.mockReturnValue({
      copyModeEnabled: false,
    } as unknown as UIState);
    const { lastFrame } = render(<CopyModeWarning />);
    expect(lastFrame()).toBe('');
  });

  it('renders warning when copy mode is enabled', () => {
    mockUseUIState.mockReturnValue({
      copyModeEnabled: true,
    } as unknown as UIState);
    const { lastFrame } = render(<CopyModeWarning />);
    expect(lastFrame()).toContain('In Copy Mode');
    expect(lastFrame()).toContain('Press any key to exit');
  });
});
