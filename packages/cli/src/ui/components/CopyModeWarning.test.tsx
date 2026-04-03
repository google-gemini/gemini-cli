/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CopyModeWarning } from './CopyModeWarning.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { useInputState } from '../contexts/InputContext.js';
import { useUIState, type UIState } from '../contexts/UIStateContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import type { Config } from '@google/gemini-cli-core';

vi.mock('../contexts/InputContext.js');
vi.mock('../contexts/UIStateContext.js');
vi.mock('../contexts/ConfigContext.js');

describe('CopyModeWarning', () => {
  const mockUseUIState = vi.mocked(useUIState);
  const mockUseConfig = vi.mocked(useConfig);
  const mockUseInputState = vi.mocked(useInputState);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConfig.mockReturnValue({
      getUseAlternateBuffer: () => false,
    } as unknown as Config);
    mockUseInputState.mockReturnValue({
      copyModeEnabled: false,
    } as unknown as ReturnType<typeof useInputState>);
    mockUseUIState.mockReturnValue({
      mouseMode: true,
    } as unknown as UIState);
  });

  it('renders nothing when copy mode is disabled and not in alternate buffer', async () => {
    mockUseInputState.mockReturnValue({
      copyModeEnabled: false,
    } as unknown as ReturnType<typeof useInputState>);
    mockUseUIState.mockReturnValue({
      mouseMode: true,
    } as unknown as UIState);
    const { lastFrame, unmount } = await renderWithProviders(
      <CopyModeWarning />,
    );
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders nothing when copy mode is disabled and mouse mode is disabled but not in alternate buffer', async () => {
    mockUseInputState.mockReturnValue({
      copyModeEnabled: false,
    } as unknown as ReturnType<typeof useInputState>);
    mockUseUIState.mockReturnValue({
      mouseMode: false,
    } as unknown as UIState);
    mockUseConfig.mockReturnValue({
      getUseAlternateBuffer: () => false,
    } as unknown as Config);
    const { lastFrame, unmount } = await renderWithProviders(
      <CopyModeWarning />,
    );
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('renders warning when copy mode is enabled', async () => {
    mockUseInputState.mockReturnValue({
      copyModeEnabled: true,
    } as unknown as ReturnType<typeof useInputState>);
    mockUseUIState.mockReturnValue({
      mouseMode: true,
    } as unknown as UIState);
    const { lastFrame, unmount } = await renderWithProviders(
      <CopyModeWarning />,
    );
    expect(lastFrame()).toContain('In Copy Mode');
    expect(lastFrame()).toContain('Use Page Up/Down to scroll');
    expect(lastFrame()).toContain('Press Ctrl+S or any other key to exit');
    unmount();
  });

  it('renders warning when in alternate buffer and mouse mode is disabled', async () => {
    mockUseInputState.mockReturnValue({
      copyModeEnabled: false,
    } as unknown as ReturnType<typeof useInputState>);
    mockUseUIState.mockReturnValue({
      mouseMode: false,
    } as unknown as UIState);
    mockUseConfig.mockReturnValue({
      getUseAlternateBuffer: () => true,
    } as unknown as Config);
    const { lastFrame, unmount } = await renderWithProviders(
      <CopyModeWarning />,
    );
    expect(lastFrame()).toContain('In Copy Mode');
    expect(lastFrame()).toContain('Use Page Up/Down to scroll');
    expect(lastFrame()).toContain('Press Ctrl+S or any other key to exit');
    unmount();
  });
});
