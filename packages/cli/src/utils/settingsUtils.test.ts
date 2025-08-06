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
        expect(categories).toHaveProperty('Accessibility');
        expect(categories).toHaveProperty('Checkpointing');
        expect(categories).toHaveProperty('File Filtering');
        expect(categories).toHaveProperty('UI');
        expect(categories).toHaveProperty('Mode');
        expect(categories).toHaveProperty('Updates');
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
        const definition = getSettingDefinition('showMemoryUsage');
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
        expect(requiresRestart('autoConfigureMaxOldSpaceSize')).toBe(true);
        expect(requiresRestart('checkpointing.enabled')).toBe(true);
      });

      it('should return false for settings that do not require restart', () => {
        expect(requiresRestart('showMemoryUsage')).toBe(false);
        expect(requiresRestart('hideTips')).toBe(false);
      });

      it('should return false for invalid settings', () => {
        expect(requiresRestart('invalidSetting')).toBe(false);
      });
    });

    describe('getDefaultValue', () => {
      it('should return correct default values', () => {
        expect(getDefaultValue('showMemoryUsage')).toBe(false);
        expect(getDefaultValue('fileFiltering.enableRecursiveFileSearch')).toBe(
          true,
        );
      });

      it('should return undefined for invalid settings', () => {
        expect(getDefaultValue('invalidSetting')).toBeUndefined();
      });
    });

    describe('getRestartRequiredSettings', () => {
      it('should return all settings that require restart', () => {
        const restartSettings = getRestartRequiredSettings();
        expect(restartSettings).toContain('autoConfigureMaxOldSpaceSize');
        expect(restartSettings).toContain('checkpointing.enabled');
        expect(restartSettings).not.toContain('showMemoryUsage');
      });
    });

    describe('getEffectiveValue', () => {
      it('should return value from settings when set', () => {
        const settings = { showMemoryUsage: true };
        const mergedSettings = { showMemoryUsage: false };

        const value = getEffectiveValue(
          'showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(value).toBe(true);
      });

      it('should return value from merged settings when not set in current scope', () => {
        const settings = {};
        const mergedSettings = { showMemoryUsage: true };

        const value = getEffectiveValue(
          'showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(value).toBe(true);
      });

      it('should return default value when not set anywhere', () => {
        const settings = {};
        const mergedSettings = {};

        const value = getEffectiveValue(
          'showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(value).toBe(false); // default value
      });

      it('should handle nested settings correctly', () => {
        const settings = {
          accessibility: { disableLoadingPhrases: true },
        };
        const mergedSettings = {
          accessibility: { disableLoadingPhrases: false },
        };

        const value = getEffectiveValue(
          'accessibility.disableLoadingPhrases',
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
        expect(keys).toContain('showMemoryUsage');
        expect(keys).toContain('accessibility.disableLoadingPhrases');
        expect(keys).toContain('checkpointing.enabled');
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
        expect(isValidSettingKey('showMemoryUsage')).toBe(true);
        expect(isValidSettingKey('accessibility.disableLoadingPhrases')).toBe(
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
        expect(getSettingCategory('showMemoryUsage')).toBe('UI');
        expect(getSettingCategory('accessibility.disableLoadingPhrases')).toBe(
          'Accessibility',
        );
      });

      it('should return undefined for invalid settings', () => {
        expect(getSettingCategory('invalidSetting')).toBeUndefined();
      });
    });

    describe('shouldShowInDialog', () => {
      it('should return true for settings marked to show in dialog', () => {
        expect(shouldShowInDialog('showMemoryUsage')).toBe(true);
        expect(shouldShowInDialog('vimMode')).toBe(true);
        expect(shouldShowInDialog('hideWindowTitle')).toBe(true);
        expect(shouldShowInDialog('usageStatisticsEnabled')).toBe(true);
      });

      it('should return false for settings marked to hide from dialog', () => {
        expect(shouldShowInDialog('selectedAuthType')).toBe(false);
        expect(shouldShowInDialog('coreTools')).toBe(false);
        expect(shouldShowInDialog('customThemes')).toBe(false);
        expect(shouldShowInDialog('theme')).toBe(false); // Changed to false
        expect(shouldShowInDialog('preferredEditor')).toBe(false); // Changed to false
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
        expect(uiKeys).toContain('showMemoryUsage');
        expect(uiKeys).toContain('hideWindowTitle');
        expect(uiKeys).not.toContain('customThemes'); // This is marked false
        expect(uiKeys).not.toContain('theme'); // This is now marked false
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

        expect(allKeys).toContain('vimMode');
        expect(allKeys).toContain('ideMode');
        expect(allKeys).toContain('disableAutoUpdate');
        expect(allKeys).toContain('showMemoryUsage');
        expect(allKeys).toContain('usageStatisticsEnabled');
        expect(allKeys).not.toContain('selectedAuthType');
        expect(allKeys).not.toContain('coreTools');
        expect(allKeys).not.toContain('theme'); // Now hidden
        expect(allKeys).not.toContain('preferredEditor'); // Now hidden
      });
    });

    describe('getDialogSettingsByType', () => {
      it('should return only boolean dialog settings', () => {
        const booleanSettings = getDialogSettingsByType('boolean');

        const keys = booleanSettings.map((s) => s.key);
        expect(keys).toContain('showMemoryUsage');
        expect(keys).toContain('vimMode');
        expect(keys).toContain('hideWindowTitle');
        expect(keys).toContain('usageStatisticsEnabled');
        expect(keys).not.toContain('selectedAuthType'); // Advanced setting
        expect(keys).not.toContain('useExternalAuth'); // Advanced setting
      });

      it('should return only string dialog settings', () => {
        const stringSettings = getDialogSettingsByType('string');

        const keys = stringSettings.map((s) => s.key);
        // Note: theme and preferredEditor are now hidden from dialog
        expect(keys).not.toContain('theme'); // Now marked false
        expect(keys).not.toContain('preferredEditor'); // Now marked false
        expect(keys).not.toContain('selectedAuthType'); // Advanced setting

        // Most string settings are now hidden, so let's just check they exclude advanced ones
        expect(keys.every((key) => !key.startsWith('tool'))).toBe(true); // No tool-related settings
      });
    });

    describe('getDialogSettingKeys', () => {
      it('should return only settings marked for dialog display', () => {
        const dialogKeys = getDialogSettingKeys();

        // Should include settings marked for dialog
        expect(dialogKeys).toContain('showMemoryUsage');
        expect(dialogKeys).toContain('vimMode');
        expect(dialogKeys).toContain('hideWindowTitle');
        expect(dialogKeys).toContain('usageStatisticsEnabled');
        expect(dialogKeys).toContain('ideMode');
        expect(dialogKeys).toContain('disableAutoUpdate');

        // Should include nested settings marked for dialog
        expect(dialogKeys).toContain('fileFiltering.respectGitIgnore');
        expect(dialogKeys).toContain('fileFiltering.respectGeminiIgnore');
        expect(dialogKeys).toContain('fileFiltering.enableRecursiveFileSearch');

        // Should NOT include settings marked as hidden
        expect(dialogKeys).not.toContain('theme'); // Hidden
        expect(dialogKeys).not.toContain('customThemes'); // Hidden
        expect(dialogKeys).not.toContain('preferredEditor'); // Hidden
        expect(dialogKeys).not.toContain('selectedAuthType'); // Advanced
        expect(dialogKeys).not.toContain('coreTools'); // Advanced
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
        const key = 'fileFiltering.respectGitIgnore';
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
        expect(displayValue).toBe('true*'); // Should show true with * indicating change

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
        const settings = { showMemoryUsage: true };
        const mergedSettings = { showMemoryUsage: false };

        const value = getSettingValue(
          'showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(value).toBe(true);
      });

      it('should return value from merged settings when not set in current scope', () => {
        const settings = {};
        const mergedSettings = { showMemoryUsage: true };

        const value = getSettingValue(
          'showMemoryUsage',
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
        expect(isSettingModified('showMemoryUsage', true)).toBe(true);
        expect(
          isSettingModified('fileFiltering.enableRecursiveFileSearch', false),
        ).toBe(true);
      });

      it('should return false when value matches default', () => {
        expect(isSettingModified('showMemoryUsage', false)).toBe(false);
        expect(
          isSettingModified('fileFiltering.enableRecursiveFileSearch', true),
        ).toBe(false);
      });
    });

    describe('settingExistsInScope', () => {
      it('should return true for top-level settings that exist', () => {
        const settings = { showMemoryUsage: true };
        expect(settingExistsInScope('showMemoryUsage', settings)).toBe(true);
      });

      it('should return false for top-level settings that do not exist', () => {
        const settings = {};
        expect(settingExistsInScope('showMemoryUsage', settings)).toBe(false);
      });

      it('should return true for nested settings that exist', () => {
        const settings = {
          accessibility: { disableLoadingPhrases: true },
        };
        expect(
          settingExistsInScope('accessibility.disableLoadingPhrases', settings),
        ).toBe(true);
      });

      it('should return false for nested settings that do not exist', () => {
        const settings = {};
        expect(
          settingExistsInScope('accessibility.disableLoadingPhrases', settings),
        ).toBe(false);
      });

      it('should return false when parent exists but child does not', () => {
        const settings = { accessibility: {} };
        expect(
          settingExistsInScope('accessibility.disableLoadingPhrases', settings),
        ).toBe(false);
      });
    });

    describe('setPendingSettingValue', () => {
      it('should set top-level setting value', () => {
        const pendingSettings = {};
        const result = setPendingSettingValue(
          'showMemoryUsage',
          true,
          pendingSettings,
        );

        expect(result.showMemoryUsage).toBe(true);
      });

      it('should set nested setting value', () => {
        const pendingSettings = {};
        const result = setPendingSettingValue(
          'accessibility.disableLoadingPhrases',
          true,
          pendingSettings,
        );

        expect(result.accessibility?.disableLoadingPhrases).toBe(true);
      });

      it('should preserve existing nested settings', () => {
        const pendingSettings = {
          accessibility: { disableLoadingPhrases: false },
        };
        const result = setPendingSettingValue(
          'accessibility.disableLoadingPhrases',
          true,
          pendingSettings,
        );

        expect(result.accessibility?.disableLoadingPhrases).toBe(true);
      });

      it('should not mutate original settings', () => {
        const pendingSettings = {};
        setPendingSettingValue('showMemoryUsage', true, pendingSettings);

        expect(pendingSettings).toEqual({});
      });
    });

    describe('hasRestartRequiredSettings', () => {
      it('should return true when modified settings require restart', () => {
        const modifiedSettings = new Set<string>([
          'autoConfigureMaxOldSpaceSize',
          'showMemoryUsage',
        ]);
        expect(hasRestartRequiredSettings(modifiedSettings)).toBe(true);
      });

      it('should return false when no modified settings require restart', () => {
        const modifiedSettings = new Set<string>([
          'showMemoryUsage',
          'hideTips',
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
          'autoConfigureMaxOldSpaceSize',
          'showMemoryUsage',
          'checkpointing.enabled',
        ]);
        const result = getRestartRequiredFromModified(modifiedSettings);

        expect(result).toContain('autoConfigureMaxOldSpaceSize');
        expect(result).toContain('checkpointing.enabled');
        expect(result).not.toContain('showMemoryUsage');
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
        const settings = { showMemoryUsage: false }; // false matches default, so no *
        const mergedSettings = { showMemoryUsage: false };
        const modifiedSettings = new Set<string>();

        const result = getDisplayValue(
          'showMemoryUsage',
          settings,
          mergedSettings,
          modifiedSettings,
        );
        expect(result).toBe('false'); // matches default, no *
      });

      it('should show default value when setting is not in scope', () => {
        const settings = {}; // no setting in scope
        const mergedSettings = { showMemoryUsage: false };
        const modifiedSettings = new Set<string>();

        const result = getDisplayValue(
          'showMemoryUsage',
          settings,
          mergedSettings,
          modifiedSettings,
        );
        expect(result).toBe('false'); // shows default value
      });

      it('should show value with * when changed from default', () => {
        const settings = { showMemoryUsage: true }; // true is different from default (false)
        const mergedSettings = { showMemoryUsage: true };
        const modifiedSettings = new Set<string>();

        const result = getDisplayValue(
          'showMemoryUsage',
          settings,
          mergedSettings,
          modifiedSettings,
        );
        expect(result).toBe('true*');
      });

      it('should show default value without * when setting does not exist in scope', () => {
        const settings = {}; // setting doesn't exist in scope, show default
        const mergedSettings = { showMemoryUsage: false };
        const modifiedSettings = new Set<string>();

        const result = getDisplayValue(
          'showMemoryUsage',
          settings,
          mergedSettings,
          modifiedSettings,
        );
        expect(result).toBe('false'); // default value (false) without *
      });

      it('should show value with * when user changes from default', () => {
        const settings = {}; // setting doesn't exist in scope originally
        const mergedSettings = { showMemoryUsage: false };
        const modifiedSettings = new Set<string>(['showMemoryUsage']);
        const pendingSettings = { showMemoryUsage: true }; // user changed to true

        const result = getDisplayValue(
          'showMemoryUsage',
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

        const result = isDefaultValue('showMemoryUsage', settings);
        expect(result).toBe(true);
      });

      it('should return false when setting exists in scope', () => {
        const settings = { showMemoryUsage: true }; // setting exists

        const result = isDefaultValue('showMemoryUsage', settings);
        expect(result).toBe(false);
      });

      it('should return true when nested setting does not exist in scope', () => {
        const settings = {}; // nested setting doesn't exist

        const result = isDefaultValue(
          'accessibility.disableLoadingPhrases',
          settings,
        );
        expect(result).toBe(true);
      });

      it('should return false when nested setting exists in scope', () => {
        const settings = { accessibility: { disableLoadingPhrases: true } }; // nested setting exists

        const result = isDefaultValue(
          'accessibility.disableLoadingPhrases',
          settings,
        );
        expect(result).toBe(false);
      });
    });

    describe('isValueInherited', () => {
      it('should return false for top-level settings that exist in scope', () => {
        const settings = { showMemoryUsage: true };
        const mergedSettings = { showMemoryUsage: true };

        const result = isValueInherited(
          'showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(result).toBe(false);
      });

      it('should return true for top-level settings that do not exist in scope', () => {
        const settings = {};
        const mergedSettings = { showMemoryUsage: true };

        const result = isValueInherited(
          'showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(result).toBe(true);
      });

      it('should return false for nested settings that exist in scope', () => {
        const settings = {
          accessibility: { disableLoadingPhrases: true },
        };
        const mergedSettings = {
          accessibility: { disableLoadingPhrases: true },
        };

        const result = isValueInherited(
          'accessibility.disableLoadingPhrases',
          settings,
          mergedSettings,
        );
        expect(result).toBe(false);
      });

      it('should return true for nested settings that do not exist in scope', () => {
        const settings = {};
        const mergedSettings = {
          accessibility: { disableLoadingPhrases: true },
        };

        const result = isValueInherited(
          'accessibility.disableLoadingPhrases',
          settings,
          mergedSettings,
        );
        expect(result).toBe(true);
      });
    });

    describe('getEffectiveDisplayValue', () => {
      it('should return value from settings when available', () => {
        const settings = { showMemoryUsage: true };
        const mergedSettings = { showMemoryUsage: false };

        const result = getEffectiveDisplayValue(
          'showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(result).toBe(true);
      });

      it('should return value from merged settings when not in scope', () => {
        const settings = {};
        const mergedSettings = { showMemoryUsage: true };

        const result = getEffectiveDisplayValue(
          'showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(result).toBe(true);
      });

      it('should return default value for undefined values', () => {
        const settings = {};
        const mergedSettings = {};

        const result = getEffectiveDisplayValue(
          'showMemoryUsage',
          settings,
          mergedSettings,
        );
        expect(result).toBe(false); // Default value
      });
    });
  });
});
