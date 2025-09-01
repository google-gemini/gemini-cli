/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { Settings } from './settingsSchema.js';
import { SETTINGS_SCHEMA } from './settingsSchema.js';

describe('SettingsSchema', () => {
  describe('SETTINGS_SCHEMA', () => {
    it('should contain all expected top-level settings', () => {
      const expectedSettings = [
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
        expect(
          SETTINGS_SCHEMA[setting as keyof typeof SETTINGS_SCHEMA],
        ).toBeDefined();
      });
    });

    it('should have correct structure for each setting', () => {
      Object.entries(SETTINGS_SCHEMA).forEach(([_key, definition]) => {
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
      const nestedSettings = [
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
        const definition = SETTINGS_SCHEMA[
          setting as keyof typeof SETTINGS_SCHEMA
        ] as (typeof SETTINGS_SCHEMA)[keyof typeof SETTINGS_SCHEMA] & {
          properties: unknown;
        };
        expect(definition.type).toBe('object');
        expect(definition.properties).toBeDefined();
        expect(typeof definition.properties).toBe('object');
      });
    });

    it('should have accessibility nested properties', () => {
      expect(
        SETTINGS_SCHEMA.ui?.properties?.accessibility?.properties,
      ).toBeDefined();
      expect(
        SETTINGS_SCHEMA.ui?.properties?.accessibility.properties
          ?.disableLoadingPhrases.type,
      ).toBe('boolean');
    });

    it('should have checkpointing nested properties', () => {
      expect(
        SETTINGS_SCHEMA.general?.properties?.checkpointing.properties?.enabled,
      ).toBeDefined();
      expect(
        SETTINGS_SCHEMA.general?.properties?.checkpointing.properties?.enabled
          .type,
      ).toBe('boolean');
    });

    it('should have fileFiltering nested properties', () => {
      expect(
        SETTINGS_SCHEMA.context.properties.fileFiltering.properties
          ?.respectGitIgnore,
      ).toBeDefined();
      expect(
        SETTINGS_SCHEMA.context.properties.fileFiltering.properties
          ?.respectGeminiIgnore,
      ).toBeDefined();
      expect(
        SETTINGS_SCHEMA.context.properties.fileFiltering.properties
          ?.enableRecursiveFileSearch,
      ).toBeDefined();
    });

    it('should have unique categories', () => {
      const categories = new Set();

      // Collect categories from top-level settings
      Object.values(SETTINGS_SCHEMA).forEach((definition) => {
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
      const checkBooleanDefaults = (schema: Record<string, unknown>) => {
        Object.entries(schema).forEach(
          ([_key, definition]: [string, unknown]) => {
            const def = definition as {
              type?: string;
              default?: unknown;
              properties?: Record<string, unknown>;
            };
            if (def.type === 'boolean') {
              // Boolean settings can have boolean or undefined defaults (for optional settings)
              expect(['boolean', 'undefined']).toContain(typeof def.default);
            }
            if (def.properties) {
              checkBooleanDefaults(def.properties);
            }
          },
        );
      };

      checkBooleanDefaults(SETTINGS_SCHEMA as Record<string, unknown>);
    });

    it('should have showInDialog property configured', () => {
      // Check that user-facing settings are marked for dialog display
      expect(SETTINGS_SCHEMA.ui.properties.showMemoryUsage.showInDialog).toBe(
        true,
      );
      expect(SETTINGS_SCHEMA.general.properties.vimMode.showInDialog).toBe(
        true,
      );
      expect(SETTINGS_SCHEMA.ide.properties.enabled.showInDialog).toBe(true);
      expect(
        SETTINGS_SCHEMA.general.properties.disableAutoUpdate.showInDialog,
      ).toBe(true);
      expect(SETTINGS_SCHEMA.ui.properties.hideWindowTitle.showInDialog).toBe(
        true,
      );
      expect(SETTINGS_SCHEMA.ui.properties.hideTips.showInDialog).toBe(true);
      expect(SETTINGS_SCHEMA.ui.properties.hideBanner.showInDialog).toBe(true);
      expect(
        SETTINGS_SCHEMA.privacy.properties.usageStatisticsEnabled.showInDialog,
      ).toBe(false);

      // Check that advanced settings are hidden from dialog
      expect(SETTINGS_SCHEMA.security.properties.auth.showInDialog).toBe(false);
      expect(SETTINGS_SCHEMA.tools.properties.core.showInDialog).toBe(false);
      expect(SETTINGS_SCHEMA.mcpServers.showInDialog).toBe(false);
      expect(SETTINGS_SCHEMA.telemetry.showInDialog).toBe(false);

      // Check that some settings are appropriately hidden
      expect(SETTINGS_SCHEMA.ui.properties.theme.showInDialog).toBe(false); // Changed to false
      expect(SETTINGS_SCHEMA.ui.properties.customThemes.showInDialog).toBe(
        false,
      ); // Managed via theme editor
      expect(
        SETTINGS_SCHEMA.general.properties.checkpointing.showInDialog,
      ).toBe(false); // Experimental feature
      expect(SETTINGS_SCHEMA.ui.properties.accessibility.showInDialog).toBe(
        false,
      ); // Changed to false
      expect(
        SETTINGS_SCHEMA.context.properties.fileFiltering.showInDialog,
      ).toBe(false); // Changed to false
      expect(
        SETTINGS_SCHEMA.general.properties.preferredEditor.showInDialog,
      ).toBe(false); // Changed to false
      expect(
        SETTINGS_SCHEMA.advanced.properties.autoConfigureMemory.showInDialog,
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
        SETTINGS_SCHEMA.context?.properties.includeDirectories,
      ).toBeDefined();
      expect(SETTINGS_SCHEMA.context?.properties.includeDirectories.type).toBe(
        'array',
      );
      expect(
        SETTINGS_SCHEMA.context?.properties.includeDirectories.category,
      ).toBe('Context');
      expect(
        SETTINGS_SCHEMA.context?.properties.includeDirectories.default,
      ).toEqual([]);
    });

    it('should have loadMemoryFromIncludeDirectories setting in schema', () => {
      expect(
        SETTINGS_SCHEMA.context?.properties.loadMemoryFromIncludeDirectories,
      ).toBeDefined();
      expect(
        SETTINGS_SCHEMA.context?.properties.loadMemoryFromIncludeDirectories
          .type,
      ).toBe('boolean');
      expect(
        SETTINGS_SCHEMA.context?.properties.loadMemoryFromIncludeDirectories
          .category,
      ).toBe('Context');
      expect(
        SETTINGS_SCHEMA.context?.properties.loadMemoryFromIncludeDirectories
          .default,
      ).toBe(false);
    });

    it('should have folderTrustFeature setting in schema', () => {
      expect(
        SETTINGS_SCHEMA.security.properties.folderTrust.properties.enabled,
      ).toBeDefined();
      expect(
        SETTINGS_SCHEMA.security.properties.folderTrust.properties.enabled.type,
      ).toBe('boolean');
      expect(
        SETTINGS_SCHEMA.security.properties.folderTrust.properties.enabled
          .category,
      ).toBe('Security');
      expect(
        SETTINGS_SCHEMA.security.properties.folderTrust.properties.enabled
          .default,
      ).toBe(false);
      expect(
        SETTINGS_SCHEMA.security.properties.folderTrust.properties.enabled
          .showInDialog,
      ).toBe(true);
    });

    it('should have debugKeystrokeLogging setting in schema', () => {
      expect(
        SETTINGS_SCHEMA.general.properties.debugKeystrokeLogging,
      ).toBeDefined();
      expect(
        SETTINGS_SCHEMA.general.properties.debugKeystrokeLogging.type,
      ).toBe('boolean');
      expect(
        SETTINGS_SCHEMA.general.properties.debugKeystrokeLogging.category,
      ).toBe('General');
      expect(
        SETTINGS_SCHEMA.general.properties.debugKeystrokeLogging.default,
      ).toBe(false);
      expect(
        SETTINGS_SCHEMA.general.properties.debugKeystrokeLogging
          .requiresRestart,
      ).toBe(false);
      expect(
        SETTINGS_SCHEMA.general.properties.debugKeystrokeLogging.showInDialog,
      ).toBe(true);
      expect(
        SETTINGS_SCHEMA.general.properties.debugKeystrokeLogging.description,
      ).toBe('Enable debug logging of keystrokes to the console.');
    });
  });
});
