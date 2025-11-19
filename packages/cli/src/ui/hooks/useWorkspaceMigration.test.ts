/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWorkspaceMigration } from './useWorkspaceMigration.js';
import * as extensionModule from '../../config/extension.js';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import type { Extension } from '../../config/extension.js';

vi.mock('../../config/extension.js', () => ({
  getWorkspaceExtensions: vi.fn(),
}));

describe('useWorkspaceMigration', () => {
  let mockSettings: LoadedSettings;
  const originalCwd = process.cwd;
  const mockCwd = '/mock/workspace';

  beforeEach(() => {
    process.cwd = vi.fn(() => mockCwd) as never;

    mockSettings = {
      merged: {
        experimental: {
          extensionManagement: true,
        },
        extensions: {
          workspacesWithMigrationNudge: [],
        },
      },
      forScope: vi.fn((_scope: SettingScope) => ({
        settings: {
          extensions: {
            disabled: [],
            workspacesWithMigrationNudge: [],
          },
        },
      })),
      setValue: vi.fn(),
    } as unknown as LoadedSettings;

    vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue([]);
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.cwd = originalCwd;
  });

  describe('initialization', () => {
    it('should return correct interface', () => {
      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      expect(result.current).toHaveProperty('showWorkspaceMigrationDialog');
      expect(result.current).toHaveProperty('workspaceExtensions');
      expect(result.current).toHaveProperty('onWorkspaceMigrationDialogOpen');
      expect(result.current).toHaveProperty('onWorkspaceMigrationDialogClose');
    });

    it('should have dialog closed by default', () => {
      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      expect(result.current.showWorkspaceMigrationDialog).toBe(false);
    });

    it('should have empty extensions by default', () => {
      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      expect(result.current.workspaceExtensions).toEqual([]);
    });
  });

  describe('extension management feature flag', () => {
    it('should check workspace extensions when enabled', () => {
      mockSettings.merged.experimental = { extensionManagement: true };

      renderHook(() => useWorkspaceMigration(mockSettings));

      expect(extensionModule.getWorkspaceExtensions).toHaveBeenCalledWith(
        mockCwd,
      );
    });

    it('should not check when feature disabled', () => {
      mockSettings.merged.experimental = { extensionManagement: false };

      renderHook(() => useWorkspaceMigration(mockSettings));

      expect(extensionModule.getWorkspaceExtensions).not.toHaveBeenCalled();
    });

    it('should default to enabled when undefined', () => {
      mockSettings.merged.experimental = {};

      renderHook(() => useWorkspaceMigration(mockSettings));

      expect(extensionModule.getWorkspaceExtensions).toHaveBeenCalled();
    });

    it('should handle missing experimental settings', () => {
      mockSettings.merged.experimental = undefined as never;

      renderHook(() => useWorkspaceMigration(mockSettings));

      expect(extensionModule.getWorkspaceExtensions).toHaveBeenCalled();
    });
  });

  describe('workspace migration detection', () => {
    it('should show dialog when extensions found', () => {
      const mockExtensions: Extension[] = [
        { name: 'ext1', path: '/path1' } as Extension,
      ];
      vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue(
        mockExtensions,
      );

      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      expect(result.current.showWorkspaceMigrationDialog).toBe(true);
      expect(result.current.workspaceExtensions).toEqual(mockExtensions);
    });

    it('should not show dialog when no extensions found', () => {
      vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue([]);

      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      expect(result.current.showWorkspaceMigrationDialog).toBe(false);
    });

    it('should not show dialog if workspace already nudged', () => {
      const mockExtensions: Extension[] = [
        { name: 'ext1', path: '/path1' } as Extension,
      ];
      vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue(
        mockExtensions,
      );

      mockSettings.merged.extensions = {
        workspacesWithMigrationNudge: [mockCwd],
      } as never;

      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      expect(result.current.showWorkspaceMigrationDialog).toBe(false);
    });

    it('should handle multiple extensions', () => {
      const mockExtensions: Extension[] = [
        { name: 'ext1', path: '/path1' } as Extension,
        { name: 'ext2', path: '/path2' } as Extension,
        { name: 'ext3', path: '/path3' } as Extension,
      ];
      vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue(
        mockExtensions,
      );

      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      expect(result.current.workspaceExtensions).toEqual(mockExtensions);
      expect(result.current.showWorkspaceMigrationDialog).toBe(true);
    });
  });

  describe('onWorkspaceMigrationDialogOpen', () => {
    it('should add current workspace to nudge list', () => {
      const mockExtensions: Extension[] = [
        { name: 'ext1', path: '/path1' } as Extension,
      ];
      vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue(
        mockExtensions,
      );

      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      result.current.onWorkspaceMigrationDialogOpen();

      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'extensions',
        expect.objectContaining({
          workspacesWithMigrationNudge: [mockCwd],
        }),
      );
    });

    it('should not duplicate workspace in nudge list', () => {
      const mockForScope = vi.fn(() => ({
        settings: {
          extensions: {
            disabled: [],
            workspacesWithMigrationNudge: [mockCwd],
          },
        },
      }));

      mockSettings.forScope = mockForScope as never;

      const mockExtensions: Extension[] = [
        { name: 'ext1', path: '/path1' } as Extension,
      ];
      vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue(
        mockExtensions,
      );

      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      result.current.onWorkspaceMigrationDialogOpen();

      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'extensions',
        expect.objectContaining({
          workspacesWithMigrationNudge: [mockCwd],
        }),
      );
    });

    it('should preserve existing nudged workspaces', () => {
      const existingWorkspace = '/other/workspace';
      const mockForScope = vi.fn(() => ({
        settings: {
          extensions: {
            disabled: [],
            workspacesWithMigrationNudge: [existingWorkspace],
          },
        },
      }));

      mockSettings.forScope = mockForScope as never;

      const mockExtensions: Extension[] = [
        { name: 'ext1', path: '/path1' } as Extension,
      ];
      vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue(
        mockExtensions,
      );

      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      result.current.onWorkspaceMigrationDialogOpen();

      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'extensions',
        expect.objectContaining({
          workspacesWithMigrationNudge: [existingWorkspace, mockCwd],
        }),
      );
    });

    it('should create extensions settings if missing', () => {
      const mockForScope = vi.fn(() => ({
        settings: {},
      }));

      mockSettings.forScope = mockForScope as never;

      const mockExtensions: Extension[] = [
        { name: 'ext1', path: '/path1' } as Extension,
      ];
      vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue(
        mockExtensions,
      );

      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      result.current.onWorkspaceMigrationDialogOpen();

      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'extensions',
        expect.objectContaining({
          disabled: [],
          workspacesWithMigrationNudge: [mockCwd],
        }),
      );
    });

    it('should preserve disabled extensions', () => {
      const mockForScope = vi.fn(() => ({
        settings: {
          extensions: {
            disabled: ['ext1', 'ext2'],
            workspacesWithMigrationNudge: [],
          },
        },
      }));

      mockSettings.forScope = mockForScope as never;

      const mockExtensions: Extension[] = [
        { name: 'ext1', path: '/path1' } as Extension,
      ];
      vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue(
        mockExtensions,
      );

      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      result.current.onWorkspaceMigrationDialogOpen();

      expect(mockSettings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'extensions',
        expect.objectContaining({
          disabled: ['ext1', 'ext2'],
        }),
      );
    });
  });

  describe('onWorkspaceMigrationDialogClose', () => {
    it('should close the dialog', () => {
      const mockExtensions: Extension[] = [
        { name: 'ext1', path: '/path1' } as Extension,
      ];
      vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue(
        mockExtensions,
      );

      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      expect(result.current.showWorkspaceMigrationDialog).toBe(true);

      result.current.onWorkspaceMigrationDialogClose();

      expect(result.current.showWorkspaceMigrationDialog).toBe(false);
    });

    it('should keep extensions data', () => {
      const mockExtensions: Extension[] = [
        { name: 'ext1', path: '/path1' } as Extension,
      ];
      vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue(
        mockExtensions,
      );

      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      result.current.onWorkspaceMigrationDialogClose();

      expect(result.current.workspaceExtensions).toEqual(mockExtensions);
    });
  });

  describe('settings reactivity', () => {
    it('should update when extensions settings change', () => {
      const { result, rerender } = renderHook(() =>
        useWorkspaceMigration(mockSettings),
      );

      expect(result.current.showWorkspaceMigrationDialog).toBe(false);

      // Update settings
      const mockExtensions: Extension[] = [
        { name: 'ext1', path: '/path1' } as Extension,
      ];
      vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue(
        mockExtensions,
      );

      mockSettings.merged.extensions = {
        workspacesWithMigrationNudge: [],
      } as never;

      rerender();

      expect(extensionModule.getWorkspaceExtensions).toHaveBeenCalled();
    });

    it('should update when experimental settings change', () => {
      mockSettings.merged.experimental = { extensionManagement: false };

      const { rerender } = renderHook(() =>
        useWorkspaceMigration(mockSettings),
      );

      vi.clearAllMocks();

      mockSettings.merged.experimental = { extensionManagement: true };

      rerender();

      expect(extensionModule.getWorkspaceExtensions).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle missing extensions settings', () => {
      mockSettings.merged.extensions = undefined as never;

      const mockExtensions: Extension[] = [
        { name: 'ext1', path: '/path1' } as Extension,
      ];
      vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue(
        mockExtensions,
      );

      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      expect(result.current.showWorkspaceMigrationDialog).toBe(true);
    });

    it('should handle null workspacesWithMigrationNudge', () => {
      mockSettings.merged.extensions = {
        workspacesWithMigrationNudge: null as never,
      } as never;

      const mockExtensions: Extension[] = [
        { name: 'ext1', path: '/path1' } as Extension,
      ];
      vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue(
        mockExtensions,
      );

      const { result } = renderHook(() => useWorkspaceMigration(mockSettings));

      expect(result.current.showWorkspaceMigrationDialog).toBe(true);
    });

    it('should handle different workspace paths', () => {
      process.cwd = vi.fn(() => '/different/workspace') as never;

      const mockExtensions: Extension[] = [
        { name: 'ext1', path: '/path1' } as Extension,
      ];
      vi.mocked(extensionModule.getWorkspaceExtensions).mockReturnValue(
        mockExtensions,
      );

      renderHook(() => useWorkspaceMigration(mockSettings));

      expect(extensionModule.getWorkspaceExtensions).toHaveBeenCalledWith(
        '/different/workspace',
      );
    });
  });
});
