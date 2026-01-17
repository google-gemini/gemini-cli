/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enableHook, disableHook } from './hookSettings.js';
import { SettingScope, type LoadedSettings } from '../config/settings.js';

describe('hookSettings', () => {
  let mockSettings: LoadedSettings;
  let mockUser: { path: string; settings: { hooks: { disabled: string[] } } };
  let mockWorkspace: {
    path: string;
    settings: { hooks: { disabled: string[] } };
  };
  let mockSetValue: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUser = {
      path: '/mock/user.json',
      settings: { hooks: { disabled: [] } },
    };
    mockWorkspace = {
      path: '/mock/workspace.json',
      settings: { hooks: { disabled: [] } },
    };
    mockSetValue = vi.fn();

    mockSettings = {
      forScope: (scope: SettingScope) => {
        if (scope === SettingScope.User) return mockUser;
        if (scope === SettingScope.Workspace) return mockWorkspace;
        return mockUser; // Default/Fallback
      },
      setValue: mockSetValue,
    } as unknown as LoadedSettings;
  });

  describe('enableHook', () => {
    it('should return no-op if hook is not disabled in any scope', () => {
      const result = enableHook(mockSettings, 'test-hook');

      expect(result.status).toBe('no-op');
      expect(result.action).toBe('enable');
      expect(result.modifiedScopes).toHaveLength(0);
      expect(result.alreadyInStateScopes).toHaveLength(2); // User + Workspace
      expect(mockSetValue).not.toHaveBeenCalled();
    });

    it('should enable hook in User scope if disabled there', () => {
      mockUser.settings.hooks.disabled = ['test-hook'];

      const result = enableHook(mockSettings, 'test-hook');

      expect(result.status).toBe('success');
      expect(result.modifiedScopes).toEqual([
        { scope: SettingScope.User, path: '/mock/user.json' },
      ]);
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'hooks.disabled',
        [],
      );
    });

    it('should enable hook in Workspace scope if disabled there', () => {
      mockWorkspace.settings.hooks.disabled = ['test-hook'];

      const result = enableHook(mockSettings, 'test-hook');

      expect(result.status).toBe('success');
      expect(result.modifiedScopes).toEqual([
        { scope: SettingScope.Workspace, path: '/mock/workspace.json' },
      ]);
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'hooks.disabled',
        [],
      );
    });

    it('should enable hook in BOTH scopes if disabled in both', () => {
      mockUser.settings.hooks.disabled = ['test-hook', 'other'];
      mockWorkspace.settings.hooks.disabled = ['test-hook'];

      const result = enableHook(mockSettings, 'test-hook');

      expect(result.status).toBe('success');
      expect(result.modifiedScopes).toHaveLength(2);
      expect(result.modifiedScopes).toContainEqual({
        scope: SettingScope.User,
        path: '/mock/user.json',
      });
      expect(result.modifiedScopes).toContainEqual({
        scope: SettingScope.Workspace,
        path: '/mock/workspace.json',
      });

      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'hooks.disabled',
        [],
      );
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'hooks.disabled',
        ['other'],
      );
    });

    it('should return error if setValue fails', () => {
      mockUser.settings.hooks.disabled = ['test-hook'];
      mockSetValue.mockImplementationOnce(() => {
        throw new Error('Save failed');
      });

      const result = enableHook(mockSettings, 'test-hook');

      expect(result.status).toBe('error');
      expect(result.error).toContain('Failed to enable hook: Save failed');
    });
  });

  describe('disableHook', () => {
    it('should disable hook in the requested scope', () => {
      const result = disableHook(
        mockSettings,
        'test-hook',
        SettingScope.Workspace,
      );

      expect(result.status).toBe('success');
      expect(result.modifiedScopes).toEqual([
        { scope: SettingScope.Workspace, path: '/mock/workspace.json' },
      ]);
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'hooks.disabled',
        ['test-hook'],
      );
    });

    it('should return no-op if already disabled in requested scope', () => {
      mockWorkspace.settings.hooks.disabled = ['test-hook'];

      const result = disableHook(
        mockSettings,
        'test-hook',
        SettingScope.Workspace,
      );

      expect(result.status).toBe('no-op');
      expect(mockSetValue).not.toHaveBeenCalled();
    });

    it('should disable in requested scope and report if already disabled in other scope', () => {
      // User has it disabled
      mockUser.settings.hooks.disabled = ['test-hook'];

      // We request disable in Workspace
      const result = disableHook(
        mockSettings,
        'test-hook',
        SettingScope.Workspace,
      );

      expect(result.status).toBe('success');
      expect(result.modifiedScopes).toEqual([
        { scope: SettingScope.Workspace, path: '/mock/workspace.json' },
      ]);
      expect(result.alreadyInStateScopes).toEqual([
        { scope: SettingScope.User, path: '/mock/user.json' },
      ]);
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'hooks.disabled',
        ['test-hook'],
      );
    });

    it('should return error if invalid scope provided', () => {
      // @ts-expect-error - Testing runtime check
      const result = disableHook(mockSettings, 'test-hook', 'InvalidScope');

      expect(result.status).toBe('error');
      expect(result.error).toContain('Invalid settings scope');
    });

    it('should return error if setValue fails', () => {
      mockSetValue.mockImplementationOnce(() => {
        throw new Error('Save failed');
      });

      const result = disableHook(
        mockSettings,
        'test-hook',
        SettingScope.Workspace,
      );

      expect(result.status).toBe('error');
      expect(result.error).toContain('Failed to disable hook: Save failed');
    });
  });
});
