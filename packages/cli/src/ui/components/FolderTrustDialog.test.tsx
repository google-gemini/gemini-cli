/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { FolderTrustDialog, FolderTrustChoice } from './FolderTrustDialog.js';

import { waitFor } from '@testing-library/react';


// Mock process.exit and process.cwd
const mockedExit = vi.fn();
const mockedCwd = vi.fn();
beforeEach(() => {
  vi.stubGlobal('process', {
    ...process,
    exit: mockedExit,
    cwd: mockedCwd,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockedExit.mockClear();
  mockedCwd.mockClear();
});

describe('FolderTrustDialog', () => {
  it('should render trust options', () => {
    const { lastFrame } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} />,
    );

    expect(lastFrame()).toContain('Do you trust this folder?');
    expect(lastFrame()).toContain('Trust folder');
    expect(lastFrame()).toContain('Trust parent folder');
    expect(lastFrame()).toContain("Don't trust");
  });

  it('should display restart message when isRestarting is true', () => {
    const { lastFrame } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} isRestarting={true} />,
    );


    expect(lastFrame()).toContain(
      'Gemini CLI is restarting to apply changes...',
    );
  });

  it('should not respond to "r" key press since manual restart is no longer supported', async () => {
    const { stdin } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} isRestarting={true} />,
    );

    stdin.write('r');

    await waitFor(() => {
      expect(mockedExit).not.toHaveBeenCalled();
    });

  });

  it('should call onSelect when escape is pressed', async () => {
    const onSelect = vi.fn();
    const { stdin } = renderWithProviders(
      <FolderTrustDialog onSelect={onSelect} />,
    );

    stdin.write('\u001b'); // Escape key

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(FolderTrustChoice.DO_NOT_TRUST);
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
      // Note: path.dirname('/') is '/', and path.basename('/') is ''.
      // So for '/project', parent is '/' and basename is '', which is correct.
      expect(lastFrame()).toContain('Trust parent folder ()');
    });
  });
});