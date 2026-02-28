/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enableAgent, disableAgent } from './agentSettings.js';
import { SettingScope, type LoadedSettings } from '../config/settings.js';

describe('agentSettings', () => {
  let mockSettings: LoadedSettings;
  let mockUser: {
    path: string;
    settings: { agents?: { overrides?: Record<string, { enabled: boolean }> } };
  };
  let mockWorkspace: {
    path: string;
    settings: { agents?: { overrides?: Record<string, { enabled: boolean }> } };
  };
  let mockSetValue: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUser = {
      path: '/mock/user.json',
      settings: { agents: { overrides: {} } },
    };
    mockWorkspace = {
      path: '/mock/workspace.json',
      settings: { agents: { overrides: {} } },
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

  describe('enableAgent', () => {
    it('should return no-op if agent is already enabled in all scopes', () => {
      mockUser.settings.agents!.overrides!['test-agent'] = { enabled: true };
      mockWorkspace.settings.agents!.overrides!['test-agent'] = {
        enabled: true,
      };

      const result = enableAgent(mockSettings, 'test-agent');

      expect(result.status).toBe('no-op');
      expect(result.action).toBe('enable');
      expect(result.agentName).toBe('test-agent');
      expect(result.modifiedScopes).toHaveLength(0);
      expect(result.alreadyInStateScopes).toHaveLength(2);
      expect(mockSetValue).not.toHaveBeenCalled();
    });

    it('should enable agent in User scope if not enabled there', () => {
      mockWorkspace.settings.agents!.overrides!['test-agent'] = {
        enabled: true,
      };

      const result = enableAgent(mockSettings, 'test-agent');

      expect(result.status).toBe('success');
      expect(result.modifiedScopes).toContainEqual({
        scope: SettingScope.User,
        path: '/mock/user.json',
      });
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'agents.overrides.test-agent.enabled',
        true,
      );
    });

    it('should enable agent in Workspace scope if not enabled there', () => {
      mockUser.settings.agents!.overrides!['test-agent'] = { enabled: true };

      const result = enableAgent(mockSettings, 'test-agent');

      expect(result.status).toBe('success');
      expect(result.modifiedScopes).toContainEqual({
        scope: SettingScope.Workspace,
        path: '/mock/workspace.json',
      });
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'agents.overrides.test-agent.enabled',
        true,
      );
    });

    it('should enable agent in BOTH scopes if not enabled in either', () => {
      const result = enableAgent(mockSettings, 'test-agent');

      expect(result.status).toBe('success');
      expect(result.modifiedScopes).toHaveLength(2);
      expect(result.modifiedScopes).toContainEqual({
        scope: SettingScope.Workspace,
        path: '/mock/workspace.json',
      });
      expect(result.modifiedScopes).toContainEqual({
        scope: SettingScope.User,
        path: '/mock/user.json',
      });
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'agents.overrides.test-agent.enabled',
        true,
      );
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'agents.overrides.test-agent.enabled',
        true,
      );
    });

    it('should handle missing agents config gracefully', () => {
      mockUser.settings = {};
      mockWorkspace.settings = {};

      const result = enableAgent(mockSettings, 'test-agent');

      expect(result.status).toBe('success');
      expect(result.modifiedScopes).toHaveLength(2);
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'agents.overrides.test-agent.enabled',
        true,
      );
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'agents.overrides.test-agent.enabled',
        true,
      );
    });
  });

  describe('disableAgent', () => {
    it('should disable agent in the requested Workspace scope', () => {
      const result = disableAgent(
        mockSettings,
        'test-agent',
        SettingScope.Workspace,
      );

      expect(result.status).toBe('success');
      expect(result.agentName).toBe('test-agent');
      expect(result.action).toBe('disable');
      expect(result.modifiedScopes).toEqual([
        { scope: SettingScope.Workspace, path: '/mock/workspace.json' },
      ]);
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'agents.overrides.test-agent.enabled',
        false,
      );
    });

    it('should disable agent in the requested User scope', () => {
      const result = disableAgent(
        mockSettings,
        'test-agent',
        SettingScope.User,
      );

      expect(result.status).toBe('success');
      expect(result.modifiedScopes).toEqual([
        { scope: SettingScope.User, path: '/mock/user.json' },
      ]);
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'agents.overrides.test-agent.enabled',
        false,
      );
    });

    it('should return no-op if agent is already disabled in requested scope', () => {
      mockWorkspace.settings.agents!.overrides!['test-agent'] = {
        enabled: false,
      };

      const result = disableAgent(
        mockSettings,
        'test-agent',
        SettingScope.Workspace,
      );

      expect(result.status).toBe('no-op');
      expect(result.alreadyInStateScopes).toEqual([
        { scope: SettingScope.Workspace, path: '/mock/workspace.json' },
      ]);
      expect(mockSetValue).not.toHaveBeenCalled();
    });

    it('should report if agent is already disabled in other scope', () => {
      mockUser.settings.agents!.overrides!['test-agent'] = { enabled: false };

      const result = disableAgent(
        mockSettings,
        'test-agent',
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

    it('should return error if invalid scope is provided', () => {
      // @ts-expect-error - Testing runtime check
      const result = disableAgent(mockSettings, 'test-agent', 'InvalidScope');

      expect(result.status).toBe('error');
      expect(result.error).toContain('Invalid settings scope');
    });

    it('should handle missing agents config gracefully when disabling', () => {
      mockWorkspace.settings = {};

      const result = disableAgent(
        mockSettings,
        'test-agent',
        SettingScope.Workspace,
      );

      expect(result.status).toBe('success');
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'agents.overrides.test-agent.enabled',
        false,
      );
    });
  });
});