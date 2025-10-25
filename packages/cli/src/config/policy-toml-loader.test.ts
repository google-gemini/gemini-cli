/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApprovalMode, PolicyDecision } from '@google/gemini-cli-core';
import type { Dirent } from 'node:fs';
import nodePath from 'node:path';

describe('policy-toml-loader', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('node:fs/promises');
  });

  describe('loadPoliciesFromToml', () => {
    it('should load and parse a simple policy file', async () => {
      const actualFs =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );

      const mockReaddir = vi.fn(
        async (
          path: string,
          _options?: { withFileTypes: boolean },
        ): Promise<Dirent[]> => {
          if (nodePath.normalize(path) === nodePath.normalize('/policies')) {
            return [
              {
                name: 'test.toml',
                isFile: () => true,
                isDirectory: () => false,
              } as Dirent,
            ];
          }
          return [];
        },
      );

      const mockReadFile = vi.fn(async (path: string): Promise<string> => {
        if (
          nodePath.normalize(path) ===
          nodePath.normalize(nodePath.join('/policies', 'test.toml'))
        ) {
          return `
[[rule]]
toolName = "glob"
decision = "allow"
priority = 100
`;
        }
        throw new Error('File not found');
      });

      vi.doMock('node:fs/promises', () => ({
        ...actualFs,
        default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
        readFile: mockReadFile,
        readdir: mockReaddir,
      }));

      const { loadPoliciesFromToml: load } = await import(
        './policy-toml-loader.js'
      );

      const getPolicyTier = (_dir: string) => 1;
      const result = await load(
        ApprovalMode.DEFAULT,
        ['/policies'],
        getPolicyTier,
      );

      expect(result.rules).toHaveLength(1);
      expect(result.rules[0]).toEqual({
        toolName: 'glob',
        decision: PolicyDecision.ALLOW,
        priority: 1.1, // tier 1 + 100/1000
      });
      expect(result.errors).toHaveLength(0);
    });

    it('should expand commandPrefix array to multiple rules', async () => {
      const actualFs =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );

      const mockReaddir = vi.fn(
        async (
          path: string,
          _options?: { withFileTypes: boolean },
        ): Promise<Dirent[]> => {
          if (nodePath.normalize(path) === nodePath.normalize('/policies')) {
            return [
              {
                name: 'shell.toml',
                isFile: () => true,
                isDirectory: () => false,
              } as Dirent,
            ];
          }
          return [];
        },
      );

      const mockReadFile = vi.fn(async (path: string): Promise<string> => {
        if (
          nodePath.normalize(path) ===
          nodePath.normalize(nodePath.join('/policies', 'shell.toml'))
        ) {
          return `
[[rule]]
toolName = "run_shell_command"
commandPrefix = ["git status", "git log"]
decision = "allow"
priority = 100
`;
        }
        throw new Error('File not found');
      });

      vi.doMock('node:fs/promises', () => ({
        ...actualFs,
        default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
        readFile: mockReadFile,
        readdir: mockReaddir,
      }));

      const { loadPoliciesFromToml: load } = await import(
        './policy-toml-loader.js'
      );

      const getPolicyTier = (_dir: string) => 2;
      const result = await load(
        ApprovalMode.DEFAULT,
        ['/policies'],
        getPolicyTier,
      );

      expect(result.rules).toHaveLength(2);
      expect(result.rules[0].toolName).toBe('run_shell_command');
      expect(result.rules[1].toolName).toBe('run_shell_command');
      expect(
        result.rules[0].argsPattern?.test('{"command":"git status"}'),
      ).toBe(true);
      expect(result.rules[1].argsPattern?.test('{"command":"git log"}')).toBe(
        true,
      );
      expect(result.errors).toHaveLength(0);
    });

    it('should transform commandRegex to argsPattern', async () => {
      const actualFs =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );

      const mockReaddir = vi.fn(
        async (
          path: string,
          _options?: { withFileTypes: boolean },
        ): Promise<Dirent[]> => {
          if (nodePath.normalize(path) === nodePath.normalize('/policies')) {
            return [
              {
                name: 'shell.toml',
                isFile: () => true,
                isDirectory: () => false,
              } as Dirent,
            ];
          }
          return [];
        },
      );

      const mockReadFile = vi.fn(async (path: string): Promise<string> => {
        if (
          nodePath.normalize(path) ===
          nodePath.normalize(nodePath.join('/policies', 'shell.toml'))
        ) {
          return `
[[rule]]
toolName = "run_shell_command"
commandRegex = "git (status|log).*"
decision = "allow"
priority = 100
`;
        }
        throw new Error('File not found');
      });

      vi.doMock('node:fs/promises', () => ({
        ...actualFs,
        default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
        readFile: mockReadFile,
        readdir: mockReaddir,
      }));

      const { loadPoliciesFromToml: load } = await import(
        './policy-toml-loader.js'
      );

      const getPolicyTier = (_dir: string) => 2;
      const result = await load(
        ApprovalMode.DEFAULT,
        ['/policies'],
        getPolicyTier,
      );

      expect(result.rules).toHaveLength(1);
      expect(
        result.rules[0].argsPattern?.test('{"command":"git status"}'),
      ).toBe(true);
      expect(
        result.rules[0].argsPattern?.test('{"command":"git log --all"}'),
      ).toBe(true);
      expect(
        result.rules[0].argsPattern?.test('{"command":"git branch"}'),
      ).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('should expand toolName array', async () => {
      const actualFs =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );

      const mockReaddir = vi.fn(
        async (
          path: string,
          _options?: { withFileTypes: boolean },
        ): Promise<Dirent[]> => {
          if (nodePath.normalize(path) === nodePath.normalize('/policies')) {
            return [
              {
                name: 'tools.toml',
                isFile: () => true,
                isDirectory: () => false,
              } as Dirent,
            ];
          }
          return [];
        },
      );

      const mockReadFile = vi.fn(async (path: string): Promise<string> => {
        if (
          nodePath.normalize(path) ===
          nodePath.normalize(nodePath.join('/policies', 'tools.toml'))
        ) {
          return `
[[rule]]
toolName = ["glob", "grep", "read"]
decision = "allow"
priority = 100
`;
        }
        throw new Error('File not found');
      });

      vi.doMock('node:fs/promises', () => ({
        ...actualFs,
        default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
        readFile: mockReadFile,
        readdir: mockReaddir,
      }));

      const { loadPoliciesFromToml: load } = await import(
        './policy-toml-loader.js'
      );

      const getPolicyTier = (_dir: string) => 1;
      const result = await load(
        ApprovalMode.DEFAULT,
        ['/policies'],
        getPolicyTier,
      );

      expect(result.rules).toHaveLength(3);
      expect(result.rules.map((r) => r.toolName)).toEqual([
        'glob',
        'grep',
        'read',
      ]);
      expect(result.errors).toHaveLength(0);
    });

    it('should transform mcpName to composite toolName', async () => {
      const actualFs =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );

      const mockReaddir = vi.fn(
        async (
          path: string,
          _options?: { withFileTypes: boolean },
        ): Promise<Dirent[]> => {
          if (nodePath.normalize(path) === nodePath.normalize('/policies')) {
            return [
              {
                name: 'mcp.toml',
                isFile: () => true,
                isDirectory: () => false,
              } as Dirent,
            ];
          }
          return [];
        },
      );

      const mockReadFile = vi.fn(async (path: string): Promise<string> => {
        if (
          nodePath.normalize(path) ===
          nodePath.normalize(nodePath.join('/policies', 'mcp.toml'))
        ) {
          return `
[[rule]]
mcpName = "google-workspace"
toolName = ["calendar.list", "calendar.get"]
decision = "allow"
priority = 100
`;
        }
        throw new Error('File not found');
      });

      vi.doMock('node:fs/promises', () => ({
        ...actualFs,
        default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
        readFile: mockReadFile,
        readdir: mockReaddir,
      }));

      const { loadPoliciesFromToml: load } = await import(
        './policy-toml-loader.js'
      );

      const getPolicyTier = (_dir: string) => 2;
      const result = await load(
        ApprovalMode.DEFAULT,
        ['/policies'],
        getPolicyTier,
      );

      expect(result.rules).toHaveLength(2);
      expect(result.rules[0].toolName).toBe('google-workspace__calendar.list');
      expect(result.rules[1].toolName).toBe('google-workspace__calendar.get');
      expect(result.errors).toHaveLength(0);
    });

    it('should filter rules by mode', async () => {
      const actualFs =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );

      const mockReaddir = vi.fn(
        async (
          path: string,
          _options?: { withFileTypes: boolean },
        ): Promise<Dirent[]> => {
          if (nodePath.normalize(path) === nodePath.normalize('/policies')) {
            return [
              {
                name: 'modes.toml',
                isFile: () => true,
                isDirectory: () => false,
              } as Dirent,
            ];
          }
          return [];
        },
      );

      const mockReadFile = vi.fn(async (path: string): Promise<string> => {
        if (
          nodePath.normalize(path) ===
          nodePath.normalize(nodePath.join('/policies', 'modes.toml'))
        ) {
          return `
[[rule]]
toolName = "glob"
decision = "allow"
priority = 100
modes = ["default", "yolo"]

[[rule]]
toolName = "grep"
decision = "allow"
priority = 100
modes = ["yolo"]
`;
        }
        throw new Error('File not found');
      });

      vi.doMock('node:fs/promises', () => ({
        ...actualFs,
        default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
        readFile: mockReadFile,
        readdir: mockReaddir,
      }));

      const { loadPoliciesFromToml: load } = await import(
        './policy-toml-loader.js'
      );

      const getPolicyTier = (_dir: string) => 1;
      const result = await load(
        ApprovalMode.DEFAULT,
        ['/policies'],
        getPolicyTier,
      );

      // Only the first rule should be included (modes includes "default")
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].toolName).toBe('glob');
      expect(result.errors).toHaveLength(0);
    });

    it('should handle TOML parse errors', async () => {
      const actualFs =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );

      const mockReaddir = vi.fn(
        async (
          path: string,
          _options?: { withFileTypes: boolean },
        ): Promise<Dirent[]> => {
          if (nodePath.normalize(path) === nodePath.normalize('/policies')) {
            return [
              {
                name: 'invalid.toml',
                isFile: () => true,
                isDirectory: () => false,
              } as Dirent,
            ];
          }
          return [];
        },
      );

      const mockReadFile = vi.fn(async (path: string): Promise<string> => {
        if (
          nodePath.normalize(path) ===
          nodePath.normalize(nodePath.join('/policies', 'invalid.toml'))
        ) {
          return `
[[rule]
toolName = "glob"
decision = "allow"
priority = 100
`;
        }
        throw new Error('File not found');
      });

      vi.doMock('node:fs/promises', () => ({
        ...actualFs,
        default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
        readFile: mockReadFile,
        readdir: mockReaddir,
      }));

      const { loadPoliciesFromToml: load } = await import(
        './policy-toml-loader.js'
      );

      const getPolicyTier = (_dir: string) => 1;
      const result = await load(
        ApprovalMode.DEFAULT,
        ['/policies'],
        getPolicyTier,
      );

      expect(result.rules).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorType).toBe('toml_parse');
      expect(result.errors[0].fileName).toBe('invalid.toml');
    });

    it('should handle schema validation errors', async () => {
      const actualFs =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );

      const mockReaddir = vi.fn(
        async (
          path: string,
          _options?: { withFileTypes: boolean },
        ): Promise<Dirent[]> => {
          if (nodePath.normalize(path) === nodePath.normalize('/policies')) {
            return [
              {
                name: 'invalid.toml',
                isFile: () => true,
                isDirectory: () => false,
              } as Dirent,
            ];
          }
          return [];
        },
      );

      const mockReadFile = vi.fn(async (path: string): Promise<string> => {
        if (
          nodePath.normalize(path) ===
          nodePath.normalize(nodePath.join('/policies', 'invalid.toml'))
        ) {
          return `
[[rule]]
toolName = "glob"
priority = 100
`;
        }
        throw new Error('File not found');
      });

      vi.doMock('node:fs/promises', () => ({
        ...actualFs,
        default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
        readFile: mockReadFile,
        readdir: mockReaddir,
      }));

      const { loadPoliciesFromToml: load } = await import(
        './policy-toml-loader.js'
      );

      const getPolicyTier = (_dir: string) => 1;
      const result = await load(
        ApprovalMode.DEFAULT,
        ['/policies'],
        getPolicyTier,
      );

      expect(result.rules).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorType).toBe('schema_validation');
      expect(result.errors[0].details).toContain('decision');
    });

    it('should reject commandPrefix without run_shell_command', async () => {
      const actualFs =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );

      const mockReaddir = vi.fn(
        async (
          path: string,
          _options?: { withFileTypes: boolean },
        ): Promise<Dirent[]> => {
          if (nodePath.normalize(path) === nodePath.normalize('/policies')) {
            return [
              {
                name: 'invalid.toml',
                isFile: () => true,
                isDirectory: () => false,
              } as Dirent,
            ];
          }
          return [];
        },
      );

      const mockReadFile = vi.fn(async (path: string): Promise<string> => {
        if (
          nodePath.normalize(path) ===
          nodePath.normalize(nodePath.join('/policies', 'invalid.toml'))
        ) {
          return `
[[rule]]
toolName = "glob"
commandPrefix = "git status"
decision = "allow"
priority = 100
`;
        }
        throw new Error('File not found');
      });

      vi.doMock('node:fs/promises', () => ({
        ...actualFs,
        default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
        readFile: mockReadFile,
        readdir: mockReaddir,
      }));

      const { loadPoliciesFromToml: load } = await import(
        './policy-toml-loader.js'
      );

      const getPolicyTier = (_dir: string) => 1;
      const result = await load(
        ApprovalMode.DEFAULT,
        ['/policies'],
        getPolicyTier,
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorType).toBe('rule_validation');
      expect(result.errors[0].details).toContain('run_shell_command');
    });

    it('should reject commandPrefix + argsPattern combination', async () => {
      const actualFs =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );

      const mockReaddir = vi.fn(
        async (
          path: string,
          _options?: { withFileTypes: boolean },
        ): Promise<Dirent[]> => {
          if (nodePath.normalize(path) === nodePath.normalize('/policies')) {
            return [
              {
                name: 'invalid.toml',
                isFile: () => true,
                isDirectory: () => false,
              } as Dirent,
            ];
          }
          return [];
        },
      );

      const mockReadFile = vi.fn(async (path: string): Promise<string> => {
        if (
          nodePath.normalize(path) ===
          nodePath.normalize(nodePath.join('/policies', 'invalid.toml'))
        ) {
          return `
[[rule]]
toolName = "run_shell_command"
commandPrefix = "git status"
argsPattern = "test"
decision = "allow"
priority = 100
`;
        }
        throw new Error('File not found');
      });

      vi.doMock('node:fs/promises', () => ({
        ...actualFs,
        default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
        readFile: mockReadFile,
        readdir: mockReaddir,
      }));

      const { loadPoliciesFromToml: load } = await import(
        './policy-toml-loader.js'
      );

      const getPolicyTier = (_dir: string) => 1;
      const result = await load(
        ApprovalMode.DEFAULT,
        ['/policies'],
        getPolicyTier,
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorType).toBe('rule_validation');
      expect(result.errors[0].details).toContain('mutually exclusive');
    });

    it('should handle invalid regex patterns', async () => {
      const actualFs =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );

      const mockReaddir = vi.fn(
        async (
          path: string,
          _options?: { withFileTypes: boolean },
        ): Promise<Dirent[]> => {
          if (nodePath.normalize(path) === nodePath.normalize('/policies')) {
            return [
              {
                name: 'invalid.toml',
                isFile: () => true,
                isDirectory: () => false,
              } as Dirent,
            ];
          }
          return [];
        },
      );

      const mockReadFile = vi.fn(async (path: string): Promise<string> => {
        if (
          nodePath.normalize(path) ===
          nodePath.normalize(nodePath.join('/policies', 'invalid.toml'))
        ) {
          return `
[[rule]]
toolName = "run_shell_command"
commandRegex = "git (status|branch"
decision = "allow"
priority = 100
`;
        }
        throw new Error('File not found');
      });

      vi.doMock('node:fs/promises', () => ({
        ...actualFs,
        default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
        readFile: mockReadFile,
        readdir: mockReaddir,
      }));

      const { loadPoliciesFromToml: load } = await import(
        './policy-toml-loader.js'
      );

      const getPolicyTier = (_dir: string) => 1;
      const result = await load(
        ApprovalMode.DEFAULT,
        ['/policies'],
        getPolicyTier,
      );

      expect(result.rules).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].errorType).toBe('regex_compilation');
      expect(result.errors[0].details).toContain('git (status|branch');
    });

    it('should escape regex special characters in commandPrefix', async () => {
      const actualFs =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );

      const mockReaddir = vi.fn(
        async (
          path: string,
          _options?: { withFileTypes: boolean },
        ): Promise<Dirent[]> => {
          if (nodePath.normalize(path) === nodePath.normalize('/policies')) {
            return [
              {
                name: 'shell.toml',
                isFile: () => true,
                isDirectory: () => false,
              } as Dirent,
            ];
          }
          return [];
        },
      );

      const mockReadFile = vi.fn(async (path: string): Promise<string> => {
        if (
          nodePath.normalize(path) ===
          nodePath.normalize(nodePath.join('/policies', 'shell.toml'))
        ) {
          return `
[[rule]]
toolName = "run_shell_command"
commandPrefix = "git log *.txt"
decision = "allow"
priority = 100
`;
        }
        throw new Error('File not found');
      });

      vi.doMock('node:fs/promises', () => ({
        ...actualFs,
        default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
        readFile: mockReadFile,
        readdir: mockReaddir,
      }));

      const { loadPoliciesFromToml: load } = await import(
        './policy-toml-loader.js'
      );

      const getPolicyTier = (_dir: string) => 1;
      const result = await load(
        ApprovalMode.DEFAULT,
        ['/policies'],
        getPolicyTier,
      );

      expect(result.rules).toHaveLength(1);
      // Should match literal asterisk, not wildcard
      expect(
        result.rules[0].argsPattern?.test('{"command":"git log *.txt"}'),
      ).toBe(true);
      expect(
        result.rules[0].argsPattern?.test('{"command":"git log a.txt"}'),
      ).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle non-existent directory gracefully', async () => {
      const actualFs =
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        );

      const mockReaddir = vi.fn(async (_path: string): Promise<Dirent[]> => {
        const error: NodeJS.ErrnoException = new Error('ENOENT');
        error.code = 'ENOENT';
        throw error;
      });

      vi.doMock('node:fs/promises', () => ({
        ...actualFs,
        default: { ...actualFs, readdir: mockReaddir },
        readdir: mockReaddir,
      }));

      const { loadPoliciesFromToml: load } = await import(
        './policy-toml-loader.js'
      );

      const getPolicyTier = (_dir: string) => 1;
      const result = await load(
        ApprovalMode.DEFAULT,
        ['/non-existent'],
        getPolicyTier,
      );

      // Should not error for missing directories
      expect(result.rules).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
