/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vitest/globals" />

import { describe, it, expect } from 'vitest';
import {
  validateSettings,
  formatValidationError,
  settingsZodSchema,
} from './settings-validation.js';
import { z } from 'zod';

describe('settings-validation', () => {
  describe('validateSettings', () => {
    it('should accept valid settings with correct model.name as string', () => {
      const validSettings = {
        model: {
          name: 'gemini-2.0-flash-exp',
          maxSessionTurns: 10,
        },
        ui: {
          theme: 'dark',
        },
      };

      const result = validateSettings(validSettings);
      expect(result.success).toBe(true);
    });

    it('should reject model.name as object instead of string', () => {
      const invalidSettings = {
        model: {
          name: {
            skipNextSpeakerCheck: true,
          },
        },
      };

      const result = validateSettings(invalidSettings);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      if (result.error) {
        const issues = result.error.issues;
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0]?.path).toEqual(['model', 'name']);
        expect(issues[0]?.code).toBe('invalid_type');
      }
    });

    it('should accept valid model.summarizeToolOutput structure', () => {
      const validSettings = {
        model: {
          summarizeToolOutput: {
            run_shell_command: {
              tokenBudget: 500,
            },
          },
        },
      };

      const result = validateSettings(validSettings);
      expect(result.success).toBe(true);
    });

    it('should reject invalid model.summarizeToolOutput structure', () => {
      const invalidSettings = {
        model: {
          summarizeToolOutput: {
            run_shell_command: {
              tokenBudget: 500,
            },
          },
        },
      };

      // First test with valid structure
      let result = validateSettings(invalidSettings);
      expect(result.success).toBe(true);

      // Now test with wrong type (string instead of object)
      const actuallyInvalidSettings = {
        model: {
          summarizeToolOutput: 'invalid',
        },
      };

      result = validateSettings(actuallyInvalidSettings);
      expect(result.success).toBe(false);
      if (result.error) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });

    it('should accept empty settings object', () => {
      const emptySettings = {};
      const result = validateSettings(emptySettings);
      expect(result.success).toBe(true);
    });

    it('should accept unknown top-level keys (for migration compatibility)', () => {
      const settingsWithUnknownKey = {
        unknownKey: 'some value',
      };

      const result = validateSettings(settingsWithUnknownKey);
      expect(result.success).toBe(true);
      // Unknown keys are allowed via .passthrough() for migration scenarios
    });

    it('should accept nested valid settings', () => {
      const validSettings = {
        ui: {
          theme: 'dark',
          hideWindowTitle: true,
          footer: {
            hideCWD: false,
            hideModelInfo: true,
          },
        },
        tools: {
          sandbox: 'inherit',
          autoAccept: false,
        },
      };

      const result = validateSettings(validSettings);
      expect(result.success).toBe(true);
    });

    it('should validate array types correctly', () => {
      const validSettings = {
        tools: {
          allowed: ['git', 'npm'],
          exclude: ['dangerous-tool'],
        },
        context: {
          includeDirectories: ['/path/1', '/path/2'],
        },
      };

      const result = validateSettings(validSettings);
      expect(result.success).toBe(true);
    });

    it('should reject invalid types in arrays', () => {
      const invalidSettings = {
        tools: {
          allowed: ['git', 123],
        },
      };

      const result = validateSettings(invalidSettings);
      expect(result.success).toBe(false);
    });

    it('should validate boolean fields correctly', () => {
      const validSettings = {
        general: {
          vimMode: true,
          disableAutoUpdate: false,
        },
      };

      const result = validateSettings(validSettings);
      expect(result.success).toBe(true);
    });

    it('should reject non-boolean values for boolean fields', () => {
      const invalidSettings = {
        general: {
          vimMode: 'yes',
        },
      };

      const result = validateSettings(invalidSettings);
      expect(result.success).toBe(false);
    });

    it('should validate number fields correctly', () => {
      const validSettings = {
        model: {
          maxSessionTurns: 50,
          compressionThreshold: 0.2,
        },
      };

      const result = validateSettings(validSettings);
      expect(result.success).toBe(true);
    });

    it('should validate complex nested mcpServers configuration', () => {
      const invalidSettings = {
        mcpServers: {
          'my-server': {
            command: 123, // Should be string
            args: ['arg1'],
            env: {
              VAR: 'value',
            },
          },
        },
      };

      const result = validateSettings(invalidSettings);
      expect(result.success).toBe(false);
      if (result.error) {
        expect(result.error.issues.length).toBeGreaterThan(0);
        // Path should be mcpServers.my-server.command
        const issue = result.error.issues.find((i) =>
          i.path.includes('command'),
        );
        expect(issue).toBeDefined();
        expect(issue?.code).toBe('invalid_type');
      }
    });

    it('should validate mcpServers with type field for all transport types', () => {
      const validSettings = {
        mcpServers: {
          'sse-server': {
            url: 'https://example.com/sse',
            type: 'sse',
            headers: { 'X-API-Key': 'key' },
          },
          'http-server': {
            url: 'https://example.com/mcp',
            type: 'http',
          },
          'stdio-server': {
            command: '/usr/bin/mcp-server',
            type: 'stdio',
          },
        },
      };

      const result = validateSettings(validSettings);
      expect(result.success).toBe(true);
    });

    it('should reject invalid type values in mcpServers', () => {
      const invalidSettings = {
        mcpServers: {
          'bad-server': {
            url: 'https://example.com/mcp',
            type: 'invalid-type',
          },
        },
      };

      const result = validateSettings(invalidSettings);
      expect(result.success).toBe(false);
    });

    it('should validate mcpServers without type field', () => {
      const validSettings = {
        mcpServers: {
          'stdio-server': {
            command: '/usr/bin/mcp-server',
            args: ['--port', '8080'],
          },
          'url-server': {
            url: 'https://example.com/mcp',
          },
        },
      };

      const result = validateSettings(validSettings);
      expect(result.success).toBe(true);
    });

    it('should validate complex nested customThemes configuration', () => {
      const invalidSettings = {
        ui: {
          customThemes: {
            'my-theme': {
              type: 'custom',
              // Missing 'name' property which is required
              text: {
                primary: '#ffffff',
              },
            },
          },
        },
      };

      const result = validateSettings(invalidSettings);
      expect(result.success).toBe(false);
      if (result.error) {
        expect(result.error.issues.length).toBeGreaterThan(0);
        // Should complain about missing 'name'
        const issue = result.error.issues.find(
          (i) => i.code === 'invalid_type' && i.message.includes('Required'),
        );
        expect(issue).toBeDefined();
      }
    });
  });

  describe('formatValidationError', () => {
    it('should format error with file path and helpful message for model.name', () => {
      const invalidSettings = {
        model: {
          name: {
            skipNextSpeakerCheck: true,
          },
        },
      };

      const result = validateSettings(invalidSettings);
      expect(result.success).toBe(false);

      if (result.error) {
        const formatted = formatValidationError(
          result.error,
          '/path/to/settings.json',
        );

        expect(formatted).toContain('/path/to/settings.json');
        expect(formatted).toContain('model.name');
        expect(formatted).toContain('Expected: string, but received: object');
        expect(formatted).toContain('Please fix the configuration.');
        expect(formatted).toContain(
          'https://github.com/google-gemini/gemini-cli',
        );
      }
    });

    it('should format error for model.summarizeToolOutput', () => {
      const invalidSettings = {
        model: {
          summarizeToolOutput: 'wrong type',
        },
      };

      const result = validateSettings(invalidSettings);
      expect(result.success).toBe(false);

      if (result.error) {
        const formatted = formatValidationError(
          result.error,
          '~/.gemini/settings.json',
        );

        expect(formatted).toContain('~/.gemini/settings.json');
        expect(formatted).toContain('model.summarizeToolOutput');
      }
    });

    it('should include link to documentation', () => {
      const invalidSettings = {
        model: {
          name: { invalid: 'object' }, // model.name should be a string
        },
      };

      const result = validateSettings(invalidSettings);
      expect(result.success).toBe(false);

      if (result.error) {
        const formatted = formatValidationError(result.error, 'test.json');

        expect(formatted).toContain(
          'https://github.com/google-gemini/gemini-cli',
        );
        expect(formatted).toContain('configuration.md');
      }
    });

    it('should list all validation errors', () => {
      const invalidSettings = {
        model: {
          name: { invalid: 'object' },
          maxSessionTurns: 'not a number',
        },
      };

      const result = validateSettings(invalidSettings);
      expect(result.success).toBe(false);

      if (result.error) {
        const formatted = formatValidationError(result.error, 'test.json');

        // Should have multiple errors listed
        expect(formatted.match(/Error in:/g)?.length).toBeGreaterThan(1);
      }
    });

    it('should format array paths correctly (e.g. tools.allowed[0])', () => {
      const invalidSettings = {
        tools: {
          allowed: ['git', 123], // 123 is invalid, expected string
        },
      };

      const result = validateSettings(invalidSettings);
      expect(result.success).toBe(false);

      if (result.error) {
        const formatted = formatValidationError(result.error, 'test.json');
        expect(formatted).toContain('tools.allowed[1]');
      }
    });

    it('should limit the number of displayed errors', () => {
      const invalidSettings = {
        tools: {
          // Create 6 invalid items to trigger the limit
          allowed: [1, 2, 3, 4, 5, 6],
        },
      };

      const result = validateSettings(invalidSettings);
      expect(result.success).toBe(false);

      if (result.error) {
        const formatted = formatValidationError(result.error, 'test.json');
        // Should see the first 5
        expect(formatted).toContain('tools.allowed[0]');
        expect(formatted).toContain('tools.allowed[4]');
        // Should NOT see the 6th
        expect(formatted).not.toContain('tools.allowed[5]');
        // Should see the summary
        expect(formatted).toContain('...and 1 more errors.');
      }
    });
  });

  describe('settingsZodSchema', () => {
    it('should be a valid Zod object schema', () => {
      expect(settingsZodSchema).toBeInstanceOf(z.ZodObject);
    });

    it('should have optional fields', () => {
      // All top-level fields should be optional
      const shape = settingsZodSchema.shape;
      expect(shape['model']).toBeDefined();
      expect(shape['ui']).toBeDefined();
      expect(shape['tools']).toBeDefined();

      // Test that empty object is valid (all fields optional)
      const result = settingsZodSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});
