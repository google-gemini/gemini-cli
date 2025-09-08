/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  getSettingsSchema,
  type SettingDefinition,
  type Settings,
  type SettingsSchema,
} from './settingsSchema.js';

describe('SettingsSchema', () => {
  describe('getSettingsSchema', () => {
    it('should contain all expected top-level settings', () => {
      const expectedSettings: Array<keyof Settings> = [
        'mcpServers',
        'general',
        'ui',
        'ide',
        'privacy',
        'telemetry',
        'model',
        'context',
        'tools',
        'mcp',
        'security',
        'advanced',
      ];

      expectedSettings.forEach((setting) => {
        expect(getSettingsSchema()[setting as keyof Settings]).toBeDefined();
      });
    });

    it('should have correct structure for each setting', () => {
      Object.entries(getSettingsSchema()).forEach(([_key, definition]) => {
        expect(definition).toHaveProperty('type');
        expect(definition).toHaveProperty('label');
        expect(definition).toHaveProperty('category');
        expect(definition).toHaveProperty('requiresRestart');
        expect(definition).toHaveProperty('default');
        expect(typeof definition.type).toBe('string');
        expect(typeof definition.label).toBe('string');
        expect(typeof definition.category).toBe('string');
        expect(typeof definition.requiresRestart).toBe('boolean');
      });
    });

    it('should have correct nested setting structure', () => {
      const nestedSettings: Array<keyof Settings> = [
        'general',
        'ui',
        'ide',
        'privacy',
        'model',
        'context',
        'tools',
        'mcp',
        'security',
        'advanced',
      ];

      nestedSettings.forEach((setting) => {
        const definition = getSettingsSchema()[
          setting as keyof Settings
        ] as SettingDefinition;
        expect(definition.type).toBe('object');
        expect(definition.properties).toBeDefined();
        expect(typeof definition.properties).toBe('object');
      });
    });

    it('should have accessibility nested properties', () => {
      expect(
        getSettingsSchema().ui?.properties?.accessibility?.properties,
      ).toBeDefined();
      expect(
        getSettingsSchema().ui?.properties?.accessibility.properties
          ?.disableLoadingPhrases.type,
      ).toBe('boolean');
    });

    it('should have checkpointing nested properties', () => {
      expect(
        getSettingsSchema().general?.properties?.checkpointing.properties
          ?.enabled,
      ).toBeDefined();
      expect(
        getSettingsSchema().general?.properties?.checkpointing.properties
          ?.enabled.type,
      ).toBe('boolean');
    });

    it('should have fileFiltering nested properties', () => {
      expect(
        getSettingsSchema().context.properties.fileFiltering.properties
          ?.respectGitIgnore,
      ).toBeDefined();
      expect(
        getSettingsSchema().context.properties.fileFiltering.properties
          ?.respectGeminiIgnore,
      ).toBeDefined();
      expect(
        getSettingsSchema().context.properties.fileFiltering.properties
          ?.enableRecursiveFileSearch,
      ).toBeDefined();
    });

    it('should have unique categories', () => {
      const categories = new Set();

      // Collect categories from top-level settings
      Object.values(getSettingsSchema()).forEach((definition) => {
        categories.add(definition.category);
        // Also collect from nested properties
        const defWithProps = definition as typeof definition & {
          properties?: Record<string, unknown>;
        };
        if (defWithProps.properties) {
          Object.values(defWithProps.properties).forEach(
            (nestedDef: unknown) => {
              const nestedDefTyped = nestedDef as { category?: string };
              if (nestedDefTyped.category) {
                categories.add(nestedDefTyped.category);
              }
            },
          );
        }
      });

      expect(categories.size).toBeGreaterThan(0);
      expect(categories).toContain('General');
      expect(categories).toContain('UI');
      expect(categories).toContain('Advanced');
    });

    it('should have consistent default values for boolean settings', () => {
      const checkBooleanDefaults = (schema: SettingsSchema) => {
        Object.entries(schema).forEach(([, definition]) => {
          const def = definition as SettingDefinition;
          if (def.type === 'boolean') {
            // Boolean settings can have boolean or undefined defaults (for optional settings)
            expect(['boolean', 'undefined']).toContain(typeof def.default);
          }
          if (def.properties) {
            checkBooleanDefaults(def.properties);
          }
        });
      };

      checkBooleanDefaults(getSettingsSchema() as SettingsSchema);
    });

    it('should have showInDialog property configured', () => {
      // Check that user-facing settings are marked for dialog display
      expect(
        getSettingsSchema().ui.properties.showMemoryUsage.showInDialog,
      ).toBe(true);
      expect(getSettingsSchema().general.properties.vimMode.showInDialog).toBe(
        true,
      );
      expect(getSettingsSchema().ide.properties.enabled.showInDialog).toBe(
        true,
      );
      expect(
        getSettingsSchema().general.properties.disableAutoUpdate.showInDialog,
      ).toBe(true);
      expect(
        getSettingsSchema().ui.properties.hideWindowTitle.showInDialog,
      ).toBe(true);
      expect(getSettingsSchema().ui.properties.hideTips.showInDialog).toBe(
        true,
      );
      expect(getSettingsSchema().ui.properties.hideBanner.showInDialog).toBe(
        true,
      );
      expect(
        getSettingsSchema().privacy.properties.usageStatisticsEnabled
          .showInDialog,
      ).toBe(false);

      // Check that advanced settings are hidden from dialog
      expect(getSettingsSchema().security.properties.auth.showInDialog).toBe(
        false,
      );
      expect(getSettingsSchema().tools.properties.core.showInDialog).toBe(
        false,
      );
      expect(getSettingsSchema().mcpServers.showInDialog).toBe(false);
      expect(getSettingsSchema().telemetry.showInDialog).toBe(false);

      // Check that some settings are appropriately hidden
      expect(getSettingsSchema().ui.properties.theme.showInDialog).toBe(false); // Changed to false
      expect(getSettingsSchema().ui.properties.customThemes.showInDialog).toBe(
        false,
      ); // Managed via theme editor
      expect(
        getSettingsSchema().general.properties.checkpointing.showInDialog,
      ).toBe(false); // Experimental feature
      expect(getSettingsSchema().ui.properties.accessibility.showInDialog).toBe(
        false,
      ); // Changed to false
      expect(
        getSettingsSchema().context.properties.fileFiltering.showInDialog,
      ).toBe(false); // Changed to false
      expect(
        getSettingsSchema().general.properties.preferredEditor.showInDialog,
      ).toBe(false); // Changed to false
      expect(
        getSettingsSchema().advanced.properties.autoConfigureMemory
          .showInDialog,
      ).toBe(false);
    });

    it('should infer Settings type correctly', () => {
      // This test ensures that the Settings type is properly inferred from the schema
      const settings: Settings = {
        ui: {
          theme: 'dark',
        },
        context: {
          includeDirectories: ['/path/to/dir'],
          loadMemoryFromIncludeDirectories: true,
        },
      };

      // TypeScript should not complain about these properties
      expect(settings.ui?.theme).toBe('dark');
      expect(settings.context?.includeDirectories).toEqual(['/path/to/dir']);
      expect(settings.context?.loadMemoryFromIncludeDirectories).toBe(true);
    });

    it('should have includeDirectories setting in schema', () => {
      expect(
        getSettingsSchema().context?.properties.includeDirectories,
      ).toBeDefined();
      expect(
        getSettingsSchema().context?.properties.includeDirectories.type,
      ).toBe('array');
      expect(
        getSettingsSchema().context?.properties.includeDirectories.category,
      ).toBe('Context');
      expect(
        getSettingsSchema().context?.properties.includeDirectories.default,
      ).toEqual([]);
    });

    it('should have loadMemoryFromIncludeDirectories setting in schema', () => {
      expect(
        getSettingsSchema().context?.properties
          .loadMemoryFromIncludeDirectories,
      ).toBeDefined();
      expect(
        getSettingsSchema().context?.properties.loadMemoryFromIncludeDirectories
          .type,
      ).toBe('boolean');
      expect(
        getSettingsSchema().context?.properties.loadMemoryFromIncludeDirectories
          .category,
      ).toBe('Context');
      expect(
        getSettingsSchema().context?.properties.loadMemoryFromIncludeDirectories
          .default,
      ).toBe(false);
    });

    it('should have folderTrustFeature setting in schema', () => {
      expect(
        getSettingsSchema().security.properties.folderTrust.properties.enabled,
      ).toBeDefined();
      expect(
        getSettingsSchema().security.properties.folderTrust.properties.enabled
          .type,
      ).toBe('boolean');
      expect(
        getSettingsSchema().security.properties.folderTrust.properties.enabled
          .category,
      ).toBe('Security');
      expect(
        getSettingsSchema().security.properties.folderTrust.properties.enabled
          .default,
      ).toBe(false);
      expect(
        getSettingsSchema().security.properties.folderTrust.properties.enabled
          .showInDialog,
      ).toBe(true);
    });

    it('should have debugKeystrokeLogging setting in schema', () => {
      expect(
        getSettingsSchema().general.properties.debugKeystrokeLogging,
      ).toBeDefined();
      expect(
        getSettingsSchema().general.properties.debugKeystrokeLogging.type,
      ).toBe('boolean');
      expect(
        getSettingsSchema().general.properties.debugKeystrokeLogging.category,
      ).toBe('General');
      expect(
        getSettingsSchema().general.properties.debugKeystrokeLogging.default,
      ).toBe(false);
      expect(
        getSettingsSchema().general.properties.debugKeystrokeLogging
          .requiresRestart,
      ).toBe(false);
      expect(
        getSettingsSchema().general.properties.debugKeystrokeLogging
          .showInDialog,
      ).toBe(true);
      expect(
        getSettingsSchema().general.properties.debugKeystrokeLogging
          .description,
      ).toBe('Enable debug logging of keystrokes to the console.');
    });
  });
});
