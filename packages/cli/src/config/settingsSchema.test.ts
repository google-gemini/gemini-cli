/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { SETTINGS_SCHEMA, Settings } from './settingsSchema.js';

describe('SettingsSchema', () => {
  describe('SETTINGS_SCHEMA', () => {
    it('should contain all expected top-level settings', () => {
      const expectedSettings = [
        'theme',
        'customThemes',
        'showMemoryUsage',
        'usageStatisticsEnabled',
        'autoConfigureMaxOldSpaceSize',
        'preferredEditor',
        'maxSessionTurns',
        'memoryImportFormat',
        'memoryDiscoveryMaxDirs',
        'contextFileName',
        'vimMode',
        'ideMode',
        'accessibility',
        'checkpointing',
        'fileFiltering',
        'disableAutoUpdate',
        'hideWindowTitle',
        'hideTips',
        'hideBanner',
        'selectedAuthType',
        'useExternalAuth',
        'sandbox',
        'coreTools',
        'excludeTools',
        'toolDiscoveryCommand',
        'toolCallCommand',
        'mcpServerCommand',
        'mcpServers',
        'allowMCPServers',
        'excludeMCPServers',
        'telemetry',
        'bugCommand',
        'summarizeToolOutput',
        'dnsResolutionOrder',
        'excludedProjectEnvVars',
        'disableUpdateNag',
        'includeDirectories',
        'loadMemoryFromIncludeDirectories',
        'model',
        'hasSeenIdeIntegrationNudge',
        'folderTrustFeature',
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
        'accessibility',
        'checkpointing',
        'fileFiltering',
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
        SETTINGS_SCHEMA.accessibility.properties?.disableLoadingPhrases,
      ).toBeDefined();
      expect(
        SETTINGS_SCHEMA.accessibility.properties?.disableLoadingPhrases.type,
      ).toBe('boolean');
    });

    it('should have checkpointing nested properties', () => {
      expect(SETTINGS_SCHEMA.checkpointing.properties?.enabled).toBeDefined();
      expect(SETTINGS_SCHEMA.checkpointing.properties?.enabled.type).toBe(
        'boolean',
      );
    });

    it('should have fileFiltering nested properties', () => {
      expect(
        SETTINGS_SCHEMA.fileFiltering.properties?.respectGitIgnore,
      ).toBeDefined();
      expect(
        SETTINGS_SCHEMA.fileFiltering.properties?.respectGeminiIgnore,
      ).toBeDefined();
      expect(
        SETTINGS_SCHEMA.fileFiltering.properties?.enableRecursiveFileSearch,
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
      expect(categories).toContain('Mode');
      expect(categories).toContain('Updates');
      expect(categories).toContain('Accessibility');
      expect(categories).toContain('Checkpointing');
      expect(categories).toContain('File Filtering');
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
      expect(SETTINGS_SCHEMA.showMemoryUsage.showInDialog).toBe(true);
      expect(SETTINGS_SCHEMA.vimMode.showInDialog).toBe(true);
      expect(SETTINGS_SCHEMA.ideMode.showInDialog).toBe(true);
      expect(SETTINGS_SCHEMA.disableAutoUpdate.showInDialog).toBe(true);
      expect(SETTINGS_SCHEMA.hideWindowTitle.showInDialog).toBe(true);
      expect(SETTINGS_SCHEMA.hideTips.showInDialog).toBe(true);
      expect(SETTINGS_SCHEMA.hideBanner.showInDialog).toBe(true);
      expect(SETTINGS_SCHEMA.usageStatisticsEnabled.showInDialog).toBe(false);

      // Check that advanced settings are hidden from dialog
      expect(SETTINGS_SCHEMA.selectedAuthType.showInDialog).toBe(false);
      expect(SETTINGS_SCHEMA.coreTools.showInDialog).toBe(false);
      expect(SETTINGS_SCHEMA.mcpServers.showInDialog).toBe(false);
      expect(SETTINGS_SCHEMA.telemetry.showInDialog).toBe(false);

      // Check that some settings are appropriately hidden
      expect(SETTINGS_SCHEMA.theme.showInDialog).toBe(false); // Changed to false
      expect(SETTINGS_SCHEMA.customThemes.showInDialog).toBe(false); // Managed via theme editor
      expect(SETTINGS_SCHEMA.checkpointing.showInDialog).toBe(false); // Experimental feature
      expect(SETTINGS_SCHEMA.accessibility.showInDialog).toBe(false); // Changed to false
      expect(SETTINGS_SCHEMA.fileFiltering.showInDialog).toBe(false); // Changed to false
      expect(SETTINGS_SCHEMA.preferredEditor.showInDialog).toBe(false); // Changed to false
      expect(SETTINGS_SCHEMA.autoConfigureMaxOldSpaceSize.showInDialog).toBe(
        true,
      );
    });

    it('should infer Settings type correctly', () => {
      // This test ensures that the Settings type is properly inferred from the schema
      const settings: Settings = {
        theme: 'dark',
        includeDirectories: ['/path/to/dir'],
        loadMemoryFromIncludeDirectories: true,
      };

      // TypeScript should not complain about these properties
      expect(settings.theme).toBe('dark');
      expect(settings.includeDirectories).toEqual(['/path/to/dir']);
      expect(settings.loadMemoryFromIncludeDirectories).toBe(true);
    });

    it('should have includeDirectories setting in schema', () => {
      expect(SETTINGS_SCHEMA.includeDirectories).toBeDefined();
      expect(SETTINGS_SCHEMA.includeDirectories.type).toBe('array');
      expect(SETTINGS_SCHEMA.includeDirectories.category).toBe('General');
      expect(SETTINGS_SCHEMA.includeDirectories.default).toEqual([]);
    });

    it('should have loadMemoryFromIncludeDirectories setting in schema', () => {
      expect(SETTINGS_SCHEMA.loadMemoryFromIncludeDirectories).toBeDefined();
      expect(SETTINGS_SCHEMA.loadMemoryFromIncludeDirectories.type).toBe(
        'boolean',
      );
      expect(SETTINGS_SCHEMA.loadMemoryFromIncludeDirectories.category).toBe(
        'General',
      );
      expect(SETTINGS_SCHEMA.loadMemoryFromIncludeDirectories.default).toBe(
        false,
      );
    });

    it('should have folderTrustFeature setting in schema', () => {
      expect(SETTINGS_SCHEMA.folderTrustFeature).toBeDefined();
      expect(SETTINGS_SCHEMA.folderTrustFeature.type).toBe('boolean');
      expect(SETTINGS_SCHEMA.folderTrustFeature.category).toBe('General');
      expect(SETTINGS_SCHEMA.folderTrustFeature.default).toBe(false);
      expect(SETTINGS_SCHEMA.folderTrustFeature.showInDialog).toBe(true);
    });
  });
});
