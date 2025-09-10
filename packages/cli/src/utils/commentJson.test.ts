/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  updateSettingsFilePreservingFormat,
  trackEnvVarMappings,
} from './commentJson.js';

describe('commentJson', () => {
  let tempDir: string;
  let testFilePath: string;

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preserve-format-test-'));
    testFilePath = path.join(tempDir, 'settings.json');
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('updateSettingsFilePreservingFormat', () => {
    it('should preserve comments when updating settings', () => {
      const originalContent = `{
        // Model configuration
        "model": "gemini-2.5-pro",
        "ui": {
          // Theme setting
          "theme": "dark"
        }
      }`;

      fs.writeFileSync(testFilePath, originalContent, 'utf-8');

      updateSettingsFilePreservingFormat(testFilePath, {
        model: 'gemini-3.0-ultra',
      });

      const updatedContent = fs.readFileSync(testFilePath, 'utf-8');

      expect(updatedContent).toContain('// Model configuration');
      expect(updatedContent).toContain('// Theme setting');
      expect(updatedContent).toContain('"model": "gemini-3.0-ultra"');
      expect(updatedContent).toContain('"theme": "dark"');
    });

    it('should preserve environment variable references', () => {
      const originalContent = `{
        "mcpServers": {
          "context7": {
            "headers": {
              "API_KEY": "$API_KEY"
            }
          }
        }
      }`;

      fs.writeFileSync(testFilePath, originalContent, 'utf-8');

      const envVarMappings = [
        {
          path: ['mcpServers', 'context7', 'headers', 'API_KEY'],
          originalValue: '$API_KEY',
          resolvedValue: 'actual-key-value',
        },
      ];

      updateSettingsFilePreservingFormat(
        testFilePath,
        {
          mcpServers: {
            context7: {
              headers: {
                API_KEY: 'actual-key-value',
              },
            },
          },
        },
        envVarMappings,
      );

      const updatedContent = fs.readFileSync(testFilePath, 'utf-8');
      expect(updatedContent).toContain('"API_KEY": "$API_KEY"');
      expect(updatedContent).not.toContain('actual-key-value');
    });

    it('should handle nested object updates', () => {
      const originalContent = `{
        "ui": {
          "theme": "dark",
          "showLineNumbers": true
        }
      }`;

      fs.writeFileSync(testFilePath, originalContent, 'utf-8');

      updateSettingsFilePreservingFormat(testFilePath, {
        ui: {
          theme: 'light',
          showLineNumbers: true,
        },
      });

      const updatedContent = fs.readFileSync(testFilePath, 'utf-8');
      expect(updatedContent).toContain('"theme": "light"');
      expect(updatedContent).toContain('"showLineNumbers": true');
    });

    it('should add new fields while preserving existing structure', () => {
      const originalContent = `{
        // Existing config
        "model": "gemini-2.5-pro"
      }`;

      fs.writeFileSync(testFilePath, originalContent, 'utf-8');

      updateSettingsFilePreservingFormat(testFilePath, {
        model: 'gemini-2.5-pro',
        newField: 'newValue',
      });

      const updatedContent = fs.readFileSync(testFilePath, 'utf-8');
      expect(updatedContent).toContain('// Existing config');
      expect(updatedContent).toContain('"newField": "newValue"');
    });

    it('should create file if it does not exist', () => {
      updateSettingsFilePreservingFormat(testFilePath, {
        model: 'gemini-2.5-pro',
      });

      expect(fs.existsSync(testFilePath)).toBe(true);
      const content = fs.readFileSync(testFilePath, 'utf-8');
      expect(content).toContain('"model": "gemini-2.5-pro"');
    });

    it('should handle complex real-world scenario', () => {
      const complexContent = `{
        // Settings
        "model": "gemini-2.5-pro",
        "mcpServers": {
          // Active server
          "context7": {
            "headers": {
              "API_KEY": "$API_KEY" // Environment variable
            }
          }
        }
      }`;

      fs.writeFileSync(testFilePath, complexContent, 'utf-8');

      const envVarMappings = [
        {
          path: ['mcpServers', 'context7', 'headers', 'API_KEY'],
          originalValue: '$API_KEY',
          resolvedValue: 'resolved-key',
        },
      ];

      updateSettingsFilePreservingFormat(
        testFilePath,
        {
          model: 'gemini-3.0-ultra',
          mcpServers: {
            context7: {
              headers: {
                API_KEY: 'resolved-key',
              },
            },
          },
          newSection: {
            setting: 'value',
          },
        },
        envVarMappings,
      );

      const updatedContent = fs.readFileSync(testFilePath, 'utf-8');

      // Verify comments preserved
      expect(updatedContent).toContain('// Settings');
      expect(updatedContent).toContain('// Active server');
      expect(updatedContent).toContain('// Environment variable');

      // Verify updates applied
      expect(updatedContent).toContain('"model": "gemini-3.0-ultra"');
      expect(updatedContent).toContain('"newSection"');

      // Verify env vars restored
      expect(updatedContent).toContain('"API_KEY": "$API_KEY"');
    });
  });

  describe('trackEnvVarMappings', () => {
    it('should track environment variable mappings', () => {
      const original = {
        server: {
          apiKey: '$API_KEY',
          normalValue: 'text',
        },
      };

      const resolved = {
        server: {
          apiKey: 'actual-key',
          normalValue: 'text',
        },
      };

      const mappings = trackEnvVarMappings(resolved, original);

      expect(mappings).toHaveLength(1);
      expect(mappings[0]).toEqual({
        path: ['server', 'apiKey'],
        originalValue: '$API_KEY',
        resolvedValue: 'actual-key',
      });
    });

    it('should not track non-environment variable values', () => {
      const original = {
        normalValue: 'text',
      };

      const resolved = {
        normalValue: 'text',
      };

      const mappings = trackEnvVarMappings(resolved, original);
      expect(mappings).toHaveLength(0);
    });

    it('should handle nested objects', () => {
      const original = {
        level1: {
          level2: {
            envVar: '$NESTED_VAR',
          },
        },
      };

      const resolved = {
        level1: {
          level2: {
            envVar: 'nested-value',
          },
        },
      };

      const mappings = trackEnvVarMappings(resolved, original);

      expect(mappings).toHaveLength(1);
      expect(mappings[0]).toEqual({
        path: ['level1', 'level2', 'envVar'],
        originalValue: '$NESTED_VAR',
        resolvedValue: 'nested-value',
      });
    });
  });
});
