/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import nodePath from 'node:path';
import { ApprovalMode } from './types.js';
import { isDirectorySecure } from '../utils/security.js';

// Mock dependencies
vi.mock('../utils/security.js', () => ({
  isDirectorySecure: vi.fn().mockResolvedValue({ secure: true }),
}));

describe('Project-Level Policies', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { Storage } = await import('../config/storage.js');
    vi.spyOn(Storage, 'getUserPoliciesDir').mockReturnValue(
      '/mock/user/policies',
    );
    vi.spyOn(Storage, 'getSystemPoliciesDir').mockReturnValue(
      '/mock/system/policies',
    );
    // Ensure security check always returns secure
    vi.mocked(isDirectorySecure).mockResolvedValue({ secure: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.doUnmock('node:fs/promises');
  });

  it('should load project policies with correct priority (Tier 2)', async () => {
    const projectPoliciesDir = '/mock/project/policies';
    const defaultPoliciesDir = '/mock/default/policies';

    // Mock FS
    const actualFs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );

    const mockStat = vi.fn(async (path: string) => {
      if (typeof path === 'string' && path.startsWith('/mock/')) {
        return {
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as Awaited<ReturnType<typeof actualFs.stat>>;
      }
      return actualFs.stat(path);
    });

    // Mock readdir to return a policy file for each tier
    const mockReaddir = vi.fn(async (path: string) => {
      const normalizedPath = nodePath.normalize(path);
      if (normalizedPath.endsWith('default/policies'))
        return [
          {
            name: 'default.toml',
            isFile: () => true,
            isDirectory: () => false,
          },
        ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
      if (normalizedPath.endsWith('user/policies'))
        return [
          { name: 'user.toml', isFile: () => true, isDirectory: () => false },
        ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
      if (normalizedPath.endsWith('project/policies'))
        return [
          {
            name: 'project.toml',
            isFile: () => true,
            isDirectory: () => false,
          },
        ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
      if (normalizedPath.endsWith('system/policies'))
        return [
          { name: 'admin.toml', isFile: () => true, isDirectory: () => false },
        ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
      return [];
    });

    // Mock readFile to return content with distinct priorities/decisions
    const mockReadFile = vi.fn(async (path: string) => {
      if (path.includes('default.toml')) {
        return `[[rule]]
toolName = "test_tool"
decision = "allow"
priority = 10
`; // Tier 1 -> 1.010
      }
      if (path.includes('user.toml')) {
        return `[[rule]]
toolName = "test_tool"
decision = "deny"
priority = 10
`; // Tier 3 -> 3.010
      }
      if (path.includes('project.toml')) {
        return `[[rule]]
toolName = "test_tool"
decision = "allow"
priority = 10
`; // Tier 2 -> 2.010
      }
      if (path.includes('admin.toml')) {
        return `[[rule]]
toolName = "test_tool"
decision = "deny"
priority = 10
`; // Tier 4 -> 4.010
      }
      return '';
    });

    vi.doMock('node:fs/promises', () => ({
      ...actualFs,
      default: {
        ...actualFs,
        readdir: mockReaddir,
        readFile: mockReadFile,
        stat: mockStat,
      },
      readdir: mockReaddir,
      readFile: mockReadFile,
      stat: mockStat,
    }));

    const { createPolicyEngineConfig } = await import('./config.js');

    // Test 1: Project vs User (User should win)
    const config = await createPolicyEngineConfig(
      {},
      ApprovalMode.DEFAULT,
      defaultPoliciesDir,
      projectPoliciesDir,
    );

    const rules = config.rules?.filter((r) => r.toolName === 'test_tool');
    expect(rules).toBeDefined();

    // Check for all 4 rules
    const defaultRule = rules?.find((r) => r.priority === 1.01);
    const projectRule = rules?.find((r) => r.priority === 2.01);
    const userRule = rules?.find((r) => r.priority === 3.01);
    const adminRule = rules?.find((r) => r.priority === 4.01);

    expect(defaultRule).toBeDefined();
    expect(userRule).toBeDefined();
    expect(projectRule).toBeDefined();
    expect(adminRule).toBeDefined();

    // Verify Hierarchy: Admin > User > Project > Default
    expect(adminRule!.priority).toBeGreaterThan(userRule!.priority!);
    expect(userRule!.priority).toBeGreaterThan(projectRule!.priority!);
    expect(projectRule!.priority).toBeGreaterThan(defaultRule!.priority!);
  });

  it('should ignore project policies if projectPoliciesDir is undefined', async () => {
    const defaultPoliciesDir = '/mock/default/policies';

    // Mock FS (simplified)
    const actualFs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );

    const mockStat = vi.fn(async (path: string) => {
      if (typeof path === 'string' && path.startsWith('/mock/')) {
        return {
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as Awaited<ReturnType<typeof actualFs.stat>>;
      }
      return actualFs.stat(path);
    });

    const mockReaddir = vi.fn(async (path: string) => {
      const normalizedPath = nodePath.normalize(path);
      if (normalizedPath.endsWith('default/policies'))
        return [
          {
            name: 'default.toml',
            isFile: () => true,
            isDirectory: () => false,
          },
        ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
      return [];
    });
    const mockReadFile = vi.fn(
      async () => `[[rule]]
toolName="t"
decision="allow"
priority=10`,
    );

    vi.doMock('node:fs/promises', () => ({
      ...actualFs,
      default: {
        ...actualFs,
        readdir: mockReaddir,
        readFile: mockReadFile,
        stat: mockStat,
      },
      readdir: mockReaddir,
      readFile: mockReadFile,
      stat: mockStat,
    }));

    const { createPolicyEngineConfig } = await import('./config.js');

    const config = await createPolicyEngineConfig(
      {},
      ApprovalMode.DEFAULT,
      defaultPoliciesDir,
      undefined, // No project dir
    );

    // Should only have default tier rule (1.01)
    const rules = config.rules;
    expect(rules).toHaveLength(1);
    expect(rules![0].priority).toBe(1.01);
  });

  it('should load project policies and correctly transform to Tier 2', async () => {
    const projectPoliciesDir = '/mock/project/policies';

    // Mock FS
    const actualFs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );

    const mockStat = vi.fn(async (path: string) => {
      if (typeof path === 'string' && path.startsWith('/mock/')) {
        return {
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as Awaited<ReturnType<typeof actualFs.stat>>;
      }
      return actualFs.stat(path);
    });

    const mockReaddir = vi.fn(async (path: string) => {
      const normalizedPath = nodePath.normalize(path);
      if (normalizedPath.endsWith('project/policies'))
        return [
          {
            name: 'project.toml',
            isFile: () => true,
            isDirectory: () => false,
          },
        ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
      return [];
    });
    const mockReadFile = vi.fn(
      async () => `[[rule]]
toolName="p_tool"
decision="allow"
priority=500`,
    );

    vi.doMock('node:fs/promises', () => ({
      ...actualFs,
      default: {
        ...actualFs,
        readdir: mockReaddir,
        readFile: mockReadFile,
        stat: mockStat,
      },
      readdir: mockReaddir,
      readFile: mockReadFile,
      stat: mockStat,
    }));

    const { createPolicyEngineConfig } = await import('./config.js');

    const config = await createPolicyEngineConfig(
      {},
      ApprovalMode.DEFAULT,
      undefined,
      projectPoliciesDir,
    );

    const rule = config.rules?.find((r) => r.toolName === 'p_tool');
    expect(rule).toBeDefined();
    // Project Tier (2) + 500/1000 = 2.5
    expect(rule?.priority).toBe(2.5);
  });
});
