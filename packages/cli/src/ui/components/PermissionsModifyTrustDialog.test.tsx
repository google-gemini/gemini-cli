/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { PermissionsModifyTrustDialog } from './PermissionsModifyTrustDialog.js';
import { TrustLevel } from '../../config/trustedFolders.js';
import { waitFor } from '@testing-library/react';

// Hoist mocks for dependencies of the usePermissionsModifyTrust hook
const mockedCwd = vi.hoisted(() => vi.fn());
const mockedLoadTrustedFolders = vi.hoisted(() => vi.fn());
const mockedIsWorkspaceTrusted = vi.hoisted(() => vi.fn());
const mockedUseSettings = vi.hoisted(() => vi.fn());

// Mock the modules themselves
vi.mock('node:process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:process')>();
  return {
    ...actual,
    cwd: mockedCwd,
  };
});

vi.mock('../../config/trustedFolders.js', () => ({
  loadTrustedFolders: mockedLoadTrustedFolders,
  isWorkspaceTrusted: mockedIsWorkspaceTrusted,
  TrustLevel: {
    TRUST_FOLDER: 'TRUST_FOLDER',
    TRUST_PARENT: 'TRUST_PARENT',
    DO_NOT_TRUST: 'DO_NOT_TRUST',
  },
}));

vi.mock('../contexts/SettingsContext.js', () => ({
  useSettings: mockedUseSettings,
}));

describe('PermissionsModifyTrustDialog', () => {
  beforeEach(() => {
    mockedCwd.mockReturnValue('/test/dir');
    mockedUseSettings.mockReturnValue({
      merged: {
        security: {
          folderTrust: {
            enabled: true,
          },
        },
      },
    });
    mockedLoadTrustedFolders.mockReturnValue({
      user: { config: {} },
      setValue: vi.fn(),
    });
    mockedIsWorkspaceTrusted.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should render the main dialog with current trust level', async () => {
    mockedLoadTrustedFolders.mockReturnValue({
      user: { config: { '/test/dir': TrustLevel.TRUST_FOLDER } },
    });
    const { lastFrame } = renderWithProviders(
      <PermissionsModifyTrustDialog onExit={vi.fn()} />,
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Modify Trust Level');
      expect(lastFrame()).toContain('Folder: /test/dir');
      expect(lastFrame()).toContain('Current Level: TRUST_FOLDER');
    });
  });

  it('should display the inherited trust note', async () => {
    mockedIsWorkspaceTrusted.mockReturnValue(true);
    const { lastFrame } = renderWithProviders(
      <PermissionsModifyTrustDialog onExit={vi.fn()} />,
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Note: This folder appears trusted');
    });
  });

  it('should call onExit when escape is pressed', async () => {
    const onExit = vi.fn();
    const { stdin } = renderWithProviders(
      <PermissionsModifyTrustDialog onExit={onExit} />,
    );

    await waitFor(() => {
      stdin.write('\x1b'); // escape key
    });

    await waitFor(() => {
      expect(onExit).toHaveBeenCalled();
    });
  });

  it.skip('should call setValue when a choice is made', async () => {
    const mockSetValue = vi.fn();
    mockedLoadTrustedFolders.mockReturnValue({
      user: { config: {} },
      setValue: mockSetValue,
    });

    const { stdin, lastFrame } = renderWithProviders(
      <PermissionsModifyTrustDialog onExit={vi.fn()} />,
    );

    await waitFor(() => {
      expect(lastFrame()).not.toContain('Loading...');
    });

    await waitFor(() => {
      stdin.write('\r'); // Press Enter to select the first option (TRUST_FOLDER)
    });

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith(
        '/test/dir',
        TrustLevel.TRUST_FOLDER,
      );
    });
  });
});
