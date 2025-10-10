/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vitest/globals" />

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { renderWithProviders } from '../../test-utils/render.js';
import { PermissionsModifyTrustDialog } from './PermissionsModifyTrustDialog.js';
import { TrustLevel } from '../../config/trustedFolders.js';
import { waitFor, act } from '@testing-library/react';
import * as processUtils from '../../utils/processUtils.js';
import { usePermissionsModifyTrust } from '../hooks/usePermissionsModifyTrust.js';

// Hoist mocks for dependencies of the usePermissionsModifyTrust hook
const mockedCwd = vi.hoisted(() => vi.fn());
const mockedLoadTrustedFolders = vi.hoisted(() => vi.fn());
const mockedIsWorkspaceTrusted = vi.hoisted(() => vi.fn());

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

vi.mock('../hooks/usePermissionsModifyTrust.js');

describe('PermissionsModifyTrustDialog', () => {
  let mockUpdateTrustLevel: Mock;
  let mockCommitTrustLevelChange: Mock;

  beforeEach(() => {
    mockUpdateTrustLevel = vi.fn();
    mockCommitTrustLevelChange = vi.fn();
    vi.mocked(usePermissionsModifyTrust).mockReturnValue({
      cwd: '/test/dir',
      currentTrustLevel: TrustLevel.DO_NOT_TRUST,
      isInheritedTrustFromParent: false,
      isInheritedTrustFromIde: false,
      needsRestart: false,
      updateTrustLevel: mockUpdateTrustLevel,
      commitTrustLevelChange: mockCommitTrustLevelChange,
      isFolderTrustEnabled: true,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should render the main dialog with current trust level', async () => {
    const { lastFrame } = renderWithProviders(
      <PermissionsModifyTrustDialog onExit={vi.fn()} addItem={vi.fn()} />,
    );

    await waitFor(() => {
      expect(lastFrame()).toContain('Modify Trust Level');
      expect(lastFrame()).toContain('Folder: /test/dir');
      expect(lastFrame()).toContain('Current Level: DO_NOT_TRUST');
    });
  });

  it('should display the inherited trust note from parent', async () => {
    vi.mocked(usePermissionsModifyTrust).mockReturnValue({
      cwd: '/test/dir',
      currentTrustLevel: TrustLevel.DO_NOT_TRUST,
      isInheritedTrustFromParent: true,
      isInheritedTrustFromIde: false,
      needsRestart: false,
      updateTrustLevel: mockUpdateTrustLevel,
      commitTrustLevelChange: mockCommitTrustLevelChange,
      isFolderTrustEnabled: true,
    });
    const { lastFrame } = renderWithProviders(
      <PermissionsModifyTrustDialog onExit={vi.fn()} addItem={vi.fn()} />,
    );

    await waitFor(() => {
      expect(lastFrame()).toContain(
        'Note: This folder behaves as a trusted folder because one of the parent folders is trusted.',
      );
    });
  });

  it('should display the inherited trust note from IDE', async () => {
    vi.mocked(usePermissionsModifyTrust).mockReturnValue({
      cwd: '/test/dir',
      currentTrustLevel: TrustLevel.DO_NOT_TRUST,
      isInheritedTrustFromParent: false,
      isInheritedTrustFromIde: true,
      needsRestart: false,
      updateTrustLevel: mockUpdateTrustLevel,
      commitTrustLevelChange: mockCommitTrustLevelChange,
      isFolderTrustEnabled: true,
    });
    const { lastFrame } = renderWithProviders(
      <PermissionsModifyTrustDialog onExit={vi.fn()} addItem={vi.fn()} />,
    );

    await waitFor(() => {
      expect(lastFrame()).toContain(
        'Note: This folder behaves as a trusted folder because the connected IDE workspace is trusted.',
      );
    });
  });

  it('should call onExit when escape is pressed', async () => {
    const onExit = vi.fn();
    const { stdin, lastFrame } = renderWithProviders(
      <PermissionsModifyTrustDialog onExit={onExit} addItem={vi.fn()} />,
    );

    await waitFor(() => expect(lastFrame()).not.toContain('Loading...'));

    act(() => {
      stdin.write('\x1b'); // escape key
    });

    await waitFor(() => {
      expect(onExit).toHaveBeenCalled();
    });
  });

  it('should commit, restart, and exit on `r` keypress', async () => {
    const mockRelaunchApp = vi
      .spyOn(processUtils, 'relaunchApp')
      .mockResolvedValue(undefined);
    vi.mocked(usePermissionsModifyTrust).mockReturnValue({
      cwd: '/test/dir',
      currentTrustLevel: TrustLevel.DO_NOT_TRUST,
      isInheritedTrustFromParent: false,
      isInheritedTrustFromIde: false,
      needsRestart: true,
      updateTrustLevel: mockUpdateTrustLevel,
      commitTrustLevelChange: mockCommitTrustLevelChange,
      isFolderTrustEnabled: true,
    });

    const onExit = vi.fn();
    const { stdin, lastFrame } = renderWithProviders(
      <PermissionsModifyTrustDialog onExit={onExit} addItem={vi.fn()} />,
    );

    await waitFor(() => expect(lastFrame()).not.toContain('Loading...'));

    act(() => stdin.write('r')); // Press 'r' to restart

    await waitFor(() => {
      expect(mockCommitTrustLevelChange).toHaveBeenCalled();
      expect(mockRelaunchApp).toHaveBeenCalled();
      expect(onExit).toHaveBeenCalled();
    });

    mockRelaunchApp.mockRestore();
  });

  it('should not commit when escape is pressed during restart prompt', async () => {
    vi.mocked(usePermissionsModifyTrust).mockReturnValue({
      cwd: '/test/dir',
      currentTrustLevel: TrustLevel.DO_NOT_TRUST,
      isInheritedTrustFromParent: false,
      isInheritedTrustFromIde: false,
      needsRestart: true,
      updateTrustLevel: mockUpdateTrustLevel,
      commitTrustLevelChange: mockCommitTrustLevelChange,
      isFolderTrustEnabled: true,
    });

    const onExit = vi.fn();
    const { stdin, lastFrame } = renderWithProviders(
      <PermissionsModifyTrustDialog onExit={onExit} addItem={vi.fn()} />,
    );

    await waitFor(() => expect(lastFrame()).not.toContain('Loading...'));

    act(() => stdin.write('\x1b')); // Press escape

    await waitFor(() => {
      expect(mockCommitTrustLevelChange).not.toHaveBeenCalled();
      expect(onExit).toHaveBeenCalled();
    });
  });
});
