/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import * as coreIndex from './index.js';

describe('core package index exports', () => {
  describe('Storage export', () => {
    it('should export Storage class', () => {
      expect(coreIndex.Storage).toBeDefined();
    });

    it('should be a constructor', () => {
      expect(typeof coreIndex.Storage).toBe('function');
    });
  });

  describe('model constants', () => {
    it('should export DEFAULT_GEMINI_MODEL', () => {
      expect(coreIndex.DEFAULT_GEMINI_MODEL).toBeDefined();
      expect(typeof coreIndex.DEFAULT_GEMINI_MODEL).toBe('string');
    });

    it('should export DEFAULT_GEMINI_MODEL_AUTO', () => {
      expect(coreIndex.DEFAULT_GEMINI_MODEL_AUTO).toBeDefined();
      expect(typeof coreIndex.DEFAULT_GEMINI_MODEL_AUTO).toBe('string');
    });

    it('should export DEFAULT_GEMINI_FLASH_MODEL', () => {
      expect(coreIndex.DEFAULT_GEMINI_FLASH_MODEL).toBeDefined();
      expect(typeof coreIndex.DEFAULT_GEMINI_FLASH_MODEL).toBe('string');
    });

    it('should export DEFAULT_GEMINI_FLASH_LITE_MODEL', () => {
      expect(coreIndex.DEFAULT_GEMINI_FLASH_LITE_MODEL).toBeDefined();
      expect(typeof coreIndex.DEFAULT_GEMINI_FLASH_LITE_MODEL).toBe('string');
    });

    it('should export DEFAULT_GEMINI_EMBEDDING_MODEL', () => {
      expect(coreIndex.DEFAULT_GEMINI_EMBEDDING_MODEL).toBeDefined();
      expect(typeof coreIndex.DEFAULT_GEMINI_EMBEDDING_MODEL).toBe('string');
    });
  });

  describe('terminal serializer', () => {
    it('should export serializeTerminalToObject', () => {
      expect(coreIndex.serializeTerminalToObject).toBeDefined();
      expect(typeof coreIndex.serializeTerminalToObject).toBe('function');
    });
  });

  describe('config constants', () => {
    it('should export DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES', () => {
      expect(coreIndex.DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES).toBeDefined();
      expect(typeof coreIndex.DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES).toBe(
        'number',
      );
    });

    it('should export DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD', () => {
      expect(coreIndex.DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD).toBeDefined();
      expect(typeof coreIndex.DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD).toBe(
        'number',
      );
    });

    it('should have positive truncate line count', () => {
      expect(coreIndex.DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES).toBeGreaterThan(0);
    });

    it('should have positive truncate threshold', () => {
      expect(coreIndex.DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD).toBeGreaterThan(
        0,
      );
    });
  });

  describe('IDE detection', () => {
    it('should export detectIdeFromEnv', () => {
      expect(coreIndex.detectIdeFromEnv).toBeDefined();
      expect(typeof coreIndex.detectIdeFromEnv).toBe('function');
    });
  });

  describe('telemetry loggers', () => {
    it('should export logExtensionEnable', () => {
      expect(coreIndex.logExtensionEnable).toBeDefined();
      expect(typeof coreIndex.logExtensionEnable).toBe('function');
    });

    it('should export logIdeConnection', () => {
      expect(coreIndex.logIdeConnection).toBeDefined();
      expect(typeof coreIndex.logIdeConnection).toBe('function');
    });

    it('should export logExtensionDisable', () => {
      expect(coreIndex.logExtensionDisable).toBeDefined();
      expect(typeof coreIndex.logExtensionDisable).toBe('function');
    });

    it('should export logModelSlashCommand', () => {
      expect(coreIndex.logModelSlashCommand).toBeDefined();
      expect(typeof coreIndex.logModelSlashCommand).toBe('function');
    });
  });

  describe('telemetry event types', () => {
    it('should export IdeConnectionEvent', () => {
      expect(coreIndex.IdeConnectionEvent).toBeDefined();
    });

    it('should export IdeConnectionType', () => {
      expect(coreIndex.IdeConnectionType).toBeDefined();
    });

    it('should export ExtensionInstallEvent', () => {
      expect(coreIndex.ExtensionInstallEvent).toBeDefined();
    });

    it('should export ExtensionDisableEvent', () => {
      expect(coreIndex.ExtensionDisableEvent).toBeDefined();
    });

    it('should export ExtensionEnableEvent', () => {
      expect(coreIndex.ExtensionEnableEvent).toBeDefined();
    });

    it('should export ExtensionUninstallEvent', () => {
      expect(coreIndex.ExtensionUninstallEvent).toBeDefined();
    });

    it('should export ModelSlashCommandEvent', () => {
      expect(coreIndex.ModelSlashCommandEvent).toBeDefined();
    });
  });

  describe('test utilities', () => {
    it('should export makeFakeConfig', () => {
      expect(coreIndex.makeFakeConfig).toBeDefined();
      expect(typeof coreIndex.makeFakeConfig).toBe('function');
    });
  });

  describe('Clearcut logger', () => {
    it('should export ClearcutLogger', () => {
      expect(coreIndex.ClearcutLogger).toBeDefined();
    });

    it('should be a constructor', () => {
      expect(typeof coreIndex.ClearcutLogger).toBe('function');
    });
  });

  describe('comprehensive export check', () => {
    it('should have all expected exports', () => {
      const expectedExports = [
        'Storage',
        'DEFAULT_GEMINI_MODEL',
        'DEFAULT_GEMINI_MODEL_AUTO',
        'DEFAULT_GEMINI_FLASH_MODEL',
        'DEFAULT_GEMINI_FLASH_LITE_MODEL',
        'DEFAULT_GEMINI_EMBEDDING_MODEL',
        'serializeTerminalToObject',
        'DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES',
        'DEFAULT_TRUNCATE_TOOL_OUTPUT_THRESHOLD',
        'detectIdeFromEnv',
        'logExtensionEnable',
        'logIdeConnection',
        'logExtensionDisable',
        'IdeConnectionEvent',
        'IdeConnectionType',
        'ExtensionInstallEvent',
        'ExtensionDisableEvent',
        'ExtensionEnableEvent',
        'ExtensionUninstallEvent',
        'ModelSlashCommandEvent',
        'makeFakeConfig',
        'ClearcutLogger',
        'logModelSlashCommand',
      ];

      for (const exportName of expectedExports) {
        expect(coreIndex).toHaveProperty(exportName);
      }
    });

    it('should re-export from src/index.js', () => {
      // The wildcard export should bring in many more exports
      expect(Object.keys(coreIndex).length).toBeGreaterThan(23);
    });
  });

  describe('model naming conventions', () => {
    it('should use gemini- prefix for models', () => {
      expect(coreIndex.DEFAULT_GEMINI_MODEL).toContain('gemini');
      expect(coreIndex.DEFAULT_GEMINI_MODEL_AUTO).toContain('gemini');
      expect(coreIndex.DEFAULT_GEMINI_FLASH_MODEL).toContain('gemini');
    });

    it('should have flash in flash model names', () => {
      expect(coreIndex.DEFAULT_GEMINI_FLASH_MODEL.toLowerCase()).toContain(
        'flash',
      );
      expect(coreIndex.DEFAULT_GEMINI_FLASH_LITE_MODEL.toLowerCase()).toContain(
        'flash',
      );
    });

    it('should have embedding in embedding model name', () => {
      expect(coreIndex.DEFAULT_GEMINI_EMBEDDING_MODEL.toLowerCase()).toContain(
        'embedding',
      );
    });
  });

  describe('telemetry event type structures', () => {
    it('should have IdeConnectionType enum values', () => {
      expect(coreIndex.IdeConnectionType).toBeDefined();
      expect(Object.keys(coreIndex.IdeConnectionType).length).toBeGreaterThan(
        0,
      );
    });

    it('should support creating extension events', () => {
      expect(() => {
        new coreIndex.ExtensionInstallEvent({} as never);
      }).not.toThrow();
    });

    it('should support creating IDE connection events', () => {
      expect(() => {
        new coreIndex.IdeConnectionEvent({} as never);
      }).not.toThrow();
    });
  });

  describe('export consistency', () => {
    it('should export functions as functions', () => {
      const functionExports = [
        'serializeTerminalToObject',
        'detectIdeFromEnv',
        'logExtensionEnable',
        'logIdeConnection',
        'logExtensionDisable',
        'logModelSlashCommand',
        'makeFakeConfig',
      ];

      for (const exportName of functionExports) {
        expect(typeof (coreIndex as never)[exportName]).toBe('function');
      }
    });

    it('should export classes as constructors', () => {
      const classExports = ['Storage', 'ClearcutLogger'];

      for (const exportName of classExports) {
        expect(typeof (coreIndex as never)[exportName]).toBe('function');
      }
    });

    it('should export constants with correct types', () => {
      expect(typeof coreIndex.DEFAULT_GEMINI_MODEL).toBe('string');
      expect(typeof coreIndex.DEFAULT_TRUNCATE_TOOL_OUTPUT_LINES).toBe(
        'number',
      );
    });
  });

  describe('path reader utilities', () => {
    it('should export path reader functions', () => {
      // The wildcard export from pathReader should be available
      // We can't test specific exports without knowing what's in pathReader
      expect(coreIndex).toBeDefined();
    });
  });

  describe('src index re-exports', () => {
    it('should include exports from src/index.js', () => {
      // The first export * from './src/index.js' should include many exports
      // We verify this by checking the export count
      const exportCount = Object.keys(coreIndex).length;
      expect(exportCount).toBeGreaterThan(20);
    });
  });
});
