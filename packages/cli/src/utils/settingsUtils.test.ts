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
  settingExistsInScope,
  setPendingSettingValue,
  hasRestartRequiredSettings,
  getRestartRequiredFromModified,
  getDisplayValue,
  isDefaultValue,
  isValueInherited,
  getEffectiveDisplayValue,
} from './settingsUtils.js';

describe('SettingsUtils', () => {
  describe('Schema Utilities', () => {
    describe('getSettingsByCategory', () => {
      it('should group settings by category', () => {
        const categories = getSettingsByCategory();

        expect(categories).toHaveProperty('General');
        expect(categories).toHaveProperty('UI');
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
        const definition = getSettingDefinition('ui.showMemoryUsage');
        expect(definition).toBeDefined();
        expect(definition?.label).toBe('Show Memory Usage');
      });

      it('should return undefined for invalid setting', () => {
        const definition = getSettingDefinition('invalidSetting');
        expect(definition).toBeUndefined();
      });
    });

    describe('requiresRestart', () => {
      it('should return true for settings that require restart', () => {
        expect(requiresRestart('advanced.autoConfigureMemory')).toBe(true);
        expect(requiresRestart('general.checkpointing.enabled')).toBe(true);
      });

      it('should return false for settings that do not require restart', () => {
        expect(requiresRestart('ui.showMemoryUsage')).toBe(false);
        expect(requiresRestart('ui.hideTips')).toBe(false);
      });

      it('should return false for invalid settings', () => {
        expect(requiresRestart('invalidSetting')).toBe(false);
      });
    });

    describe('getDefaultValue', () => {
      it('should return correct default values', () => {
        expect(getDefaultValue('ui.showMemoryUsage')).toBe(false);
        expect(
          getDefaultValue('context.fileFiltering.enableRecursiveFileSearch'),
        ).toBe(true);
      });

      it('should return undefined for invalid settings', () => {
        expect(getDefaultValue('invalidSetting')).toBeUndefined();
      });
    });

    describe('getRestartRequiredSettings', () => {
      it('should return all settings that require restart', () => {
        const restartSettings = getRestartRequiredSettings();
        expect(restartSettings).toContain('advanced.autoConfigureMemory');
        expect(restartSettings).toContain('general.checkpointing.enabled');
        expect(restartSettings).not.toContain('ui.showMemoryUsage');
      });
    });

    describe('getEffectiveValue', () => {
      it('should return value from settings when set', () => {
        const settings = { ui: { showMemoryUsage: true } };
        const mergedSettings = { ui: { showMemoryUsage: false } };

        const value = getEffectiveValue(
          'ui.showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(value).toBe(true);
      });

      it('should return value from merged settings when not set in current scope', () => {
        const settings = {};
        const mergedSettings = { ui: { showMemoryUsage: true } };

        const value = getEffectiveValue(
          'ui.showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(value).toBe(true);
      });

      it('should return default value when not set anywhere', () => {
        const settings = {};
        const mergedSettings = {};

        const value = getEffectiveValue(
          'ui.showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(value).toBe(false); // default value
      });

      it('should handle nested settings correctly', () => {
        const settings = {
          ui: { accessibility: { disableLoadingPhrases: true } },
        };
        const mergedSettings = {
          ui: { accessibility: { disableLoadingPhrases: false } },
        };

        const value = getEffectiveValue(
          'ui.accessibility.disableLoadingPhrases',
          settings,
          mergedSettings,
        );
        expect(value).toBe(true);
      });

      it('should return undefined for invalid settings', () => {
        const settings = {};
        const mergedSettings = {};

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
        expect(keys).toContain('ui.showMemoryUsage');
        expect(keys).toContain('ui.accessibility.disableLoadingPhrases');
        expect(keys).toContain('general.checkpointing.enabled');
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
        expect(isValidSettingKey('ui.showMemoryUsage')).toBe(true);
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
        expect(getSettingCategory('ui.showMemoryUsage')).toBe('UI');
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
        expect(shouldShowInDialog('ui.showMemoryUsage')).toBe(true);
        expect(shouldShowInDialog('general.vimMode')).toBe(true);
        expect(shouldShowInDialog('ui.hideWindowTitle')).toBe(true);
        expect(shouldShowInDialog('privacy.usageStatisticsEnabled')).toBe(
          false,
        );
      });

      it('should return false for settings marked to hide from dialog', () => {
        expect(shouldShowInDialog('security.auth.selectedType')).toBe(false);
        expect(shouldShowInDialog('tools.core')).toBe(false);
        expect(shouldShowInDialog('ui.customThemes')).toBe(false);
        expect(shouldShowInDialog('ui.theme')).toBe(false); // Changed to false
        expect(shouldShowInDialog('general.preferredEditor')).toBe(false); // Changed to false
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
        expect(uiKeys).toContain('ui.showMemoryUsage');
        expect(uiKeys).toContain('ui.hideWindowTitle');
        expect(uiKeys).not.toContain('ui.customThemes'); // This is marked false
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

        expect(allKeys).toContain('general.vimMode');
        expect(allKeys).toContain('ide.enabled');
        expect(allKeys).toContain('general.disableAutoUpdate');
        expect(allKeys).toContain('ui.showMemoryUsage');
        expect(allKeys).not.toContain('privacy.usageStatisticsEnabled');
        expect(allKeys).not.toContain('security.auth.selectedType');
        expect(allKeys).not.toContain('tools.core');
        expect(allKeys).not.toContain('ui.theme'); // Now hidden
        expect(allKeys).not.toContain('general.preferredEditor'); // Now hidden
      });
    });

    describe('getDialogSettingsByType', () => {
      it('should return only boolean dialog settings', () => {
        const booleanSettings = getDialogSettingsByType('boolean');

        const keys = booleanSettings.map((s) => s.key);
        expect(keys).toContain('ui.showMemoryUsage');
        expect(keys).toContain('general.vimMode');
        expect(keys).toContain('ui.hideWindowTitle');
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

        // Most string settings are now hidden, so let's just check they exclude advanced ones
        expect(keys.every((key) => !key.startsWith('tool'))).toBe(true); // No tool-related settings
      });
    });

    describe('getDialogSettingKeys', () => {
      it('should return only settings marked for dialog display', () => {
        const dialogKeys = getDialogSettingKeys();

        // Should include settings marked for dialog
        expect(dialogKeys).toContain('ui.showMemoryUsage');
        expect(dialogKeys).toContain('general.vimMode');
        expect(dialogKeys).toContain('ui.hideWindowTitle');
        expect(dialogKeys).not.toContain('privacy.usageStatisticsEnabled');
        expect(dialogKeys).toContain('ide.enabled');
        expect(dialogKeys).toContain('general.disableAutoUpdate');

        // Should include nested settings marked for dialog
        expect(dialogKeys).toContain('context.fileFiltering.respectGitIgnore');
        expect(dialogKeys).toContain(
          'context.fileFiltering.respectGeminiIgnore',
        );
        expect(dialogKeys).toContain(
          'context.fileFiltering.enableRecursiveFileSearch',
        );

        // Should NOT include settings marked as hidden
        expect(dialogKeys).not.toContain('ui.theme'); // Hidden
        expect(dialogKeys).not.toContain('ui.customThemes'); // Hidden
        expect(dialogKeys).not.toContain('general.preferredEditor'); // Hidden
        expect(dialogKeys).not.toContain('security.auth.selectedType'); // Advanced
        expect(dialogKeys).not.toContain('tools.core'); // Advanced
        expect(dialogKeys).not.toContain('mcpServers'); // Advanced
        expect(dialogKeys).not.toContain('telemetry'); // Advanced
      });

      it('should return fewer keys than getAllSettingKeys', () => {
        const allKeys = getAllSettingKeys();
        const dialogKeys = getDialogSettingKeys();

        expect(dialogKeys.length).toBeLessThan(allKeys.length);
        expect(dialogKeys.length).toBeGreaterThan(0);
      });

      it('should handle nested settings display correctly', () => {
        // Test the specific issue with fileFiltering.respectGitIgnore
        const key = 'context.fileFiltering.respectGitIgnore';
        const initialSettings = {};
        const pendingSettings = {};

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
        const settings = { ui: { showMemoryUsage: true } };
        const mergedSettings = { ui: { showMemoryUsage: false } };

        const value = getSettingValue(
          'ui.showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(value).toBe(true);
      });

      it('should return value from merged settings when not set in current scope', () => {
        const settings = {};
        const mergedSettings = { ui: { showMemoryUsage: true } };

        const value = getSettingValue(
          'ui.showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(value).toBe(true);
      });

      it('should return default value for invalid setting', () => {
        const settings = {};
        const mergedSettings = {};

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
        expect(isSettingModified('ui.showMemoryUsage', true)).toBe(true);
        expect(
          isSettingModified(
            'context.fileFiltering.enableRecursiveFileSearch',
            false,
          ),
        ).toBe(true);
      });

      it('should return false when value matches default', () => {
        expect(isSettingModified('ui.showMemoryUsage', false)).toBe(false);
        expect(
          isSettingModified(
            'context.fileFiltering.enableRecursiveFileSearch',
            true,
          ),
        ).toBe(false);
      });
    });

    describe('settingExistsInScope', () => {
      it('should return true for top-level settings that exist', () => {
        const settings = { ui: { showMemoryUsage: true } };
        expect(settingExistsInScope('ui.showMemoryUsage', settings)).toBe(true);
      });

      it('should return false for top-level settings that do not exist', () => {
        const settings = {};
        expect(settingExistsInScope('ui.showMemoryUsage', settings)).toBe(
          false,
        );
      });

      it('should return true for nested settings that exist', () => {
        const settings = {
          ui: { accessibility: { disableLoadingPhrases: true } },
        };
        expect(
          settingExistsInScope(
            'ui.accessibility.disableLoadingPhrases',
            settings,
          ),
        ).toBe(true);
      });

      it('should return false for nested settings that do not exist', () => {
        const settings = {};
        expect(
          settingExistsInScope(
            'ui.accessibility.disableLoadingPhrases',
            settings,
          ),
        ).toBe(false);
      });

      it('should return false when parent exists but child does not', () => {
        const settings = { ui: { accessibility: {} } };
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
        const pendingSettings = {};
        const result = setPendingSettingValue(
          'ui.showMemoryUsage',
          true,
          pendingSettings,
        );

        expect(result.ui?.showMemoryUsage).toBe(true);
      });

      it('should set nested setting value', () => {
        const pendingSettings = {};
        const result = setPendingSettingValue(
          'ui.accessibility.disableLoadingPhrases',
          true,
          pendingSettings,
        );

        expect(result.ui?.accessibility?.disableLoadingPhrases).toBe(true);
      });

      it('should preserve existing nested settings', () => {
        const pendingSettings = {
          ui: { accessibility: { disableLoadingPhrases: false } },
        };
        const result = setPendingSettingValue(
          'ui.accessibility.disableLoadingPhrases',
          true,
          pendingSettings,
        );

        expect(result.ui?.accessibility?.disableLoadingPhrases).toBe(true);
      });

      it('should not mutate original settings', () => {
        const pendingSettings = {};
        setPendingSettingValue('ui.showMemoryUsage', true, pendingSettings);

        expect(pendingSettings).toEqual({});
      });
    });

    describe('hasRestartRequiredSettings', () => {
      it('should return true when modified settings require restart', () => {
        const modifiedSettings = new Set<string>([
          'advanced.autoConfigureMemory',
          'ui.showMemoryUsage',
        ]);
        expect(hasRestartRequiredSettings(modifiedSettings)).toBe(true);
      });

      it('should return false when no modified settings require restart', () => {
        const modifiedSettings = new Set<string>([
          'ui.showMemoryUsage',
          'ui.hideTips',
        ]);
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
          'advanced.autoConfigureMemory',
          'ui.showMemoryUsage',
          'general.checkpointing.enabled',
        ]);
        const result = getRestartRequiredFromModified(modifiedSettings);

        expect(result).toContain('advanced.autoConfigureMemory');
        expect(result).toContain('general.checkpointing.enabled');
        expect(result).not.toContain('ui.showMemoryUsage');
      });

      it('should return empty array when no settings require restart', () => {
        const modifiedSettings = new Set<string>([
          'showMemoryUsage',
          'hideTips',
        ]);
        const result = getRestartRequiredFromModified(modifiedSettings);

        expect(result).toEqual([]);
      });
    });

    describe('getDisplayValue', () => {
      it('should show value without * when setting matches default', () => {
        const settings = { ui: { showMemoryUsage: false } }; // false matches default, so no *
        const mergedSettings = { ui: { showMemoryUsage: false } };
        const modifiedSettings = new Set<string>();

        const result = getDisplayValue(
          'ui.showMemoryUsage',
          settings,
          mergedSettings,
          modifiedSettings,
        );
        expect(result).toBe('false*');
      });

      it('should show default value when setting is not in scope', () => {
        const settings = {}; // no setting in scope
        const mergedSettings = { ui: { showMemoryUsage: false } };
        const modifiedSettings = new Set<string>();

        const result = getDisplayValue(
          'ui.showMemoryUsage',
          settings,
          mergedSettings,
          modifiedSettings,
        );
        expect(result).toBe('false'); // shows default value
      });

      it('should show value with * when changed from default', () => {
        const settings = { ui: { showMemoryUsage: true } }; // true is different from default (false)
        const mergedSettings = { ui: { showMemoryUsage: true } };
        const modifiedSettings = new Set<string>();

        const result = getDisplayValue(
          'ui.showMemoryUsage',
          settings,
          mergedSettings,
          modifiedSettings,
        );
        expect(result).toBe('true*');
      });

      it('should show default value without * when setting does not exist in scope', () => {
        const settings = {}; // setting doesn't exist in scope, show default
        const mergedSettings = { ui: { showMemoryUsage: false } };
        const modifiedSettings = new Set<string>();

        const result = getDisplayValue(
          'ui.showMemoryUsage',
          settings,
          mergedSettings,
          modifiedSettings,
        );
        expect(result).toBe('false'); // default value (false) without *
      });

      it('should show value with * when user changes from default', () => {
        const settings = {}; // setting doesn't exist in scope originally
        const mergedSettings = { ui: { showMemoryUsage: false } };
        const modifiedSettings = new Set<string>(['ui.showMemoryUsage']);
        const pendingSettings = { ui: { showMemoryUsage: true } }; // user changed to true

        const result = getDisplayValue(
          'ui.showMemoryUsage',
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
        const settings = {}; // setting doesn't exist

        const result = isDefaultValue('ui.showMemoryUsage', settings);
        expect(result).toBe(true);
      });

      it('should return false when setting exists in scope', () => {
        const settings = { ui: { showMemoryUsage: true } }; // setting exists

        const result = isDefaultValue('ui.showMemoryUsage', settings);
        expect(result).toBe(false);
      });

      it('should return true when nested setting does not exist in scope', () => {
        const settings = {}; // nested setting doesn't exist

        const result = isDefaultValue(
          'ui.accessibility.disableLoadingPhrases',
          settings,
        );
        expect(result).toBe(true);
      });

      it('should return false when nested setting exists in scope', () => {
        const settings = {
          ui: { accessibility: { disableLoadingPhrases: true } },
        }; // nested setting exists

        const result = isDefaultValue(
          'ui.accessibility.disableLoadingPhrases',
          settings,
        );
        expect(result).toBe(false);
      });
    });

    describe('isValueInherited', () => {
      it('should return false for top-level settings that exist in scope', () => {
        const settings = { ui: { showMemoryUsage: true } };
        const mergedSettings = { ui: { showMemoryUsage: true } };

        const result = isValueInherited(
          'ui.showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(result).toBe(false);
      });

      it('should return true for top-level settings that do not exist in scope', () => {
        const settings = {};
        const mergedSettings = { ui: { showMemoryUsage: true } };

        const result = isValueInherited(
          'ui.showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(result).toBe(true);
      });

      it('should return false for nested settings that exist in scope', () => {
        const settings = {
          ui: { accessibility: { disableLoadingPhrases: true } },
        };
        const mergedSettings = {
          ui: { accessibility: { disableLoadingPhrases: true } },
        };

        const result = isValueInherited(
          'ui.accessibility.disableLoadingPhrases',
          settings,
          mergedSettings,
        );
        expect(result).toBe(false);
      });

      it('should return true for nested settings that do not exist in scope', () => {
        const settings = {};
        const mergedSettings = {
          ui: { accessibility: { disableLoadingPhrases: true } },
        };

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
        const settings = { ui: { showMemoryUsage: true } };
        const mergedSettings = { ui: { showMemoryUsage: false } };

        const result = getEffectiveDisplayValue(
          'ui.showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(result).toBe(true);
      });

      it('should return value from merged settings when not in scope', () => {
        const settings = {};
        const mergedSettings = { ui: { showMemoryUsage: true } };

        const result = getEffectiveDisplayValue(
          'ui.showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(result).toBe(true);
      });

      it('should return default value for undefined values', () => {
        const settings = {};
        const mergedSettings = {};

        const result = getEffectiveDisplayValue(
          'ui.showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(result).toBe(false); // Default value
      });
    });
  });
});
