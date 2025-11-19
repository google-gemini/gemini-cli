/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import {
  SCOPE_LABELS,
  getScopeItems,
  getScopeMessageForSetting,
} from './dialogScopeUtils.js';
import { SettingScope } from '../config/settings.js';
import type { LoadedSettings } from '../config/settings.js';

vi.mock('./settingsUtils.js', () => ({
  settingExistsInScope: vi.fn((key, settings) => settings[key] !== undefined),
}));

describe('dialogScopeUtils', () => {
  describe('SCOPE_LABELS', () => {
    it('should have label for User scope', () => {
      expect(SCOPE_LABELS[SettingScope.User]).toBe('User Settings');
    });

    it('should have label for Workspace scope', () => {
      expect(SCOPE_LABELS[SettingScope.Workspace]).toBe('Workspace Settings');
    });

    it('should have label for System scope', () => {
      expect(SCOPE_LABELS[SettingScope.System]).toBe('System Settings');
    });

    it('should have all scope labels', () => {
      expect(Object.keys(SCOPE_LABELS)).toHaveLength(3);
    });

    it('should use proper capitalization', () => {
      expect(SCOPE_LABELS[SettingScope.User]).toMatch(/^[A-Z]/);
      expect(SCOPE_LABELS[SettingScope.Workspace]).toMatch(/^[A-Z]/);
      expect(SCOPE_LABELS[SettingScope.System]).toMatch(/^[A-Z]/);
    });

    it('should contain "Settings" in all labels', () => {
      expect(SCOPE_LABELS[SettingScope.User]).toContain('Settings');
      expect(SCOPE_LABELS[SettingScope.Workspace]).toContain('Settings');
      expect(SCOPE_LABELS[SettingScope.System]).toContain('Settings');
    });

    it('should be a const object', () => {
      expect(SCOPE_LABELS).toBeDefined();
      expect(typeof SCOPE_LABELS).toBe('object');
    });
  });

  describe('getScopeItems', () => {
    it('should return array of scope items', () => {
      const items = getScopeItems();

      expect(Array.isArray(items)).toBe(true);
    });

    it('should return 3 scope items', () => {
      const items = getScopeItems();

      expect(items).toHaveLength(3);
    });

    it('should have item for User scope', () => {
      const items = getScopeItems();

      const userItem = items.find((item) => item.value === SettingScope.User);
      expect(userItem).toBeDefined();
      expect(userItem?.label).toBe('User Settings');
    });

    it('should have item for Workspace scope', () => {
      const items = getScopeItems();

      const workspaceItem = items.find(
        (item) => item.value === SettingScope.Workspace,
      );
      expect(workspaceItem).toBeDefined();
      expect(workspaceItem?.label).toBe('Workspace Settings');
    });

    it('should have item for System scope', () => {
      const items = getScopeItems();

      const systemItem = items.find(
        (item) => item.value === SettingScope.System,
      );
      expect(systemItem).toBeDefined();
      expect(systemItem?.label).toBe('System Settings');
    });

    it('should have label and value properties', () => {
      const items = getScopeItems();

      items.forEach((item) => {
        expect(item).toHaveProperty('label');
        expect(item).toHaveProperty('value');
      });
    });

    it('should use SCOPE_LABELS for labels', () => {
      const items = getScopeItems();

      items.forEach((item) => {
        expect(SCOPE_LABELS[item.value as keyof typeof SCOPE_LABELS]).toBe(
          item.label,
        );
      });
    });

    it('should return same items on multiple calls', () => {
      const items1 = getScopeItems();
      const items2 = getScopeItems();

      expect(items1).toEqual(items2);
    });

    it('should have consistent order', () => {
      const items = getScopeItems();

      expect(items[0].value).toBe(SettingScope.User);
      expect(items[1].value).toBe(SettingScope.Workspace);
      expect(items[2].value).toBe(SettingScope.System);
    });
  });

  describe('getScopeMessageForSetting', () => {
    let mockSettings: LoadedSettings;

    beforeEach(() => {
      mockSettings = {
        forScope: vi.fn((_scope: SettingScope) => ({
          settings: {},
        })),
      } as never;
    });

    it('should return empty string when setting not in other scopes', () => {
      vi.mocked(mockSettings.forScope).mockImplementation(
        () => ({ settings: {} }) as never,
      );

      const message = getScopeMessageForSetting(
        'testSetting',
        SettingScope.User,
        mockSettings,
      );

      expect(message).toBe('');
    });

    it('should indicate modification in other scope', () => {
      vi.mocked(mockSettings.forScope).mockImplementation((scope) => {
        if (scope === SettingScope.User) {
          return { settings: {} } as never;
        }
        if (scope === SettingScope.Workspace) {
          return { settings: { testSetting: 'value' } } as never;
        }
        return { settings: {} } as never;
      });

      const message = getScopeMessageForSetting(
        'testSetting',
        SettingScope.User,
        mockSettings,
      );

      expect(message).toContain('Modified in');
      expect(message).toContain('workspace');
    });

    it('should use "Also modified" when setting exists in current scope', () => {
      vi.mocked(mockSettings.forScope).mockImplementation((scope) => {
        if (scope === SettingScope.User || scope === SettingScope.Workspace) {
          return { settings: { testSetting: 'value' } } as never;
        }
        return { settings: {} } as never;
      });

      const message = getScopeMessageForSetting(
        'testSetting',
        SettingScope.User,
        mockSettings,
      );

      expect(message).toContain('Also modified in');
      expect(message).toContain('workspace');
    });

    it('should list multiple scopes', () => {
      vi.mocked(mockSettings.forScope).mockImplementation((scope) => {
        if (scope === SettingScope.User) {
          return { settings: {} } as never;
        }
        return { settings: { testSetting: 'value' } } as never;
      });

      const message = getScopeMessageForSetting(
        'testSetting',
        SettingScope.User,
        mockSettings,
      );

      expect(message).toContain('workspace');
      expect(message).toContain('system');
      expect(message).toContain(',');
    });

    it('should exclude current scope from other scopes', () => {
      vi.mocked(mockSettings.forScope).mockImplementation(
        () => ({ settings: { testSetting: 'value' } }) as never,
      );

      const message = getScopeMessageForSetting(
        'testSetting',
        SettingScope.User,
        mockSettings,
      );

      expect(message).not.toContain('user');
    });

    it('should wrap message in parentheses', () => {
      vi.mocked(mockSettings.forScope).mockImplementation((scope) => {
        if (scope === SettingScope.Workspace) {
          return { settings: { testSetting: 'value' } } as never;
        }
        return { settings: {} } as never;
      });

      const message = getScopeMessageForSetting(
        'testSetting',
        SettingScope.User,
        mockSettings,
      );

      expect(message).toMatch(/^\(/);
      expect(message).toMatch(/\)$/);
    });

    it('should handle all scopes being modified', () => {
      vi.mocked(mockSettings.forScope).mockImplementation(
        () => ({ settings: { testSetting: 'value' } }) as never,
      );

      const message = getScopeMessageForSetting(
        'testSetting',
        SettingScope.User,
        mockSettings,
      );

      expect(message).toContain('workspace');
      expect(message).toContain('system');
    });

    it('should work with different setting keys', () => {
      vi.mocked(mockSettings.forScope).mockImplementation((scope) => {
        if (scope === SettingScope.Workspace) {
          return {
            settings: {
              differentSetting: 'value',
            },
          } as never;
        }
        return { settings: {} } as never;
      });

      const message = getScopeMessageForSetting(
        'differentSetting',
        SettingScope.User,
        mockSettings,
      );

      expect(message).toContain('Modified in');
    });

    it('should handle Workspace as selected scope', () => {
      vi.mocked(mockSettings.forScope).mockImplementation((scope) => {
        if (scope === SettingScope.User) {
          return { settings: { testSetting: 'value' } } as never;
        }
        return { settings: {} } as never;
      });

      const message = getScopeMessageForSetting(
        'testSetting',
        SettingScope.Workspace,
        mockSettings,
      );

      expect(message).toContain('user');
      expect(message).not.toContain('workspace');
    });

    it('should handle System as selected scope', () => {
      vi.mocked(mockSettings.forScope).mockImplementation((scope) => {
        if (scope === SettingScope.User) {
          return { settings: { testSetting: 'value' } } as never;
        }
        return { settings: {} } as never;
      });

      const message = getScopeMessageForSetting(
        'testSetting',
        SettingScope.System,
        mockSettings,
      );

      expect(message).toContain('user');
      expect(message).not.toContain('system');
    });

    it('should call forScope for each scope', () => {
      getScopeMessageForSetting('testSetting', SettingScope.User, mockSettings);

      expect(mockSettings.forScope).toHaveBeenCalledWith(SettingScope.User);
      expect(mockSettings.forScope).toHaveBeenCalledWith(
        SettingScope.Workspace,
      );
      expect(mockSettings.forScope).toHaveBeenCalledWith(SettingScope.System);
    });

    it('should handle empty settings', () => {
      vi.mocked(mockSettings.forScope).mockImplementation(
        () => ({ settings: {} }) as never,
      );

      const message = getScopeMessageForSetting(
        'nonexistent',
        SettingScope.User,
        mockSettings,
      );

      expect(message).toBe('');
    });
  });

  describe('scope filtering', () => {
    it('should filter out selected scope from other scopes', () => {
      const mockSettings = {
        forScope: vi.fn((scope) => {
          if (scope === SettingScope.Workspace) {
            return { settings: { test: 'value' } } as never;
          }
          return { settings: {} } as never;
        }),
      } as never;

      const message = getScopeMessageForSetting(
        'test',
        SettingScope.User,
        mockSettings,
      );

      expect(message).not.toContain('user');
      expect(message).toContain('workspace');
    });

    it('should check all other scopes', () => {
      const mockForScope = vi.fn(() => ({ settings: {} }) as never);
      const mockSettings = {
        forScope: mockForScope,
      } as unknown as LoadedSettings;

      getScopeMessageForSetting('test', SettingScope.User, mockSettings);

      // Should be called 3 times (once for each scope including current)
      expect(mockForScope).toHaveBeenCalledTimes(3);
    });
  });

  describe('message formatting', () => {
    it('should join multiple scopes with comma', () => {
      const mockSettings = {
        forScope: vi.fn((scope) => {
          if (scope !== SettingScope.User) {
            return { settings: { test: 'value' } } as never;
          }
          return { settings: {} } as never;
        }),
      } as never;

      const message = getScopeMessageForSetting(
        'test',
        SettingScope.User,
        mockSettings,
      );

      expect(message).toMatch(/workspace.*,.*system/);
    });

    it('should use lowercase scope names in message', () => {
      const mockSettings = {
        forScope: vi.fn((scope) => {
          if (scope === SettingScope.Workspace) {
            return { settings: { test: 'value' } } as never;
          }
          return { settings: {} } as never;
        }),
      } as never;

      const message = getScopeMessageForSetting(
        'test',
        SettingScope.User,
        mockSettings,
      );

      expect(message).toContain('workspace');
      expect(message).not.toContain('Workspace');
    });
  });

  describe('integration', () => {
    it('should work with getScopeItems', () => {
      const items = getScopeItems();
      const mockSettings = {
        forScope: vi.fn(() => ({ settings: {} }) as never),
      } as never;

      items.forEach((item) => {
        const message = getScopeMessageForSetting(
          'test',
          item.value,
          mockSettings,
        );
        expect(typeof message).toBe('string');
      });
    });

    it('should use SCOPE_LABELS consistently', () => {
      const items = getScopeItems();

      items.forEach((item) => {
        expect(item.label).toBe(
          SCOPE_LABELS[item.value as keyof typeof SCOPE_LABELS],
        );
      });
    });
  });
});
