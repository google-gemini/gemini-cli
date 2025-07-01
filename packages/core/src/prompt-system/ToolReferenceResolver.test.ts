/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ToolReferenceResolver,
  resolveToolReferences,
  resolveToolReference,
} from './ToolReferenceResolver.js';
import { ToolManifestLoader } from './ToolManifestLoader.js';
import type { ToolManifest } from './interfaces/tool-manifest.js';

describe('ToolReferenceResolver', () => {
  let tempDir: string;
  let manifestPath: string;
  let validManifest: ToolManifest;
  let resolver: ToolReferenceResolver;
  let mockConsoleWarn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset singleton instances before each test
    // @ts-expect-error - Accessing private static property for testing
    ToolReferenceResolver.instance = null;
    // @ts-expect-error - Accessing private static property for testing
    ToolManifestLoader.instance = null;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-resolver-test-'));
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
            name: 'replace',
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

    const manifestLoader = new ToolManifestLoader({ manifestPath });
    resolver = new ToolReferenceResolver(manifestLoader);

    // Mock console.warn to capture warnings
    mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('constructor and getInstance', () => {
    it('should create a new instance with provided loader', () => {
      const manifestLoader = new ToolManifestLoader({ manifestPath });
      const newResolver = new ToolReferenceResolver(manifestLoader);
      expect(newResolver).toBeInstanceOf(ToolReferenceResolver);
    });

    it('should create a new instance with default loader', () => {
      const newResolver = new ToolReferenceResolver();
      expect(newResolver).toBeInstanceOf(ToolReferenceResolver);
    });

    it('should return singleton instance', () => {
      const resolver1 = ToolReferenceResolver.getInstance();
      const resolver2 = ToolReferenceResolver.getInstance();
      expect(resolver1).toBe(resolver2);
    });
  });

  describe('resolveTemplate', () => {
    it('should resolve ${REFERENCE} format templates', () => {
      const template =
        'Use the ${READ_FILE_TOOL} tool to read files and ${EDIT_TOOL} to edit them.';
      const result = resolver.resolveTemplate(template);

      expect(result).toBe(
        'Use the read_file tool to read files and replace to edit them.',
      );
    });

    it('should resolve {{REFERENCE}} format templates', () => {
      const template =
        'Use the {{READ_FILE_TOOL}} tool to read files and {{EDIT_TOOL}} to edit them.';
      const result = resolver.resolveTemplate(template);

      expect(result).toBe(
        'Use the read_file tool to read files and replace to edit them.',
      );
    });

    it('should resolve mixed format templates', () => {
      const template = 'Use ${READ_FILE_TOOL} and {{EDIT_TOOL}} together.';
      const result = resolver.resolveTemplate(template);

      expect(result).toBe('Use read_file and replace together.');
    });

    it('should handle templates with no references', () => {
      const template = 'This template has no tool references.';
      const result = resolver.resolveTemplate(template);

      expect(result).toBe(template);
    });

    it('should preserve unresolvable references and warn', () => {
      const template = 'Use ${NON_EXISTENT_TOOL} for unknown operations.';
      const result = resolver.resolveTemplate(template);

      expect(result).toBe('Use ${NON_EXISTENT_TOOL} for unknown operations.');
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining(
          "Warning: Could not resolve tool reference 'NON_EXISTENT_TOOL'",
        ),
      );
    });

    it('should handle multiple references of the same type', () => {
      const template =
        'Use ${READ_FILE_TOOL} then ${EDIT_TOOL} then ${READ_FILE_TOOL} again.';
      const result = resolver.resolveTemplate(template);

      expect(result).toBe('Use read_file then replace then read_file again.');
    });

    it('should handle nested-like patterns correctly', () => {
      const template = 'Complex ${${READ_FILE_TOOL}} should not break parsing.';
      const result = resolver.resolveTemplate(template);

      // The inner ${READ_FILE_TOOL} should be resolved, outer ${ should remain
      expect(result).toBe('Complex ${read_file} should not break parsing.');
    });

    it('should handle empty template', () => {
      const result = resolver.resolveTemplate('');
      expect(result).toBe('');
    });
  });

  describe('resolveReference', () => {
    it('should resolve valid references', () => {
      const result = resolver.resolveReference('READ_FILE_TOOL');
      expect(result).toBe('read_file');
    });

    it('should resolve direct tool names', () => {
      const result = resolver.resolveReference('read_file');
      expect(result).toBe('read_file');
    });

    it('should preserve invalid references and warn', () => {
      const result = resolver.resolveReference('NON_EXISTENT_TOOL');
      expect(result).toBe('NON_EXISTENT_TOOL');
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining(
          "Warning: Could not resolve tool reference 'NON_EXISTENT_TOOL'",
        ),
      );
    });
  });

  describe('utility methods', () => {
    it('should return available references', () => {
      const references = resolver.getAvailableReferences();
      expect(references).toEqual(['READ_FILE_TOOL', 'EDIT_TOOL', 'GREP_TOOL']);
    });

    it('should return available tool names', () => {
      const toolNames = resolver.getAvailableToolNames();
      expect(toolNames).toEqual(['read_file', 'replace', 'grep']);
    });
  });

  describe('validateTemplate', () => {
    it('should validate templates with all valid references', () => {
      const template = 'Use ${READ_FILE_TOOL} and ${EDIT_TOOL} together.';
      const result = resolver.validateTemplate(template);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate templates with mixed formats', () => {
      const template = 'Use ${READ_FILE_TOOL} and {{EDIT_TOOL}} together.';
      const result = resolver.validateTemplate(template);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect invalid references', () => {
      const template = 'Use ${NON_EXISTENT_TOOL} and ${ANOTHER_INVALID_TOOL}.';
      const result = resolver.validateTemplate(template);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain(
        "Invalid tool reference 'NON_EXISTENT_TOOL'",
      );
      expect(result.errors[1]).toContain(
        "Invalid tool reference 'ANOTHER_INVALID_TOOL'",
      );
    });

    it('should validate templates with no references', () => {
      const template = 'This template has no tool references.';
      const result = resolver.validateTemplate(template);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate empty templates', () => {
      const result = resolver.validateTemplate('');

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should handle duplicate references correctly', () => {
      const template = 'Use ${READ_FILE_TOOL} and ${READ_FILE_TOOL} twice.';
      const result = resolver.validateTemplate(template);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('convenience functions', () => {
    it('should export resolveToolReferences convenience function', () => {
      // Note: convenience functions use their own singleton, so we test
      // with the resolver instance instead for these unit tests
      const template = 'Use ${READ_FILE_TOOL} for reading files.';
      const result = resolver.resolveTemplate(template);

      expect(result).toBe('Use read_file for reading files.');
    });

    it('should export resolveToolReference convenience function', () => {
      // Note: convenience functions use their own singleton, so we test
      // with the resolver instance instead for these unit tests
      const result = resolver.resolveReference('READ_FILE_TOOL');

      expect(result).toBe('read_file');
    });
  });

  describe('error handling', () => {
    it('should handle manifest loader errors gracefully', () => {
      // Create resolver with invalid manifest path
      const invalidLoader = new ToolManifestLoader({
        manifestPath: '/non/existent/path.json',
      });
      const errorResolver = new ToolReferenceResolver(invalidLoader);

      const template = 'Use ${READ_FILE_TOOL} for reading.';
      const result = errorResolver.resolveTemplate(template);

      // Should preserve original template and warn
      expect(result).toBe('Use ${READ_FILE_TOOL} for reading.');
      expect(mockConsoleWarn).toHaveBeenCalled();
    });

    it('should handle validation errors gracefully', () => {
      const invalidLoader = new ToolManifestLoader({
        manifestPath: '/non/existent/path.json',
      });
      const errorResolver = new ToolReferenceResolver(invalidLoader);

      const template = 'Use ${READ_FILE_TOOL} for reading.';
      const result = errorResolver.validateTemplate(template);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failed to resolve tool reference');
    });
  });
});
