/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  // Schema utilities
  getSettingsByCategory,
  getSettingDefinition,
  requiresRestart,
  getDefaultValue,
  getRestartRequiredSettings,
  getEffectiveValue,
  getAllSettingKeys,
  getSettingsByType,
  getSettingsRequiringRestart,
  isValidSettingKey,
  getSettingCategory,
  shouldShowInDialog,
  getDialogSettingsByCategory,
  getDialogSettingsByType,
  getDialogSettingKeys,
  // Business logic utilities,
  TEST_ONLY,
  isInScope,
  getDisplayValue,
} from './settingsUtils.js';
import {
  getSettingsSchema,
  type SettingDefinition,
  type Settings,
  type SettingsSchema,
  type SettingsSchemaType,
} from '../config/settingsSchema.js';

vi.mock('../config/settingsSchema.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../config/settingsSchema.js')>();
  return {
    ...original,
    getSettingsSchema: vi.fn(),
  };
});

function makeMockSettings(settings: unknown): Settings {
  return settings as Settings;
}

describe('SettingsUtils', () => {
  beforeEach(() => {
    const SETTINGS_SCHEMA = {
      mcpServers: {
        type: 'object',
        label: 'MCP Servers',
        category: 'Advanced',
        requiresRestart: true,
        default: {} as Record<string, string>,
        description: 'Configuration for MCP servers.',
        showInDialog: false,
      },
      test: {
        type: 'string',
        label: 'Test',
        category: 'Basic',
        requiresRestart: false,
        default: 'hello',
        description: 'A test field',
        showInDialog: true,
      },
      advanced: {
        type: 'object',
        label: 'Advanced',
        category: 'Advanced',
        requiresRestart: true,
        default: {},
        description: 'Advanced settings for power users.',
        showInDialog: false,
        properties: {
          autoConfigureMemory: {
            type: 'boolean',
            label: 'Auto Configure Max Old Space Size',
            category: 'Advanced',
            requiresRestart: true,
            default: false,
            description: 'Automatically configure Node.js memory limits',
            showInDialog: true,
          },
        },
      },
      ui: {
        type: 'object',
        label: 'UI',
        category: 'UI',
        requiresRestart: false,
        default: {},
        description: 'User interface settings.',
        showInDialog: false,
        properties: {
          theme: {
            type: 'string',
            label: 'Theme',
            category: 'UI',
            requiresRestart: false,
            default: undefined as string | undefined,
            description: 'The color theme for the UI.',
            showInDialog: false,
          },
          requiresRestart: {
            type: 'boolean',
            label: 'Requires Restart',
            category: 'UI',
            default: false,
            requiresRestart: true,
          },
          accessibility: {
            type: 'object',
            label: 'Accessibility',
            category: 'UI',
            requiresRestart: true,
            default: {},
            description: 'Accessibility settings.',
            showInDialog: false,
            properties: {
              enableLoadingPhrases: {
                type: 'boolean',
                label: 'Enable Loading Phrases',
                category: 'UI',
                requiresRestart: true,
                default: true,
                description: 'Enable loading phrases during operations.',
                showInDialog: true,
              },
            },
          },
        },
      },
      tools: {
        type: 'object',
        label: 'Tools',
        category: 'Tools',
        requiresRestart: false,
        default: {},
        description: 'Tool settings.',
        showInDialog: false,
        properties: {
          shell: {
            type: 'object',
            label: 'Shell',
            category: 'Tools',
            requiresRestart: false,
            default: {},
            description: 'Shell tool settings.',
            showInDialog: false,
            properties: {
              pager: {
                type: 'string',
                label: 'Pager',
                category: 'Tools',
                requiresRestart: false,
                default: 'less',
                description: 'The pager to use for long output.',
                showInDialog: true,
              },
            },
          },
        },
      },
    } as const satisfies SettingsSchema;

    vi.mocked(getSettingsSchema).mockReturnValue(
      SETTINGS_SCHEMA as unknown as SettingsSchemaType,
    );
  });
  afterEach(() => {
    TEST_ONLY.clearFlattenedSchema();
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe('Schema Utilities', () => {
    describe('getSettingsByCategory', () => {
      it('should group settings by category', () => {
        const categories = getSettingsByCategory();
        expect(categories).toHaveProperty('Advanced');
        expect(categories).toHaveProperty('Basic');
      });

      it('should include key property in grouped settings', () => {
        const categories = getSettingsByCategory();

        Object.entries(categories).forEach(([_category, settings]) => {
          settings.forEach((setting) => {
            expect(setting.key).toBeDefined();
          });
        });
      });
    });

    describe('getSettingDefinition', () => {
      it('should return definition for valid setting', () => {
        const definition = getSettingDefinition('ui.theme');
        expect(definition).toBeDefined();
        expect(definition?.label).toBe('Theme');
      });

      it('should return undefined for invalid setting', () => {
        const definition = getSettingDefinition('invalidSetting');
        expect(definition).toBeUndefined();
      });
    });

    describe('requiresRestart', () => {
      it('should return true for settings that require restart', () => {
        expect(requiresRestart('ui.requiresRestart')).toBe(true);
      });

      it('should return false for settings that do not require restart', () => {
        expect(requiresRestart('ui.theme')).toBe(false);
      });

      it('should return false for invalid settings', () => {
        expect(requiresRestart('invalidSetting')).toBe(false);
      });
    });

    describe('getDefaultValue', () => {
      it('should return correct default values', () => {
        expect(getDefaultValue('test')).toBe('hello');
        expect(getDefaultValue('ui.requiresRestart')).toBe(false);
      });

      it('should return undefined for invalid settings', () => {
        expect(getDefaultValue('invalidSetting')).toBeUndefined();
      });
    });

    describe('getRestartRequiredSettings', () => {
      it('should return all settings that require restart', () => {
        const restartSettings = getRestartRequiredSettings();
        expect(restartSettings).toContain('mcpServers');
        expect(restartSettings).toContain('ui.requiresRestart');
      });
    });

    describe('getEffectiveValue', () => {
      it('should return value from settings when set', () => {
        const settings = makeMockSettings({ ui: { requiresRestart: true } });

        const value = getEffectiveValue('ui.requiresRestart', settings);
        expect(value).toBe(true);
      });

      it('should return default value when not set anywhere', () => {
        const settings = makeMockSettings({});

        const value = getEffectiveValue('ui.requiresRestart', settings);
        expect(value).toBe(false); // default value
      });

      it('should handle nested settings correctly', () => {
        const settings = makeMockSettings({
          ui: { accessibility: { enableLoadingPhrases: false } },
        });

        const value = getEffectiveValue(
          'ui.accessibility.enableLoadingPhrases',
          settings,
        );
        expect(value).toBe(false);
      });

      it('should return undefined for invalid settings', () => {
        const settings = makeMockSettings({});

        const value = getEffectiveValue('invalidSetting', settings);
        expect(value).toBeUndefined();
      });
    });

    describe('getAllSettingKeys', () => {
      it('should return all setting keys', () => {
        const keys = getAllSettingKeys();
        expect(keys).toContain('test');
        expect(keys).toContain('ui.accessibility.enableLoadingPhrases');
      });
    });

    describe('getSettingsByType', () => {
      it('should return only boolean settings', () => {
        const booleanSettings = getSettingsByType('boolean');
        expect(booleanSettings.length).toBeGreaterThan(0);
        booleanSettings.forEach((setting) => {
          expect(setting.type).toBe('boolean');
        });
      });
    });

    describe('getSettingsRequiringRestart', () => {
      it('should return only settings that require restart', () => {
        const restartSettings = getSettingsRequiringRestart();
        expect(restartSettings.length).toBeGreaterThan(0);
        restartSettings.forEach((setting) => {
          expect(setting.requiresRestart).toBe(true);
        });
      });
    });

    describe('isValidSettingKey', () => {
      it('should return true for valid setting keys', () => {
        expect(isValidSettingKey('ui.requiresRestart')).toBe(true);
        expect(isValidSettingKey('ui.accessibility.enableLoadingPhrases')).toBe(
          true,
        );
      });

      it('should return false for invalid setting keys', () => {
        expect(isValidSettingKey('invalidSetting')).toBe(false);
        expect(isValidSettingKey('')).toBe(false);
      });
    });

    describe('getSettingCategory', () => {
      it('should return correct category for valid settings', () => {
        expect(getSettingCategory('ui.requiresRestart')).toBe('UI');
        expect(
          getSettingCategory('ui.accessibility.enableLoadingPhrases'),
        ).toBe('UI');
      });

      it('should return undefined for invalid settings', () => {
        expect(getSettingCategory('invalidSetting')).toBeUndefined();
      });
    });

    describe('shouldShowInDialog', () => {
      it('should return true for settings marked to show in dialog', () => {
        expect(shouldShowInDialog('ui.requiresRestart')).toBe(true);
        expect(shouldShowInDialog('general.vimMode')).toBe(true);
        expect(shouldShowInDialog('ui.hideWindowTitle')).toBe(true);
      });

      it('should return false for settings marked to hide from dialog', () => {
        expect(shouldShowInDialog('ui.theme')).toBe(false);
      });

      it('should return true for invalid settings (default behavior)', () => {
        expect(shouldShowInDialog('invalidSetting')).toBe(true);
      });
    });

    describe('getDialogSettingsByCategory', () => {
      it('should only return settings marked for dialog display', async () => {
        const categories = getDialogSettingsByCategory();

        // Should include UI settings that are marked for dialog
        expect(categories['UI']).toBeDefined();
        const uiSettings = categories['UI'];
        const uiKeys = uiSettings.map((s) => s.key);
        expect(uiKeys).toContain('ui.requiresRestart');
        expect(uiKeys).toContain('ui.accessibility.enableLoadingPhrases');
        expect(uiKeys).not.toContain('ui.theme'); // This is now marked false
      });

      it('should include Advanced category settings', () => {
        const categories = getDialogSettingsByCategory();

        // Advanced settings should now be included because of autoConfigureMemory
        expect(categories['Advanced']).toBeDefined();
        const advancedSettings = categories['Advanced'];
        expect(advancedSettings.map((s) => s.key)).toContain(
          'advanced.autoConfigureMemory',
        );
      });

      it('should include settings with showInDialog=true', () => {
        const categories = getDialogSettingsByCategory();

        const allSettings = Object.values(categories).flat();
        const allKeys = allSettings.map((s) => s.key);

        expect(allKeys).toContain('test');
        expect(allKeys).toContain('ui.requiresRestart');
        expect(allKeys).not.toContain('ui.theme'); // Now hidden
        expect(allKeys).not.toContain('general.preferredEditor'); // Now hidden
      });
    });

    describe('getDialogSettingsByType', () => {
      it('should return only boolean dialog settings', () => {
        const booleanSettings = getDialogSettingsByType('boolean');

        const keys = booleanSettings.map((s) => s.key);
        expect(keys).toContain('ui.requiresRestart');
        expect(keys).toContain('ui.accessibility.enableLoadingPhrases');
        expect(keys).not.toContain('privacy.usageStatisticsEnabled');
        expect(keys).not.toContain('security.auth.selectedType'); // Advanced setting
        expect(keys).not.toContain('security.auth.useExternal'); // Advanced setting
      });

      it('should return only string dialog settings', () => {
        const stringSettings = getDialogSettingsByType('string');

        const keys = stringSettings.map((s) => s.key);
        // Note: theme and preferredEditor are now hidden from dialog
        expect(keys).not.toContain('ui.theme'); // Now marked false
        expect(keys).not.toContain('general.preferredEditor'); // Now marked false
        expect(keys).not.toContain('security.auth.selectedType'); // Advanced setting

        // Check that user-facing tool settings are included
        expect(keys).toContain('tools.shell.pager');

        // Check that advanced/hidden tool settings are excluded
        expect(keys).not.toContain('tools.discoveryCommand');
        expect(keys).not.toContain('tools.callCommand');
        expect(keys.every((key) => !key.startsWith('advanced.'))).toBe(true);
      });
    });

    describe('getDialogSettingKeys', () => {
      it('should return only settings marked for dialog display', () => {
        const dialogKeys = getDialogSettingKeys();

        // Should include settings marked for dialog
        expect(dialogKeys).toContain('ui.requiresRestart');

        // Should include nested settings marked for dialog
        expect(dialogKeys).toContain('ui.accessibility.enableLoadingPhrases');

        // Should NOT include settings marked as hidden
        expect(dialogKeys).not.toContain('ui.theme'); // Hidden
      });

      it('should return fewer keys than getAllSettingKeys', () => {
        const allKeys = getAllSettingKeys();
        const dialogKeys = getDialogSettingKeys();

        expect(dialogKeys.length).toBeLessThan(allKeys.length);
        expect(dialogKeys.length).toBeGreaterThan(0);
      });

      const nestedDialogKey = 'context.fileFiltering.respectGitIgnore';

      function mockNestedDialogSchema() {
        vi.mocked(getSettingsSchema).mockReturnValue({
          context: {
            type: 'object',
            label: 'Context',
            category: 'Context',
            requiresRestart: false,
            default: {},
            description: 'Settings for managing context provided to the model.',
            showInDialog: false,
            properties: {
              fileFiltering: {
                type: 'object',
                label: 'File Filtering',
                category: 'Context',
                requiresRestart: true,
                default: {},
                description: 'Settings for git-aware file filtering.',
                showInDialog: false,
                properties: {
                  respectGitIgnore: {
                    type: 'boolean',
                    label: 'Respect .gitignore',
                    category: 'Context',
                    requiresRestart: true,
                    default: true,
                    description: 'Respect .gitignore files when searching',
                    showInDialog: true,
                  },
                },
              },
            },
          },
        } as unknown as SettingsSchemaType);
      }

      it('should include nested file filtering setting in dialog keys', () => {
        mockNestedDialogSchema();

        const dialogKeys = getDialogSettingKeys();
        expect(dialogKeys).toContain(nestedDialogKey);
      });
    });
  });

  describe('Business Logic Utilities', () => {
    describe('isInScope', () => {
      it('should return true for top-level settings that exist', () => {
        const settings = makeMockSettings({ ui: { requiresRestart: true } });
        expect(isInScope('ui.requiresRestart', settings)).toBe(true);
      });

      it('should return false for top-level settings that do not exist', () => {
        const settings = makeMockSettings({});
        expect(isInScope('ui.requiresRestart', settings)).toBe(false);
      });

      it('should return true for nested settings that exist', () => {
        const settings = makeMockSettings({
          ui: { accessibility: { enableLoadingPhrases: true } },
        });
        expect(
          isInScope('ui.accessibility.enableLoadingPhrases', settings),
        ).toBe(true);
      });

      it('should return false for nested settings that do not exist', () => {
        const settings = makeMockSettings({});
        expect(
          isInScope('ui.accessibility.enableLoadingPhrases', settings),
        ).toBe(false);
      });

      it('should return false when parent exists but child does not', () => {
        const settings = makeMockSettings({ ui: { accessibility: {} } });
        expect(
          isInScope('ui.accessibility.enableLoadingPhrases', settings),
        ).toBe(false);
      });
    });

    describe('getDisplayValue', () => {
      describe('enum behavior', () => {
        enum StringEnum {
          FOO = 'foo',
          BAR = 'bar',
          BAZ = 'baz',
        }

        enum NumberEnum {
          ONE = 1,
          TWO = 2,
          THREE = 3,
        }

        const SETTING: SettingDefinition = {
          type: 'enum',
          label: 'Theme',
          options: [
            {
              value: StringEnum.FOO,
              label: 'Foo',
            },
            {
              value: StringEnum.BAR,
              label: 'Bar',
            },
            {
              value: StringEnum.BAZ,
              label: 'Baz',
            },
          ],
          category: 'UI',
          requiresRestart: false,
          default: StringEnum.BAR,
          description: 'The color theme for the UI.',
          showInDialog: false,
        };

        it('handles display of number-based enums', () => {
          vi.mocked(getSettingsSchema).mockReturnValue({
            ui: {
              properties: {
                theme: {
                  ...SETTING,
                  options: [
                    {
                      value: NumberEnum.ONE,
                      label: 'One',
                    },
                    {
                      value: NumberEnum.TWO,
                      label: 'Two',
                    },
                    {
                      value: NumberEnum.THREE,
                      label: 'Three',
                    },
                  ],
                },
              },
            },
          } as unknown as SettingsSchemaType);

          const settings = makeMockSettings({
            ui: { theme: NumberEnum.THREE },
          });
          const mergedSettings = makeMockSettings({
            ui: { theme: NumberEnum.THREE },
          });

          const result = getDisplayValue('ui.theme', settings, mergedSettings);

          expect(result).toBe('Three*');
        });

        it('handles default values for number-based enums', () => {
          vi.mocked(getSettingsSchema).mockReturnValue({
            ui: {
              properties: {
                theme: {
                  ...SETTING,
                  default: NumberEnum.THREE,
                  options: [
                    {
                      value: NumberEnum.ONE,
                      label: 'One',
                    },
                    {
                      value: NumberEnum.TWO,
                      label: 'Two',
                    },
                    {
                      value: NumberEnum.THREE,
                      label: 'Three',
                    },
                  ],
                },
              },
            },
          } as unknown as SettingsSchemaType);

          const result = getDisplayValue(
            'ui.theme',
            makeMockSettings({}),
            makeMockSettings({}),
          );
          expect(result).toBe('Three');
        });

        it('shows the enum display value', () => {
          vi.mocked(getSettingsSchema).mockReturnValue({
            ui: { properties: { theme: { ...SETTING } } },
          } as unknown as SettingsSchemaType);
          const settings = makeMockSettings({ ui: { theme: StringEnum.BAR } });
          const mergedSettings = makeMockSettings({
            ui: { theme: StringEnum.BAR },
          });

          const result = getDisplayValue('ui.theme', settings, mergedSettings);
          expect(result).toBe('Bar*');
        });

        it('passes through unknown values verbatim', () => {
          vi.mocked(getSettingsSchema).mockReturnValue({
            ui: {
              properties: {
                theme: { ...SETTING },
              },
            },
          } as unknown as SettingsSchemaType);
          const settings = makeMockSettings({ ui: { theme: 'xyz' } });
          const mergedSettings = makeMockSettings({ ui: { theme: 'xyz' } });

          const result = getDisplayValue('ui.theme', settings, mergedSettings);
          expect(result).toBe('xyz*');
        });

        it('shows the default value for string enums', () => {
          vi.mocked(getSettingsSchema).mockReturnValue({
            ui: {
              properties: {
                theme: { ...SETTING, default: StringEnum.BAR },
              },
            },
          } as unknown as SettingsSchemaType);

          const result = getDisplayValue(
            'ui.theme',
            makeMockSettings({}),
            makeMockSettings({}),
          );
          expect(result).toBe('Bar');
        });
      });

      it('should show value with * when setting exists in scope', () => {
        const settings = makeMockSettings({ ui: { requiresRestart: true } });
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: true },
        });

        const result = getDisplayValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
        );
        expect(result).toBe('true*');
      });
      it('should not show * when key is not in scope', () => {
        const settings = makeMockSettings({}); // no setting in scope
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: false },
        });

        const result = getDisplayValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
        );
        expect(result).toBe('false'); // shows default value
      });

      it('should show value with * when setting exists in scope, even when it matches default', () => {
        const settings = makeMockSettings({
          ui: { requiresRestart: false },
        }); // false matches default, but key is explicitly set in scope
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: false },
        });

        const result = getDisplayValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
        );
        expect(result).toBe('false*');
      });

      it('should show schema default (not inherited merged value) when key is not in scope', () => {
        const settings = makeMockSettings({}); // no setting in current scope
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: true },
        }); // inherited merged value differs from schema default (false)

        const result = getDisplayValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
        );
        expect(result).toBe('false');
      });
    });
  });
});
