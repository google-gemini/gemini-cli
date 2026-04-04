/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { CopyModeWarning } from './CopyModeWarning.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useUIState, type UIState } from '../contexts/UIStateContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import type { Config } from '@google/gemini-cli-core';

vi.mock('../contexts/UIStateContext.js');
vi.mock('../contexts/ConfigContext.js');

describe('CopyModeWarning', () => {
  const mockUseUIState = vi.mocked(useUIState);
  const mockUseConfig = vi.mocked(useConfig);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConfig.mockReturnValue({
      getUseAlternateBuffer: () => false,
    } as unknown as Config);
  });

  it('renders nothing when copy mode is disabled and not in alternate buffer', async () => {
    mockUseUIState.mockReturnValue({
      copyModeEnabled: false,
      mouseMode: true,
    } as unknown as UIState);
    const { lastFrame, unmount } = await render(<CopyModeWarning />);
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders nothing when copy mode is disabled and mouse mode is disabled but not in alternate buffer', async () => {
    mockUseUIState.mockReturnValue({
      copyModeEnabled: false,
      mouseMode: false,
    } as unknown as UIState);
    mockUseConfig.mockReturnValue({
      getUseAlternateBuffer: () => false,
    } as unknown as Config);
    const { lastFrame, unmount } = await render(<CopyModeWarning />);
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders warning when copy mode is enabled', async () => {
    mockUseUIState.mockReturnValue({
      copyModeEnabled: true,
      mouseMode: true,
    } as unknown as UIState);
    const { lastFrame, unmount } = await render(<CopyModeWarning />);
    expect(lastFrame()).toContain('In Copy Mode');
    expect(lastFrame()).toContain('Use Page Up/Down to scroll');
    expect(lastFrame()).toContain('Press Ctrl+S or any other key to exit');
    unmount();
  });

  it('renders warning when in alternate buffer and mouse mode is disabled', async () => {
    mockUseUIState.mockReturnValue({
      copyModeEnabled: false,
      mouseMode: false,
    } as unknown as UIState);
    mockUseConfig.mockReturnValue({
      getUseAlternateBuffer: () => true,
    } as unknown as Config);
    const { lastFrame, unmount } = await render(<CopyModeWarning />);
    expect(lastFrame()).toContain('In Copy Mode');
    expect(lastFrame()).toContain('Use Page Up/Down to scroll');
    expect(lastFrame()).toContain('Press Ctrl+S or any other key to exit');
    unmount();
  });
});
