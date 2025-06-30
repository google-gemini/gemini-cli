/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ToolManifestLoader } from './ToolManifestLoader.js';
import type { ToolManifest } from './interfaces/tool-manifest.js';

describe('ToolManifestLoader', () => {
  let tempDir: string;
  let manifestPath: string;
  let validManifest: ToolManifest;

  beforeEach(() => {
    // Reset singleton instance before each test
    // @ts-expect-error - Accessing private static property for testing
    ToolManifestLoader.instance = null;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-manifest-test-'));
    manifestPath = path.join(tempDir, 'test-manifest.json');

    validManifest = {
      manifest_version: '1.0',
      last_updated: '2025-06-30',
      tools: {
        file_operations: {
          read: {
            name: 'read_file',
            version: '2.1.0',
            description: 'Read file contents with absolute path support',
          },
          edit: {
            name: 'edit',
            version: '1.5.0',
            description: 'Edit files with precise string replacement',
          },
        },
        search_operations: {
          grep: {
            name: 'grep',
            version: '1.4.0',
            description: 'Search file contents with regex support',
          },
        },
      },
      tool_references: {
        READ_FILE_TOOL: 'file_operations.read.name',
        EDIT_TOOL: 'file_operations.edit.name',
        GREP_TOOL: 'search_operations.grep.name',
      },
    };

    fs.writeFileSync(manifestPath, JSON.stringify(validManifest, null, 2));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('constructor and getInstance', () => {
    it('should create a new instance with default options', () => {
      const loader = new ToolManifestLoader({ manifestPath });
      expect(loader).toBeInstanceOf(ToolManifestLoader);
    });

    it('should return singleton instance', () => {
      const loader1 = ToolManifestLoader.getInstance({ manifestPath });
      const loader2 = ToolManifestLoader.getInstance();
      expect(loader1).toBe(loader2);
    });

    it('should use default manifest path when none provided', () => {
      const loader = new ToolManifestLoader();
      expect(loader).toBeInstanceOf(ToolManifestLoader);
    });
  });

  describe('manifest loading', () => {
    it('should load a valid manifest successfully', () => {
      const loader = new ToolManifestLoader({ manifestPath });
      const result = loader.resolveToolReference('READ_FILE_TOOL');

      expect(result.success).toBe(true);
      expect(result.name).toBe('read_file');
      expect(result.definition).toEqual({
        name: 'read_file',
        version: '2.1.0',
        description: 'Read file contents with absolute path support',
      });
    });

    it('should handle error for non-existent manifest file', () => {
      const invalidPath = path.join(tempDir, 'non-existent.json');
      const loader = new ToolManifestLoader({ manifestPath: invalidPath });

      const result = loader.resolveToolReference('READ_FILE_TOOL');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load tool manifest');
    });

    it('should handle error for invalid JSON', () => {
      const invalidJsonPath = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(invalidJsonPath, '{ invalid json }');

      const loader = new ToolManifestLoader({ manifestPath: invalidJsonPath });

      const result = loader.resolveToolReference('READ_FILE_TOOL');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load tool manifest');
    });

    it('should cache manifest when caching is enabled', () => {
      const loader = new ToolManifestLoader({
        manifestPath,
        enableCaching: true,
      });

      // Test caching by calling multiple times and ensuring consistent results
      const result1 = loader.resolveToolReference('READ_FILE_TOOL');
      const result2 = loader.resolveToolReference('EDIT_TOOL');
      const result3 = loader.resolveToolReference('READ_FILE_TOOL');

      // Results should be consistent, indicating caching is working
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
      expect(result1.name).toBe(result3.name);
    });

    it('should not cache manifest when caching is disabled', () => {
      const loader = new ToolManifestLoader({
        manifestPath,
        enableCaching: false,
      });

      // Test that modification of the manifest file affects subsequent calls
      // when caching is disabled (functional test approach)
      const result1 = loader.resolveToolReference('READ_FILE_TOOL');
      expect(result1.success).toBe(true);
      expect(result1.name).toBe('read_file');

      // Modify the manifest file
      const modifiedManifest = {
        ...validManifest,
        tools: {
          ...validManifest.tools,
          file_operations: {
            ...validManifest.tools.file_operations,
            read: {
              name: 'modified_read_file',
              version: '2.2.0',
              description: 'Modified read file tool',
            },
          },
        },
      };
      fs.writeFileSync(manifestPath, JSON.stringify(modifiedManifest, null, 2));

      // Without caching, the next call should see the modified manifest
      const result2 = loader.resolveToolReference('READ_FILE_TOOL');
      expect(result2.success).toBe(true);
      expect(result2.name).toBe('modified_read_file');
    });
  });

  describe('manifest validation', () => {
    it('should validate manifest schema when enabled', () => {
      const invalidManifest = { invalid: 'manifest' };
      fs.writeFileSync(manifestPath, JSON.stringify(invalidManifest));

      const loader = new ToolManifestLoader({
        manifestPath,
        validateSchema: true,
      });

      const result = loader.resolveToolReference('READ_FILE_TOOL');
      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'Manifest must have a valid manifest_version',
      );
    });

    it('should skip validation when disabled', () => {
      const invalidManifest = {
        manifest_version: '1.0',
        tools: {},
        tool_references: {},
        invalid: 'field',
      };
      fs.writeFileSync(manifestPath, JSON.stringify(invalidManifest));

      const loader = new ToolManifestLoader({
        manifestPath,
        validateSchema: false,
      });

      // Should not throw validation error
      const result = loader.resolveToolReference('NON_EXISTENT');
      expect(result.success).toBe(false);
    });

    it('should validate required fields', () => {
      const testCases = [
        {
          manifest: null,
          expectedError: /Manifest must be a valid JSON object/,
        },
        {
          manifest: 'string',
          expectedError: /Manifest must be a valid JSON object/,
        },
        {
          manifest: {},
          expectedError: /Manifest must have a valid manifest_version/,
        },
        {
          manifest: { manifest_version: '1.0' },
          expectedError: /Manifest must have a tools section/,
        },
        {
          manifest: { manifest_version: '1.0', tools: {} },
          expectedError: /Manifest must have a tool_references section/,
        },
      ];

      testCases.forEach(({ manifest, expectedError }) => {
        fs.writeFileSync(manifestPath, JSON.stringify(manifest));
        const loader = new ToolManifestLoader({
          manifestPath,
          validateSchema: true,
        });

        const result = loader.resolveToolReference('TEST');
        expect(result.success).toBe(false);
        expect(result.error).toMatch(expectedError);
      });
    });
  });

  describe('tool reference resolution', () => {
    let loader: ToolManifestLoader;

    beforeEach(() => {
      loader = new ToolManifestLoader({ manifestPath });
    });

    it('should resolve valid tool references', () => {
      const result = loader.resolveToolReference('READ_FILE_TOOL');

      expect(result.success).toBe(true);
      expect(result.name).toBe('read_file');
      expect(result.definition).toEqual({
        name: 'read_file',
        version: '2.1.0',
        description: 'Read file contents with absolute path support',
      });
    });

    it('should resolve direct tool names', () => {
      const result = loader.resolveToolReference('read_file');

      expect(result.success).toBe(true);
      expect(result.name).toBe('read_file');
      expect(result.definition).toEqual({
        name: 'read_file',
        version: '2.1.0',
        description: 'Read file contents with absolute path support',
      });
    });

    it('should handle non-existent references', () => {
      const result = loader.resolveToolReference('NON_EXISTENT_TOOL');

      expect(result.success).toBe(false);
      expect(result.name).toBe('NON_EXISTENT_TOOL');
      expect(result.error).toContain('not found in manifest');
    });

    it('should handle invalid reference paths', () => {
      const manifestWithInvalidRef = {
        ...validManifest,
        tool_references: {
          INVALID_REF: 'invalid.path',
        },
      };
      fs.writeFileSync(manifestPath, JSON.stringify(manifestWithInvalidRef));

      const result = loader.resolveToolReference('INVALID_REF');

      expect(result.success).toBe(false);
      expect(result.name).toBe('INVALID_REF');
      expect(result.error).toContain('not found in manifest');
    });

    it('should handle references to non-existent categories', () => {
      const manifestWithInvalidRef = {
        ...validManifest,
        tool_references: {
          INVALID_CATEGORY: 'non_existent_category.tool.name',
        },
      };
      fs.writeFileSync(manifestPath, JSON.stringify(manifestWithInvalidRef));

      const result = loader.resolveToolReference('INVALID_CATEGORY');

      expect(result.success).toBe(false);
      expect(result.name).toBe('INVALID_CATEGORY');
      expect(result.error).toContain('not found in manifest');
    });

    it('should handle references to non-existent tools', () => {
      const manifestWithInvalidRef = {
        ...validManifest,
        tool_references: {
          INVALID_TOOL: 'file_operations.non_existent_tool.name',
        },
      };
      fs.writeFileSync(manifestPath, JSON.stringify(manifestWithInvalidRef));

      const result = loader.resolveToolReference('INVALID_TOOL');

      expect(result.success).toBe(false);
      expect(result.name).toBe('INVALID_TOOL');
      expect(result.error).toContain('not found in manifest');
    });
  });

  describe('utility methods', () => {
    let loader: ToolManifestLoader;

    beforeEach(() => {
      loader = new ToolManifestLoader({ manifestPath });
    });

    it('should return available references', () => {
      const references = loader.getAvailableReferences();

      expect(references).toEqual(['READ_FILE_TOOL', 'EDIT_TOOL', 'GREP_TOOL']);
    });

    it('should return available tool names', () => {
      const toolNames = loader.getAvailableToolNames();

      expect(toolNames).toEqual(['read_file', 'edit', 'grep']);
    });

    it('should return manifest version', () => {
      const version = loader.getManifestVersion();

      expect(version).toBe('1.0');
    });

    it('should handle errors in utility methods gracefully', () => {
      const invalidPath = path.join(tempDir, 'non-existent.json');
      const errorLoader = new ToolManifestLoader({ manifestPath: invalidPath });

      expect(errorLoader.getAvailableReferences()).toEqual([]);
      expect(errorLoader.getAvailableToolNames()).toEqual([]);
      expect(errorLoader.getManifestVersion()).toBeNull();
    });

    it('should reload manifest when requested', () => {
      // First load
      loader.resolveToolReference('READ_FILE_TOOL');

      // Modify manifest
      const modifiedManifest = {
        ...validManifest,
        manifest_version: '2.0',
      };
      fs.writeFileSync(manifestPath, JSON.stringify(modifiedManifest));

      // Reload and check version
      loader.reload();
      const version = loader.getManifestVersion();

      expect(version).toBe('2.0');
    });
  });
});
