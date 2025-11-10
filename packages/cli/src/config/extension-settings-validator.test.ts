/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { ExtensionSettingsValidator } from './extension-settings-validator.js';
import type { ExtensionSettings } from './extension-settings.js';

describe('ExtensionSettingsValidator', () => {
  const validator = new ExtensionSettingsValidator();

  describe('allowed settings', () => {
    it('should allow valid general settings', () => {
      const settings: ExtensionSettings = {
        general: {
          vimMode: true,
          preferredEditor: 'code',
          disableAutoUpdate: false,
        },
      };

      const result = validator.validate(settings);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow valid context settings', () => {
      const settings: ExtensionSettings = {
        context: {
          includeDirectories: ['src/', 'lib/'],
          fileName: 'CONTEXT.md',
          fileFiltering: {
            respectGitIgnore: true,
            respectGeminiIgnore: false,
            enableRecursiveFileSearch: true,
            disableFuzzySearch: false,
          },
          loadMemoryFromIncludeDirectories: true,
        },
      };

      const result = validator.validate(settings);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow valid tool settings', () => {
      const settings: ExtensionSettings = {
        tools: {
          exclude: ['dangerous-tool'],
          allowed: ['safe-tool'],
          autoAccept: false, // Only false is allowed
          discoveryCommand: 'custom-discover',
          callCommand: 'custom-call',
          useRipgrep: true,
          enableToolOutputTruncation: true,
          truncateToolOutputThreshold: 1000,
          truncateToolOutputLines: 50,
        },
      };

      const result = validator.validate(settings);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow valid UI settings', () => {
      const settings: ExtensionSettings = {
        ui: {
          customWittyPhrases: ['Testing...', 'Almost there...'],
          hideTips: true,
          hideBanner: false,
          hideContextSummary: true,
          hideFooter: false,
          showLineNumbers: true,
          showCitations: false,
          useFullWidth: true,
        },
      };

      const result = validator.validate(settings);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow valid model settings', () => {
      const settings: ExtensionSettings = {
        model: {
          name: 'gemini-2.5-pro',
          maxSessionTurns: 100,
          skipNextSpeakerCheck: true,
          compressionThreshold: 0.3,
        },
      };

      const result = validator.validate(settings);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow hooks settings', () => {
      const settings: ExtensionSettings = {
        hooks: {
          beforeTool: 'echo "Running tool"',
          afterModel: 'echo "Model finished"',
          customHook: {
            command: 'my-command',
            args: ['arg1', 'arg2'],
          },
        },
      };

      const result = validator.validate(settings);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow mcpServers settings', () => {
      const settings: ExtensionSettings = {
        mcpServers: {
          myServer: {
            command: 'my-mcp-server',
            args: ['--verbose'],
          },
        },
      };

      const result = validator.validate(settings);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow experimental settings', () => {
      const settings: ExtensionSettings = {
        experimental: {
          useModelRouter: true,
          codebaseInvestigatorSettings: {
            enabled: true,
            maxNumTurns: 5,
          },
        },
      };

      const result = validator.validate(settings);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow advanced settings', () => {
      const settings: ExtensionSettings = {
        advanced: {
          excludedEnvVars: ['MY_VAR'],
          autoConfigureMemory: true,
        },
      };

      const result = validator.validate(settings);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow multiple settings categories', () => {
      const settings: ExtensionSettings = {
        context: {
          includeDirectories: ['src/'],
        },
        ui: {
          hideTips: true,
        },
        hooks: {
          beforeTool: 'echo test',
        },
      };

      const result = validator.validate(settings);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('forbidden settings', () => {
    it('should reject security settings', () => {
      const settings = {
        security: {
          auth: {
            enabled: true,
          },
        },
      } as unknown as ExtensionSettings;

      const result = validator.validate(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('security'))).toBe(true);
      expect(result.errors.some((e) => e.includes('forbidden'))).toBe(true);
    });

    it('should reject telemetry settings', () => {
      const settings = {
        telemetry: {
          enabled: false,
        },
      } as unknown as ExtensionSettings;

      const result = validator.validate(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('telemetry'))).toBe(true);
      expect(result.errors.some((e) => e.includes('forbidden'))).toBe(true);
    });

    it('should reject privacy settings', () => {
      const settings = {
        privacy: {
          usageStatisticsEnabled: false,
        },
      } as unknown as ExtensionSettings;

      const result = validator.validate(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('privacy'))).toBe(true);
      expect(result.errors.some((e) => e.includes('forbidden'))).toBe(true);
    });

    it('should reject tools.sandbox settings', () => {
      const settings = {
        tools: {
          sandbox: true,
        },
      } as unknown as ExtensionSettings;

      const result = validator.validate(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('sandbox'))).toBe(true);
    });

    it('should reject mcpServers trust field', () => {
      const settings = {
        mcpServers: {
          myServer: {
            command: 'my-server',
            trust: true,
          },
        },
      } as unknown as ExtensionSettings;

      const result = validator.validate(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('trust'))).toBe(true);
    });
  });

  describe('special rules', () => {
    it('should reject tools.autoAccept when set to true', () => {
      const settings: ExtensionSettings = {
        tools: {
          autoAccept: true,
        },
      };

      const result = validator.validate(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('autoAccept'))).toBe(true);
      expect(result.errors.some((e) => e.includes('true'))).toBe(true);
    });

    it('should allow tools.autoAccept when set to false', () => {
      const settings: ExtensionSettings = {
        tools: {
          autoAccept: false,
        },
      };

      const result = validator.validate(settings);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('unlisted settings', () => {
    it('should reject settings not in allowlist', () => {
      const settings = {
        context: {
          unknownSetting: 'value',
        },
      } as unknown as ExtensionSettings;

      const result = validator.validate(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('unknownSetting'))).toBe(
        true,
      );
      expect(result.errors.some((e) => e.includes('allowlist'))).toBe(true);
    });

    it('should reject unknown top-level keys', () => {
      const settings = {
        unknownCategory: {
          setting: 'value',
        },
      } as unknown as ExtensionSettings;

      const result = validator.validate(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(
        result.errors.some(
          (e) => e.includes('unknownCategory') || e.includes('setting'),
        ),
      ).toBe(true);
      expect(result.errors.some((e) => e.includes('allowlist'))).toBe(true);
    });
  });

  describe('isArrayAppendSetting', () => {
    it('should identify array append settings', () => {
      expect(validator.isArrayAppendSetting('context.includeDirectories')).toBe(
        true,
      );
      expect(validator.isArrayAppendSetting('context.fileName')).toBe(true);
      expect(validator.isArrayAppendSetting('tools.exclude')).toBe(true);
      expect(validator.isArrayAppendSetting('tools.allowed')).toBe(true);
      expect(validator.isArrayAppendSetting('ui.customWittyPhrases')).toBe(
        true,
      );
    });

    it('should return false for non-append settings', () => {
      expect(
        validator.isArrayAppendSetting(
          'context.loadMemoryFromIncludeDirectories',
        ),
      ).toBe(false);
      expect(validator.isArrayAppendSetting('tools.autoAccept')).toBe(false);
      expect(validator.isArrayAppendSetting('ui.hideTips')).toBe(false);
    });
  });

  describe('multiple errors', () => {
    it('should report all validation errors', () => {
      const settings = {
        security: {
          auth: true,
        },
        tools: {
          autoAccept: true,
          sandbox: true,
        },
        unknownKey: 'value',
      } as unknown as ExtensionSettings;

      const result = validator.validate(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });
});
