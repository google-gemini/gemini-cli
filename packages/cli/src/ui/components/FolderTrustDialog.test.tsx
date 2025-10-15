/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { FolderTrustDialog } from './FolderTrustDialog.js';
import * as processUtils from '../../utils/processUtils.js';

vi.mock('../../utils/processUtils.js', () => ({
  relaunchApp: vi.fn(),
}));

const mockedExit = vi.hoisted(() => vi.fn());
const mockedCwd = vi.hoisted(() => vi.fn());

vi.mock('node:process', async () => {
  const actual =
    await vi.importActual<typeof import('node:process')>('node:process');
  return {
    ...actual,
    exit: mockedExit,
    cwd: mockedCwd,
  };
});

describe('FolderTrustDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCwd.mockReturnValue('/home/user/project');
  });

  it('should render the dialog with title and description', () => {
    const { lastFrame } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} />,
    );

    expect(lastFrame()).toContain('Do you trust this folder?');
    expect(lastFrame()).toContain(
      'Trusting a folder allows Gemini to execute commands it suggests.',
    );
  });

  it('should display exit message and call process.exit and not call onSelect when escape is pressed', async () => {
    const onSelect = vi.fn();
    const { lastFrame, stdin } = renderWithProviders(
      <FolderTrustDialog onSelect={onSelect} isRestarting={false} />,
    );

    stdin.write('\x1b'); // escape key

    await waitFor(() => {
      expect(lastFrame()).toContain(
        'A folder trust level must be selected to continue. Exiting since escape was pressed.',
      );
    });
    await waitFor(() => {
      expect(mockedExit).toHaveBeenCalledWith(1);
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('should display restart message when isRestarting is true', () => {
    const { lastFrame } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} isRestarting={true} />,
    );

    expect(lastFrame()).toContain(' Gemini CLI is restarting');
  });

  it('should call relaunchApp when isRestarting is true', async () => {
    vi.useFakeTimers();
    const relaunchApp = vi.spyOn(processUtils, 'relaunchApp');
    renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} isRestarting={true} />,
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(relaunchApp).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should not call process.exit when "r" is pressed and isRestarting is false', async () => {
    const { stdin } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} isRestarting={false} />,
    );

    stdin.write('r');

    await waitFor(() => {
      expect(mockedExit).not.toHaveBeenCalled();
    });
  });

  describe('directory display', () => {
    it('should correctly display the folder name for a nested directory', () => {
      mockedCwd.mockReturnValue('/home/user/project');
      const { lastFrame } = renderWithProviders(
        <FolderTrustDialog onSelect={vi.fn()} />,
      );
      expect(lastFrame()).toContain('Trust folder (project)');
    });

    it('should correctly display the parent folder name for a nested directory', () => {
      mockedCwd.mockReturnValue('/home/user/project');
      const { lastFrame } = renderWithProviders(
        <FolderTrustDialog onSelect={vi.fn()} />,
      );
      expect(lastFrame()).toContain('Trust parent folder (user)');
    });

    it('should correctly display an empty parent folder name for a directory directly under root', () => {
      mockedCwd.mockReturnValue('/project');
      const { lastFrame } = renderWithProviders(
        <FolderTrustDialog onSelect={vi.fn()} />,
      );
      expect(lastFrame()).toContain('Trust parent folder ()');
    });
  });
});
