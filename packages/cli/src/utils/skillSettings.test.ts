/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enableSkill, disableSkill } from './skillSettings.js';
import { SettingScope, type LoadedSettings } from '../config/settings.js';

describe('skillSettings', () => {
  let mockSettings: LoadedSettings;
  let mockUser: {
    path: string;
    settings: { skills?: { disabled?: string[] } };
  };
  let mockWorkspace: {
    path: string;
    settings: { skills?: { disabled?: string[] } };
  };
  let mockSetValue: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUser = {
      path: '/mock/user.json',
      settings: { skills: { disabled: [] } },
    };
    mockWorkspace = {
      path: '/mock/workspace.json',
      settings: { skills: { disabled: [] } },
    };
    mockSetValue = vi.fn();

    mockSettings = {
      forScope: (scope: SettingScope) => {
        if (scope === SettingScope.User) return mockUser;
        if (scope === SettingScope.Workspace) return mockWorkspace;
        return mockUser;
      },
      setValue: mockSetValue,
    } as unknown as LoadedSettings;
  });

  describe('enableSkill', () => {
    it('should return no-op if skill is not disabled in any scope', () => {
      const result = enableSkill(mockSettings, 'test-skill');

      expect(result.status).toBe('no-op');
      expect(result.action).toBe('enable');
      expect(result.skillName).toBe('test-skill');
      expect(result.modifiedScopes).toHaveLength(0);
      expect(result.alreadyInStateScopes).toHaveLength(2);
      expect(mockSetValue).not.toHaveBeenCalled();
    });

    it('should enable skill in User scope if disabled there', () => {
      mockUser.settings.skills!.disabled = ['test-skill'];

      const result = enableSkill(mockSettings, 'test-skill');

      expect(result.status).toBe('success');
      expect(result.modifiedScopes).toContainEqual({
        scope: SettingScope.User,
        path: '/mock/user.json',
      });
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'skills.disabled',
        [],
      );
    });

    it('should enable skill in Workspace scope if disabled there', () => {
      mockWorkspace.settings.skills!.disabled = ['test-skill'];

      const result = enableSkill(mockSettings, 'test-skill');

      expect(result.status).toBe('success');
      expect(result.modifiedScopes).toContainEqual({
        scope: SettingScope.Workspace,
        path: '/mock/workspace.json',
      });
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'skills.disabled',
        [],
      );
    });

    it('should enable skill in BOTH scopes if disabled in both', () => {
      mockUser.settings.skills!.disabled = ['test-skill', 'other-skill'];
      mockWorkspace.settings.skills!.disabled = ['test-skill'];

      const result = enableSkill(mockSettings, 'test-skill');

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
        SettingScope.User,
        'skills.disabled',
        ['other-skill'],
      );
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'skills.disabled',
        [],
      );
    });

    it('should handle missing skills config gracefully', () => {
      mockUser.settings = {};
      mockWorkspace.settings = {};

      const result = enableSkill(mockSettings, 'test-skill');

      expect(result.status).toBe('no-op');
      expect(result.alreadyInStateScopes).toHaveLength(2);
    });
  });

  describe('disableSkill', () => {
    it('should disable skill in the requested Workspace scope', () => {
      const result = disableSkill(
        mockSettings,
        'test-skill',
        SettingScope.Workspace,
      );

      expect(result.status).toBe('success');
      expect(result.skillName).toBe('test-skill');
      expect(result.action).toBe('disable');
      expect(result.modifiedScopes).toEqual([
        { scope: SettingScope.Workspace, path: '/mock/workspace.json' },
      ]);
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'skills.disabled',
        ['test-skill'],
      );
    });

    it('should disable skill in the requested User scope', () => {
      const result = disableSkill(
        mockSettings,
        'test-skill',
        SettingScope.User,
      );

      expect(result.status).toBe('success');
      expect(result.modifiedScopes).toEqual([
        { scope: SettingScope.User, path: '/mock/user.json' },
      ]);
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'skills.disabled',
        ['test-skill'],
      );
    });

    it('should return no-op if skill is already disabled in requested scope', () => {
      mockWorkspace.settings.skills!.disabled = ['test-skill'];

      const result = disableSkill(
        mockSettings,
        'test-skill',
        SettingScope.Workspace,
      );

      expect(result.status).toBe('no-op');
      expect(result.alreadyInStateScopes).toEqual([
        { scope: SettingScope.Workspace, path: '/mock/workspace.json' },
      ]);
      expect(mockSetValue).not.toHaveBeenCalled();
    });

    it('should report if skill is already disabled in other scope', () => {
      mockUser.settings.skills!.disabled = ['test-skill'];

      const result = disableSkill(
        mockSettings,
        'test-skill',
        SettingScope.Workspace,
      );

      expect(result.status).toBe('success');
      expect(result.modifiedScopes).toEqual([
        { scope: SettingScope.Workspace, path: '/mock/workspace.json' },
      ]);
      expect(result.alreadyInStateScopes).toEqual([
        { scope: SettingScope.User, path: '/mock/user.json' },
      ]);
    });

    it('should preserve other disabled skills when disabling a new one', () => {
      mockWorkspace.settings.skills!.disabled = ['other-skill'];

      const result = disableSkill(
        mockSettings,
        'test-skill',
        SettingScope.Workspace,
      );

      expect(result.status).toBe('success');
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'skills.disabled',
        ['other-skill', 'test-skill'],
      );
    });

    it('should return error if invalid scope is provided', () => {
      // @ts-expect-error - Testing runtime check
      const result = disableSkill(mockSettings, 'test-skill', 'InvalidScope');

      expect(result.status).toBe('error');
      expect(result.error).toContain('Invalid settings scope');
    });

    it('should handle missing skills config gracefully when disabling', () => {
      mockWorkspace.settings = {};

      const result = disableSkill(
        mockSettings,
        'test-skill',
        SettingScope.Workspace,
      );

      expect(result.status).toBe('success');
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'skills.disabled',
        ['test-skill'],
      );
    });
  });
});