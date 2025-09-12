/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
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
  // Business logic utilities
  getSettingValue,
  isSettingModified,
  TEST_ONLY,
  settingExistsInScope,
  setPendingSettingValue,
  hasRestartRequiredSettings,
  getRestartRequiredFromModified,
  getDisplayValue,
  isDefaultValue,
  isValueInherited,
  getEffectiveDisplayValue,
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
              disableLoadingPhrases: {
                type: 'boolean',
                label: 'Disable Loading Phrases',
                category: 'UI',
                requiresRestart: true,
                default: false,
                description: 'Disable loading phrases for accessibility',
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
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: false },
        });

        const value = getEffectiveValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
        );
        expect(value).toBe(true);
      });

      it('should return value from merged settings when not set in current scope', () => {
        const settings = makeMockSettings({});
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: true },
        });

        const value = getEffectiveValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
        );
        expect(value).toBe(true);
      });

      it('should return default value when not set anywhere', () => {
        const settings = makeMockSettings({});
        const mergedSettings = makeMockSettings({});

        const value = getEffectiveValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
        );
        expect(value).toBe(false); // default value
      });

      it('should handle nested settings correctly', () => {
        const settings = makeMockSettings({
          ui: { accessibility: { disableLoadingPhrases: true } },
        });
        const mergedSettings = makeMockSettings({
          ui: { accessibility: { disableLoadingPhrases: false } },
        });

        const value = getEffectiveValue(
          'ui.accessibility.disableLoadingPhrases',
          settings,
          mergedSettings,
        );
        expect(value).toBe(true);
      });

      it('should return undefined for invalid settings', () => {
        const settings = makeMockSettings({});
        const mergedSettings = makeMockSettings({});

        const value = getEffectiveValue(
          'invalidSetting',
          settings,
          mergedSettings,
        );
        expect(value).toBeUndefined();
      });
    });

    describe('getAllSettingKeys', () => {
      it('should return all setting keys', () => {
        const keys = getAllSettingKeys();
        expect(keys).toContain('test');
        expect(keys).toContain('ui.accessibility.disableLoadingPhrases');
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
        expect(
          isValidSettingKey('ui.accessibility.disableLoadingPhrases'),
        ).toBe(true);
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
          getSettingCategory('ui.accessibility.disableLoadingPhrases'),
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
        expect(uiKeys).toContain('ui.accessibility.disableLoadingPhrases');
        expect(uiKeys).not.toContain('ui.theme'); // This is now marked false
      });

      it('should not include Advanced category settings', () => {
        const categories = getDialogSettingsByCategory();

        // Advanced settings should be filtered out
        expect(categories['Advanced']).toBeUndefined();
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
        expect(keys).toContain('ui.accessibility.disableLoadingPhrases');
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
        expect(dialogKeys).toContain('ui.accessibility.disableLoadingPhrases');

        // Should NOT include settings marked as hidden
        expect(dialogKeys).not.toContain('ui.theme'); // Hidden
      });

      it('should return fewer keys than getAllSettingKeys', () => {
        const allKeys = getAllSettingKeys();
        const dialogKeys = getDialogSettingKeys();

        expect(dialogKeys.length).toBeLessThan(allKeys.length);
        expect(dialogKeys.length).toBeGreaterThan(0);
      });

      it('should handle nested settings display correctly', () => {
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

        // Test the specific issue with fileFiltering.respectGitIgnore
        const key = 'context.fileFiltering.respectGitIgnore';
        const initialSettings = makeMockSettings({});
        const pendingSettings = makeMockSettings({});

        // Set the nested setting to true
        const updatedPendingSettings = setPendingSettingValue(
          key,
          true,
          pendingSettings,
        );

        // Check if the setting exists in pending settings
        const existsInPending = settingExistsInScope(
          key,
          updatedPendingSettings,
        );
        expect(existsInPending).toBe(true);

        // Get the value from pending settings
        const valueFromPending = getSettingValue(
          key,
          updatedPendingSettings,
          {},
        );
        expect(valueFromPending).toBe(true);

        // Test getDisplayValue should show the pending change
        const displayValue = getDisplayValue(
          key,
          initialSettings,
          {},
          new Set(),
          updatedPendingSettings,
        );
        expect(displayValue).toBe('true'); // Should show true (no * since value matches default)

        // Test that modified settings also show the * indicator
        const modifiedSettings = new Set([key]);
        const displayValueWithModified = getDisplayValue(
          key,
          initialSettings,
          {},
          modifiedSettings,
          {},
        );
        expect(displayValueWithModified).toBe('true*'); // Should show true* because it's in modified settings and default is true
      });
    });
  });

  describe('Business Logic Utilities', () => {
    describe('getSettingValue', () => {
      it('should return value from settings when set', () => {
        const settings = makeMockSettings({ ui: { requiresRestart: true } });
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: false },
        });

        const value = getSettingValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
        );
        expect(value).toBe(true);
      });

      it('should return value from merged settings when not set in current scope', () => {
        const settings = makeMockSettings({});
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: true },
        });

        const value = getSettingValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
        );
        expect(value).toBe(true);
      });

      it('should return default value for invalid setting', () => {
        const settings = makeMockSettings({});
        const mergedSettings = makeMockSettings({});

        const value = getSettingValue(
          'invalidSetting',
          settings,
          mergedSettings,
        );
        expect(value).toBe(false); // Default fallback
      });
    });

    describe('isSettingModified', () => {
      it('should return true when value differs from default', () => {
        expect(isSettingModified('ui.requiresRestart', true)).toBe(true);
        expect(
          isSettingModified('ui.accessibility.disableLoadingPhrases', true),
        ).toBe(true);
      });

      it('should return false when value matches default', () => {
        expect(isSettingModified('ui.requiresRestart', false)).toBe(false);
        expect(
          isSettingModified('ui.accessibility.disableLoadingPhrases', false),
        ).toBe(false);
      });
    });

    describe('settingExistsInScope', () => {
      it('should return true for top-level settings that exist', () => {
        const settings = makeMockSettings({ ui: { requiresRestart: true } });
        expect(settingExistsInScope('ui.requiresRestart', settings)).toBe(true);
      });

      it('should return false for top-level settings that do not exist', () => {
        const settings = makeMockSettings({});
        expect(settingExistsInScope('ui.requiresRestart', settings)).toBe(
          false,
        );
      });

      it('should return true for nested settings that exist', () => {
        const settings = makeMockSettings({
          ui: { accessibility: { disableLoadingPhrases: true } },
        });
        expect(
          settingExistsInScope(
            'ui.accessibility.disableLoadingPhrases',
            settings,
          ),
        ).toBe(true);
      });

      it('should return false for nested settings that do not exist', () => {
        const settings = makeMockSettings({});
        expect(
          settingExistsInScope(
            'ui.accessibility.disableLoadingPhrases',
            settings,
          ),
        ).toBe(false);
      });

      it('should return false when parent exists but child does not', () => {
        const settings = makeMockSettings({ ui: { accessibility: {} } });
        expect(
          settingExistsInScope(
            'ui.accessibility.disableLoadingPhrases',
            settings,
          ),
        ).toBe(false);
      });
    });

    describe('setPendingSettingValue', () => {
      it('should set top-level setting value', () => {
        const pendingSettings = makeMockSettings({});
        const result = setPendingSettingValue(
          'ui.hideWindowTitle',
          true,
          pendingSettings,
        );

        expect(result.ui?.hideWindowTitle).toBe(true);
      });

      it('should set nested setting value', () => {
        const pendingSettings = makeMockSettings({});
        const result = setPendingSettingValue(
          'ui.accessibility.disableLoadingPhrases',
          true,
          pendingSettings,
        );

        expect(result.ui?.accessibility?.disableLoadingPhrases).toBe(true);
      });

      it('should preserve existing nested settings', () => {
        const pendingSettings = makeMockSettings({
          ui: { accessibility: { disableLoadingPhrases: false } },
        });
        const result = setPendingSettingValue(
          'ui.accessibility.disableLoadingPhrases',
          true,
          pendingSettings,
        );

        expect(result.ui?.accessibility?.disableLoadingPhrases).toBe(true);
      });

      it('should not mutate original settings', () => {
        const pendingSettings = makeMockSettings({});
        setPendingSettingValue('ui.requiresRestart', true, pendingSettings);

        expect(pendingSettings).toEqual({});
      });
    });

    describe('hasRestartRequiredSettings', () => {
      it('should return true when modified settings require restart', () => {
        const modifiedSettings = new Set<string>([
          'advanced.autoConfigureMemory',
          'ui.requiresRestart',
        ]);
        expect(hasRestartRequiredSettings(modifiedSettings)).toBe(true);
      });

      it('should return false when no modified settings require restart', () => {
        const modifiedSettings = new Set<string>(['test']);
        expect(hasRestartRequiredSettings(modifiedSettings)).toBe(false);
      });

      it('should return false for empty set', () => {
        const modifiedSettings = new Set<string>();
        expect(hasRestartRequiredSettings(modifiedSettings)).toBe(false);
      });
    });

    describe('getRestartRequiredFromModified', () => {
      it('should return only settings that require restart', () => {
        const modifiedSettings = new Set<string>([
          'ui.requiresRestart',
          'test',
        ]);
        const result = getRestartRequiredFromModified(modifiedSettings);

        expect(result).toContain('ui.requiresRestart');
        expect(result).not.toContain('test');
      });

      it('should return empty array when no settings require restart', () => {
        const modifiedSettings = new Set<string>([
          'requiresRestart',
          'hideTips',
        ]);
        const result = getRestartRequiredFromModified(modifiedSettings);

        expect(result).toEqual([]);
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
          const modifiedSettings = new Set<string>();

          const result = getDisplayValue(
            'ui.theme',
            settings,
            mergedSettings,
            modifiedSettings,
          );

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
          const modifiedSettings = new Set<string>();

          const result = getDisplayValue(
            'ui.theme',
            makeMockSettings({}),
            makeMockSettings({}),
            modifiedSettings,
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
          const modifiedSettings = new Set<string>();

          const result = getDisplayValue(
            'ui.theme',
            settings,
            mergedSettings,
            modifiedSettings,
          );
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
          const modifiedSettings = new Set<string>();

          const result = getDisplayValue(
            'ui.theme',
            settings,
            mergedSettings,
            modifiedSettings,
          );
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
          const modifiedSettings = new Set<string>();

          const result = getDisplayValue(
            'ui.theme',
            makeMockSettings({}),
            makeMockSettings({}),
            modifiedSettings,
          );
          expect(result).toBe('Bar');
        });
      });

      it('should show value without * when setting matches default', () => {
        const settings = makeMockSettings({
          ui: { requiresRestart: false },
        }); // false matches default, so no *
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: false },
        });
        const modifiedSettings = new Set<string>();

        const result = getDisplayValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
          modifiedSettings,
        );
        expect(result).toBe('false*');
      });

      it('should show default value when setting is not in scope', () => {
        const settings = makeMockSettings({}); // no setting in scope
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: false },
        });
        const modifiedSettings = new Set<string>();

        const result = getDisplayValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
          modifiedSettings,
        );
        expect(result).toBe('false'); // shows default value
      });

      it('should show value with * when changed from default', () => {
        const settings = makeMockSettings({ ui: { requiresRestart: true } }); // true is different from default (false)
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: true },
        });
        const modifiedSettings = new Set<string>();

        const result = getDisplayValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
          modifiedSettings,
        );
        expect(result).toBe('true*');
      });

      it('should show default value without * when setting does not exist in scope', () => {
        const settings = makeMockSettings({}); // setting doesn't exist in scope, show default
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: false },
        });
        const modifiedSettings = new Set<string>();

        const result = getDisplayValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
          modifiedSettings,
        );
        expect(result).toBe('false'); // default value (false) without *
      });

      it('should show value with * when user changes from default', () => {
        const settings = makeMockSettings({}); // setting doesn't exist in scope originally
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: false },
        });
        const modifiedSettings = new Set<string>(['ui.requiresRestart']);
        const pendingSettings = makeMockSettings({
          ui: { requiresRestart: true },
        }); // user changed to true

        const result = getDisplayValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
          modifiedSettings,
          pendingSettings,
        );
        expect(result).toBe('true*'); // changed from default (false) to true
      });
    });

    describe('isDefaultValue', () => {
      it('should return true when setting does not exist in scope', () => {
        const settings = makeMockSettings({}); // setting doesn't exist

        const result = isDefaultValue('ui.requiresRestart', settings);
        expect(result).toBe(true);
      });

      it('should return false when setting exists in scope', () => {
        const settings = makeMockSettings({ ui: { requiresRestart: true } }); // setting exists

        const result = isDefaultValue('ui.requiresRestart', settings);
        expect(result).toBe(false);
      });

      it('should return true when nested setting does not exist in scope', () => {
        const settings = makeMockSettings({}); // nested setting doesn't exist

        const result = isDefaultValue(
          'ui.accessibility.disableLoadingPhrases',
          settings,
        );
        expect(result).toBe(true);
      });

      it('should return false when nested setting exists in scope', () => {
        const settings = makeMockSettings({
          ui: { accessibility: { disableLoadingPhrases: true } },
        }); // nested setting exists

        const result = isDefaultValue(
          'ui.accessibility.disableLoadingPhrases',
          settings,
        );
        expect(result).toBe(false);
      });
    });

    describe('isValueInherited', () => {
      it('should return false for top-level settings that exist in scope', () => {
        const settings = makeMockSettings({ ui: { requiresRestart: true } });
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: true },
        });

        const result = isValueInherited(
          'ui.requiresRestart',
          settings,
          mergedSettings,
        );
        expect(result).toBe(false);
      });

      it('should return true for top-level settings that do not exist in scope', () => {
        const settings = makeMockSettings({});
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: true },
        });

        const result = isValueInherited(
          'ui.requiresRestart',
          settings,
          mergedSettings,
        );
        expect(result).toBe(true);
      });

      it('should return false for nested settings that exist in scope', () => {
        const settings = makeMockSettings({
          ui: { accessibility: { disableLoadingPhrases: true } },
        });
        const mergedSettings = makeMockSettings({
          ui: { accessibility: { disableLoadingPhrases: true } },
        });

        const result = isValueInherited(
          'ui.accessibility.disableLoadingPhrases',
          settings,
          mergedSettings,
        );
        expect(result).toBe(false);
      });

      it('should return true for nested settings that do not exist in scope', () => {
        const settings = makeMockSettings({});
        const mergedSettings = makeMockSettings({
          ui: { accessibility: { disableLoadingPhrases: true } },
        });

        const result = isValueInherited(
          'ui.accessibility.disableLoadingPhrases',
          settings,
          mergedSettings,
        );
        expect(result).toBe(true);
      });
    });

    describe('getEffectiveDisplayValue', () => {
      it('should return value from settings when available', () => {
        const settings = makeMockSettings({ ui: { requiresRestart: true } });
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: false },
        });

        const result = getEffectiveDisplayValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
        );
        expect(result).toBe(true);
      });

      it('should return value from merged settings when not in scope', () => {
        const settings = makeMockSettings({});
        const mergedSettings = makeMockSettings({
          ui: { requiresRestart: true },
        });

        const result = getEffectiveDisplayValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
        );
        expect(result).toBe(true);
      });

      it('should return default value for undefined values', () => {
        const settings = makeMockSettings({});
        const mergedSettings = makeMockSettings({});

        const result = getEffectiveDisplayValue(
          'ui.requiresRestart',
          settings,
          mergedSettings,
        );
        expect(result).toBe(false); // Default value
      });
    });
  });
});
