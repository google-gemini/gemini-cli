/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import nodePath from 'node:path';

import type { Settings } from './settings.js';
import {
  ApprovalMode,
  PolicyDecision,
  WEB_FETCH_TOOL_NAME,
} from '@google/gemini-cli-core';

afterEach(() => {
  vi.clearAllMocks();
});

describe('createPolicyEngineConfig', () => {
  it('should return ASK_USER for write tools and ALLOW for read-only tools by default', async () => {
    const actualFs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );

    const mockReaddir = vi.fn(
      async (
        path: string | Buffer | URL,
        options?: Parameters<typeof actualFs.readdir>[1],
      ) => {
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies'))
        ) {
          // Return empty array for user policies
          return [] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
        }
        return actualFs.readdir(
          path,
          options as Parameters<typeof actualFs.readdir>[1],
        );
      },
    );

    vi.doMock('node:fs/promises', () => ({
      ...actualFs,
      default: { ...actualFs, readdir: mockReaddir },
      readdir: mockReaddir,
    }));

    vi.resetModules();
    const { createPolicyEngineConfig } = await import('./policy.js');

    const settings: Settings = {};
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );
    expect(config.defaultDecision).toBe(PolicyDecision.ASK_USER);
    // The order of the rules is not guaranteed, so we sort them by tool name.
    config.rules?.sort((a, b) =>
      (a.toolName ?? '').localeCompare(b.toolName ?? ''),
    );
    // Default policies are transformed to tier 1: 1 + priority/1000
    expect(config.rules).toEqual([
      {
        toolName: 'glob',
        decision: PolicyDecision.ALLOW,
        priority: 1.05, // 1 + 50/1000
      },
      {
        toolName: 'google_web_search',
        decision: PolicyDecision.ALLOW,
        priority: 1.05,
      },
      {
        toolName: 'list_directory',
        decision: PolicyDecision.ALLOW,
        priority: 1.05,
      },
      {
        toolName: 'read_file',
        decision: PolicyDecision.ALLOW,
        priority: 1.05,
      },
      {
        toolName: 'read_many_files',
        decision: PolicyDecision.ALLOW,
        priority: 1.05,
      },
      {
        toolName: 'replace',
        decision: PolicyDecision.ASK_USER,
        priority: 1.01, // 1 + 10/1000
      },
      {
        toolName: 'run_shell_command',
        decision: PolicyDecision.ASK_USER,
        priority: 1.01,
      },
      {
        toolName: 'save_memory',
        decision: PolicyDecision.ASK_USER,
        priority: 1.01,
      },
      {
        toolName: 'search_file_content',
        decision: PolicyDecision.ALLOW,
        priority: 1.05,
      },
      {
        toolName: 'web_fetch',
        decision: PolicyDecision.ASK_USER,
        priority: 1.01,
      },
      {
        toolName: 'write_file',
        decision: PolicyDecision.ASK_USER,
        priority: 1.01,
      },
    ]);

    vi.doUnmock('node:fs/promises');
  });

  it('should allow tools in tools.allowed', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {
      tools: { allowed: ['run_shell_command'] },
    };
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );
    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBeCloseTo(2.3, 5); // Command line allow
  });

  it('should deny tools in tools.exclude', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {
      tools: { exclude: ['run_shell_command'] },
    };
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );
    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.DENY,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBeCloseTo(2.4, 5); // Command line exclude
  });

  it('should allow tools from allowed MCP servers', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {
      mcp: { allowed: ['my-server'] },
    };
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );
    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'my-server__*' && r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(2.1); // MCP allowed server
  });

  it('should deny tools from excluded MCP servers', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {
      mcp: { excluded: ['my-server'] },
    };
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );
    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'my-server__*' && r.decision === PolicyDecision.DENY,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(2.9); // MCP excluded server
  });

  it('should allow tools from trusted MCP servers', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {
      mcpServers: {
        'trusted-server': {
          command: 'node',
          args: ['server.js'],
          trust: true,
        },
        'untrusted-server': {
          command: 'node',
          args: ['server.js'],
          trust: false,
        },
      },
    };
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    const trustedRule = config.rules?.find(
      (r) =>
        r.toolName === 'trusted-server__*' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(trustedRule).toBeDefined();
    expect(trustedRule?.priority).toBe(2.2); // MCP trusted server

    // Untrusted server should not have an allow rule
    const untrustedRule = config.rules?.find(
      (r) =>
        r.toolName === 'untrusted-server__*' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(untrustedRule).toBeUndefined();
  });

  it('should handle multiple MCP server configurations together', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {
      mcp: {
        allowed: ['allowed-server'],
        excluded: ['excluded-server'],
      },
      mcpServers: {
        'trusted-server': {
          command: 'node',
          args: ['server.js'],
          trust: true,
        },
      },
    };
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    // Check allowed server
    const allowedRule = config.rules?.find(
      (r) =>
        r.toolName === 'allowed-server__*' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(allowedRule).toBeDefined();
    expect(allowedRule?.priority).toBe(2.1); // MCP allowed server

    // Check trusted server
    const trustedRule = config.rules?.find(
      (r) =>
        r.toolName === 'trusted-server__*' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(trustedRule).toBeDefined();
    expect(trustedRule?.priority).toBe(2.2); // MCP trusted server

    // Check excluded server
    const excludedRule = config.rules?.find(
      (r) =>
        r.toolName === 'excluded-server__*' &&
        r.decision === PolicyDecision.DENY,
    );
    expect(excludedRule).toBeDefined();
    expect(excludedRule?.priority).toBe(2.9); // MCP excluded server
  });

  it('should allow all tools in YOLO mode', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {};
    const config = await createPolicyEngineConfig(settings, ApprovalMode.YOLO);
    const rule = config.rules?.find(
      (r) => r.decision === PolicyDecision.ALLOW && !r.toolName,
    );
    expect(rule).toBeDefined();
    // Priority 999 in default tier → 1.999
    expect(rule?.priority).toBeCloseTo(1.999, 5);
  });

  it('should allow edit tool in AUTO_EDIT mode', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {};
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.AUTO_EDIT,
    );
    const rule = config.rules?.find(
      (r) => r.toolName === 'replace' && r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    // Priority 15 in default tier → 1.015
    expect(rule?.priority).toBeCloseTo(1.015, 5);
  });

  it('should prioritize exclude over allow', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {
      tools: { allowed: ['run_shell_command'], exclude: ['run_shell_command'] },
    };
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );
    const denyRule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.DENY,
    );
    const allowRule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(denyRule).toBeDefined();
    expect(allowRule).toBeDefined();
    expect(denyRule!.priority).toBeGreaterThan(allowRule!.priority!);
  });

  it('should prioritize specific tool allows over MCP server excludes', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {
      mcp: { excluded: ['my-server'] },
      tools: { allowed: ['my-server__specific-tool'] },
    };
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    const serverDenyRule = config.rules?.find(
      (r) =>
        r.toolName === 'my-server__*' && r.decision === PolicyDecision.DENY,
    );
    const toolAllowRule = config.rules?.find(
      (r) =>
        r.toolName === 'my-server__specific-tool' &&
        r.decision === PolicyDecision.ALLOW,
    );

    expect(serverDenyRule).toBeDefined();
    expect(serverDenyRule?.priority).toBe(2.9); // MCP excluded server
    expect(toolAllowRule).toBeDefined();
    expect(toolAllowRule?.priority).toBeCloseTo(2.3, 5); // Command line allow

    // Server deny (2.9) has higher priority than tool allow (2.3),
    // so server deny wins (this is expected behavior - server-level blocks are security critical)
  });

  it('should handle MCP server allows and tool excludes', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {
      mcp: { allowed: ['my-server'] },
      mcpServers: {
        'my-server': {
          command: 'node',
          args: ['server.js'],
          trust: true,
        },
      },
      tools: { exclude: ['my-server__dangerous-tool'] },
    };
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    const serverAllowRule = config.rules?.find(
      (r) =>
        r.toolName === 'my-server__*' && r.decision === PolicyDecision.ALLOW,
    );
    const toolDenyRule = config.rules?.find(
      (r) =>
        r.toolName === 'my-server__dangerous-tool' &&
        r.decision === PolicyDecision.DENY,
    );

    expect(serverAllowRule).toBeDefined();
    expect(toolDenyRule).toBeDefined();
    // Command line exclude (2.4) has higher priority than MCP server trust (2.2)
    // This is the correct behavior - specific exclusions should beat general server trust
    expect(toolDenyRule!.priority).toBeGreaterThan(serverAllowRule!.priority!);
  });

  it('should handle complex priority scenarios correctly', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {
      tools: {
        autoAccept: true, // Not used in policy system (modes handle this)
        allowed: ['my-server__tool1', 'other-tool'], // Priority 2.3
        exclude: ['my-server__tool2', 'glob'], // Priority 2.4
      },
      mcp: {
        allowed: ['allowed-server'], // Priority 2.1
        excluded: ['excluded-server'], // Priority 2.9
      },
      mcpServers: {
        'trusted-server': {
          command: 'node',
          args: ['server.js'],
          trust: true, // Priority 90
        },
      },
    };
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    // Verify glob is denied even though autoAccept would allow it
    const globDenyRule = config.rules?.find(
      (r) => r.toolName === 'glob' && r.decision === PolicyDecision.DENY,
    );
    const globAllowRule = config.rules?.find(
      (r) => r.toolName === 'glob' && r.decision === PolicyDecision.ALLOW,
    );
    expect(globDenyRule).toBeDefined();
    expect(globAllowRule).toBeDefined();
    // Deny from settings (user tier)
    expect(globDenyRule!.priority).toBeCloseTo(2.4, 5); // Command line exclude
    // Allow from default TOML: 1 + 50/1000 = 1.05
    expect(globAllowRule!.priority).toBeCloseTo(1.05, 5);

    // Verify all priority levels are correct
    const priorities = config.rules
      ?.map((r) => ({
        tool: r.toolName,
        decision: r.decision,
        priority: r.priority,
      }))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    // Check that the highest priority items are the excludes (user tier: 2.4)
    const highestPriorityExcludes = priorities?.filter(
      (p) => Math.abs(p.priority! - 2.4) < 0.01,
    );
    expect(
      highestPriorityExcludes?.every((p) => p.decision === PolicyDecision.DENY),
    ).toBe(true);
  });

  it('should handle MCP servers with undefined trust property', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {
      mcpServers: {
        'no-trust-property': {
          command: 'node',
          args: ['server.js'],
          // trust property is undefined/missing
        },
        'explicit-false': {
          command: 'node',
          args: ['server.js'],
          trust: false,
        },
      },
    };
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    // Neither server should have an allow rule
    const noTrustRule = config.rules?.find(
      (r) =>
        r.toolName === 'no-trust-property__*' &&
        r.decision === PolicyDecision.ALLOW,
    );
    const explicitFalseRule = config.rules?.find(
      (r) =>
        r.toolName === 'explicit-false__*' &&
        r.decision === PolicyDecision.ALLOW,
    );

    expect(noTrustRule).toBeUndefined();
    expect(explicitFalseRule).toBeUndefined();
  });

  it('should have YOLO allow-all rule beat write tool rules in YOLO mode', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {
      tools: { exclude: ['dangerous-tool'] },
    };
    const config = await createPolicyEngineConfig(settings, ApprovalMode.YOLO);

    // Should have the wildcard allow rule
    const wildcardRule = config.rules?.find(
      (r) => !r.toolName && r.decision === PolicyDecision.ALLOW,
    );
    expect(wildcardRule).toBeDefined();
    // Priority 999 in default tier → 1.999
    expect(wildcardRule?.priority).toBeCloseTo(1.999, 5);

    // Write tool ASK_USER rules are present (no modes restriction now)
    const writeToolRules = config.rules?.filter(
      (r) =>
        [
          'replace',
          'save_memory',
          'run_shell_command',
          'write_file',
          WEB_FETCH_TOOL_NAME,
        ].includes(r.toolName || '') && r.decision === PolicyDecision.ASK_USER,
    );
    expect(writeToolRules).toBeDefined();

    // But YOLO allow-all rule has higher priority than all write tool rules
    writeToolRules?.forEach((writeRule) => {
      expect(wildcardRule!.priority).toBeGreaterThan(writeRule.priority!);
    });

    // Should still have the exclude rule (from settings, user tier)
    const excludeRule = config.rules?.find(
      (r) =>
        r.toolName === 'dangerous-tool' && r.decision === PolicyDecision.DENY,
    );
    expect(excludeRule).toBeDefined();
    expect(excludeRule?.priority).toBeCloseTo(2.4, 5); // Command line exclude
  });

  it('should handle combination of trusted server and excluded server for same name', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {
      mcpServers: {
        'conflicted-server': {
          command: 'node',
          args: ['server.js'],
          trust: true, // Priority 90
        },
      },
      mcp: {
        excluded: ['conflicted-server'], // Priority 195
      },
    };
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    // Both rules should exist
    const trustRule = config.rules?.find(
      (r) =>
        r.toolName === 'conflicted-server__*' &&
        r.decision === PolicyDecision.ALLOW,
    );
    const excludeRule = config.rules?.find(
      (r) =>
        r.toolName === 'conflicted-server__*' &&
        r.decision === PolicyDecision.DENY,
    );

    expect(trustRule).toBeDefined();
    expect(trustRule?.priority).toBe(2.2); // MCP trusted server
    expect(excludeRule).toBeDefined();
    expect(excludeRule?.priority).toBe(2.9); // MCP excluded server

    // Exclude (195) should win over trust (90) when evaluated
  });

  it('should handle all approval modes correctly', async () => {
    const { createPolicyEngineConfig } = await import('./policy.js');
    const settings: Settings = {};

    // Test DEFAULT mode
    const defaultConfig = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );
    expect(defaultConfig.defaultDecision).toBe(PolicyDecision.ASK_USER);
    expect(
      defaultConfig.rules?.find(
        (r) => !r.toolName && r.decision === PolicyDecision.ALLOW,
      ),
    ).toBeUndefined();

    // Test YOLO mode
    const yoloConfig = await createPolicyEngineConfig(
      settings,
      ApprovalMode.YOLO,
    );
    expect(yoloConfig.defaultDecision).toBe(PolicyDecision.ASK_USER);
    const yoloWildcard = yoloConfig.rules?.find(
      (r) => !r.toolName && r.decision === PolicyDecision.ALLOW,
    );
    expect(yoloWildcard).toBeDefined();
    // Priority 999 in default tier → 1.999
    expect(yoloWildcard?.priority).toBeCloseTo(1.999, 5);

    // Test AUTO_EDIT mode
    const autoEditConfig = await createPolicyEngineConfig(
      settings,
      ApprovalMode.AUTO_EDIT,
    );
    expect(autoEditConfig.defaultDecision).toBe(PolicyDecision.ASK_USER);
    const editRule = autoEditConfig.rules?.find(
      (r) => r.toolName === 'replace' && r.decision === PolicyDecision.ALLOW,
    );
    expect(editRule).toBeDefined();
    // Priority 15 in default tier → 1.015
    expect(editRule?.priority).toBeCloseTo(1.015, 5);
  });

  it('should support argsPattern in policy rules', async () => {
    const actualFs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );

    const mockReaddir = vi.fn(
      async (
        path: string | Buffer | URL,
        options?: Parameters<typeof actualFs.readdir>[1],
      ) => {
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies'))
        ) {
          return [
            {
              name: 'write.toml',
              isFile: () => true,
              isDirectory: () => false,
            },
          ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
        }
        return actualFs.readdir(
          path,
          options as Parameters<typeof actualFs.readdir>[1],
        );
      },
    );

    const mockReadFile = vi.fn(
      async (
        path: Parameters<typeof actualFs.readFile>[0],
        options: Parameters<typeof actualFs.readFile>[1],
      ) => {
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies/write.toml'))
        ) {
          return `
[[rule]]
toolName = "run_shell_command"
argsPattern = "\\"command\\":\\"git (status|diff|log)\\""
decision = "allow"
priority = 150
`;
        }
        return actualFs.readFile(path, options);
      },
    );

    vi.doMock('node:fs/promises', () => ({
      ...actualFs,
      default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
      readFile: mockReadFile,
      readdir: mockReaddir,
    }));

    vi.resetModules();
    const { createPolicyEngineConfig } = await import('./policy.js');

    const settings: Settings = {};
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    // Priority 150 in user tier → 2.150
    expect(rule?.priority).toBeCloseTo(2.15, 5);
    expect(rule?.argsPattern).toBeInstanceOf(RegExp);
    expect(rule?.argsPattern?.test('{"command":"git status"}')).toBe(true);
    expect(rule?.argsPattern?.test('{"command":"git diff"}')).toBe(true);
    expect(rule?.argsPattern?.test('{"command":"git log"}')).toBe(true);
    expect(rule?.argsPattern?.test('{"command":"git commit"}')).toBe(false);
    expect(rule?.argsPattern?.test('{"command":"git push"}')).toBe(false);

    vi.doUnmock('node:fs/promises');
  });

  it('should load and apply user-defined policies', async () => {
    const actualFs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );

    const mockReaddir = vi.fn(
      async (
        path: string | Buffer | URL,
        options?: Parameters<typeof actualFs.readdir>[1],
      ) => {
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies'))
        ) {
          return [
            {
              name: 'write.toml',
              isFile: () => true,
              isDirectory: () => false,
            },
          ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
        }
        return actualFs.readdir(
          path,
          options as Parameters<typeof actualFs.readdir>[1],
        );
      },
    );

    const mockReadFile = vi.fn(
      async (
        path: Parameters<typeof actualFs.readFile>[0],
        options: Parameters<typeof actualFs.readFile>[1],
      ) => {
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies/write.toml'))
        ) {
          return `
[[rule]]
toolName = "run_shell_command"
decision = "allow"
priority = 150
`;
        }
        return actualFs.readFile(path, options);
      },
    );

    vi.doMock('node:fs/promises', () => ({
      ...actualFs,
      default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
      readFile: mockReadFile,
      readdir: mockReaddir,
    }));

    vi.resetModules();
    const { createPolicyEngineConfig } = await import('./policy.js');

    const settings: Settings = {};
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    // Priority 150 in user tier → 2.150
    expect(rule?.priority).toBeCloseTo(2.15, 5);

    vi.doUnmock('node:fs/promises');
  });

  it('should load and apply admin policies over user and default policies', async () => {
    process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'] = '/tmp/admin/settings.json';

    const actualFs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );

    const mockReaddir = vi.fn(
      async (
        path: string | Buffer | URL,
        options?: Parameters<typeof actualFs.readdir>[1],
      ) => {
        if (typeof path === 'string') {
          if (
            nodePath
              .normalize(path)
              .includes(nodePath.normalize('/tmp/admin/policies'))
          ) {
            return [
              {
                name: 'write.toml',
                isFile: () => true,
                isDirectory: () => false,
              },
            ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
          }
          if (
            nodePath
              .normalize(path)
              .includes(nodePath.normalize('.gemini/policies'))
          ) {
            return [
              {
                name: 'write.toml',
                isFile: () => true,
                isDirectory: () => false,
              },
            ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
          }
        }
        return actualFs.readdir(
          path,
          options as Parameters<typeof actualFs.readdir>[1],
        );
      },
    );

    const mockReadFile = vi.fn(
      async (
        path: Parameters<typeof actualFs.readFile>[0],
        options: Parameters<typeof actualFs.readFile>[1],
      ) => {
        if (
          typeof path === 'string' &&
          (nodePath
            .normalize(path)
            .includes(nodePath.normalize('/tmp/admin/policies/write.toml')) ||
            path.endsWith('tmp/admin/policies/write.toml'))
        ) {
          return `
[[rule]]
toolName = "run_shell_command"
decision = "deny"
priority = 200
`;
        }
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies/write.toml'))
        ) {
          return `
[[rule]]
toolName = "run_shell_command"
decision = "allow"
priority = 150
`;
        }
        return actualFs.readFile(path, options);
      },
    );

    vi.doMock('node:fs/promises', () => ({
      ...actualFs,
      default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
      readFile: mockReadFile,
      readdir: mockReaddir,
    }));

    vi.resetModules();
    const { createPolicyEngineConfig } = await import('./policy.js');

    const settings: Settings = {};
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    const denyRule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.DENY,
    );
    const allowRule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW,
    );

    expect(denyRule).toBeDefined();
    // Priority 200 in admin tier → 3.200
    expect(denyRule?.priority).toBeCloseTo(3.2, 5);
    expect(allowRule).toBeDefined();
    // Priority 150 in user tier → 2.150
    expect(allowRule?.priority).toBeCloseTo(2.15, 5);
    expect(denyRule!.priority).toBeGreaterThan(allowRule!.priority!);

    delete process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];
    vi.doUnmock('node:fs/promises');
  });

  it('should apply priority bands to ensure Admin > User > Default hierarchy', async () => {
    process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'] = '/tmp/admin/settings.json';

    const actualFs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );

    const mockReaddir = vi.fn(
      async (
        path: string | Buffer | URL,
        options?: Parameters<typeof actualFs.readdir>[1],
      ) => {
        if (typeof path === 'string') {
          if (
            nodePath
              .normalize(path)
              .includes(nodePath.normalize('/tmp/admin/policies'))
          ) {
            return [
              {
                name: 'admin-policy.toml',
                isFile: () => true,
                isDirectory: () => false,
              },
            ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
          }
          if (
            nodePath
              .normalize(path)
              .includes(nodePath.normalize('.gemini/policies'))
          ) {
            return [
              {
                name: 'user-policy.toml',
                isFile: () => true,
                isDirectory: () => false,
              },
            ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
          }
        }
        return actualFs.readdir(
          path,
          options as Parameters<typeof actualFs.readdir>[1],
        );
      },
    );

    const mockReadFile = vi.fn(
      async (
        path: Parameters<typeof actualFs.readFile>[0],
        options: Parameters<typeof actualFs.readFile>[1],
      ) => {
        if (typeof path === 'string') {
          // Admin policy with low priority (100)
          if (
            nodePath
              .normalize(path)
              .includes(
                nodePath.normalize('/tmp/admin/policies/admin-policy.toml'),
              )
          ) {
            return `
[[rule]]
toolName = "run_shell_command"
decision = "deny"
priority = 100
`;
          }
          // User policy with high priority (900)
          if (
            nodePath
              .normalize(path)
              .includes(nodePath.normalize('.gemini/policies/user-policy.toml'))
          ) {
            return `
[[rule]]
toolName = "run_shell_command"
decision = "allow"
priority = 900
`;
          }
        }
        return actualFs.readFile(path, options);
      },
    );

    vi.doMock('node:fs/promises', () => ({
      ...actualFs,
      default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
      readFile: mockReadFile,
      readdir: mockReaddir,
    }));

    vi.resetModules();
    const { createPolicyEngineConfig } = await import('./policy.js');

    const settings: Settings = {};
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    const adminRule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.DENY,
    );
    const userRule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW,
    );

    expect(adminRule).toBeDefined();
    expect(userRule).toBeDefined();

    // Admin priority should be 3.100 (tier 3 + 100/1000)
    expect(adminRule?.priority).toBeCloseTo(3.1, 5);
    // User priority should be 2.900 (tier 2 + 900/1000)
    expect(userRule?.priority).toBeCloseTo(2.9, 5);

    // Admin rule with low priority should still beat user rule with high priority
    expect(adminRule!.priority).toBeGreaterThan(userRule!.priority!);

    delete process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];
    vi.doUnmock('node:fs/promises');
  });

  it('should apply correct priority transformations for each tier', async () => {
    process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'] = '/tmp/admin/settings.json';

    const actualFs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );

    const mockReaddir = vi.fn(
      async (
        path: string | Buffer | URL,
        options?: Parameters<typeof actualFs.readdir>[1],
      ) => {
        if (typeof path === 'string') {
          if (
            nodePath
              .normalize(path)
              .includes(nodePath.normalize('/tmp/admin/policies'))
          ) {
            return [
              {
                name: 'admin.toml',
                isFile: () => true,
                isDirectory: () => false,
              },
            ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
          }
          if (
            nodePath
              .normalize(path)
              .includes(nodePath.normalize('.gemini/policies'))
          ) {
            return [
              {
                name: 'user.toml',
                isFile: () => true,
                isDirectory: () => false,
              },
            ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
          }
        }
        return actualFs.readdir(
          path,
          options as Parameters<typeof actualFs.readdir>[1],
        );
      },
    );

    const mockReadFile = vi.fn(
      async (
        path: Parameters<typeof actualFs.readFile>[0],
        options: Parameters<typeof actualFs.readFile>[1],
      ) => {
        if (typeof path === 'string') {
          if (
            nodePath
              .normalize(path)
              .includes(nodePath.normalize('/tmp/admin/policies/admin.toml'))
          ) {
            return `
[[rule]]
toolName = "admin-tool"
decision = "allow"
priority = 500
`;
          }
          if (
            nodePath
              .normalize(path)
              .includes(nodePath.normalize('.gemini/policies/user.toml'))
          ) {
            return `
[[rule]]
toolName = "user-tool"
decision = "allow"
priority = 500
`;
          }
        }
        return actualFs.readFile(path, options);
      },
    );

    vi.doMock('node:fs/promises', () => ({
      ...actualFs,
      default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
      readFile: mockReadFile,
      readdir: mockReaddir,
    }));

    vi.resetModules();
    const { createPolicyEngineConfig } = await import('./policy.js');

    const settings: Settings = {};
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    const adminRule = config.rules?.find((r) => r.toolName === 'admin-tool');
    const userRule = config.rules?.find((r) => r.toolName === 'user-tool');

    expect(adminRule).toBeDefined();
    expect(userRule).toBeDefined();

    // Priority 500 in admin tier → 3.500
    expect(adminRule?.priority).toBeCloseTo(3.5, 5);
    // Priority 500 in user tier → 2.500
    expect(userRule?.priority).toBeCloseTo(2.5, 5);

    delete process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];
    vi.doUnmock('node:fs/promises');
  });

  it('should support array syntax for toolName in TOML policies', async () => {
    const actualFs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );

    const mockReaddir = vi.fn(
      async (
        path: string | Buffer | URL,
        options?: Parameters<typeof actualFs.readdir>[1],
      ) => {
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies'))
        ) {
          return [
            {
              name: 'array-test.toml',
              isFile: () => true,
              isDirectory: () => false,
            },
          ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
        }
        return actualFs.readdir(
          path,
          options as Parameters<typeof actualFs.readdir>[1],
        );
      },
    );

    const mockReadFile = vi.fn(
      async (
        path: Parameters<typeof actualFs.readFile>[0],
        options: Parameters<typeof actualFs.readFile>[1],
      ) => {
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies/array-test.toml'))
        ) {
          return `
# Test array syntax for toolName
[[rule]]
toolName = ["tool1", "tool2", "tool3"]
decision = "allow"
priority = 100

# Test array syntax with mcpName
[[rule]]
mcpName = "google-workspace"
toolName = ["calendar.findFreeTime", "calendar.getEvent", "calendar.list"]
decision = "allow"
priority = 150
`;
        }
        return actualFs.readFile(
          path,
          options as Parameters<typeof actualFs.readFile>[1],
        );
      },
    );

    vi.doMock('node:fs/promises', () => ({
      ...actualFs,
      default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
      readFile: mockReadFile,
      readdir: mockReaddir,
    }));

    vi.resetModules();
    const { createPolicyEngineConfig } = await import('./policy.js');

    const settings: Settings = {};
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    // Should create separate rules for each tool in the array
    const tool1Rule = config.rules?.find((r) => r.toolName === 'tool1');
    const tool2Rule = config.rules?.find((r) => r.toolName === 'tool2');
    const tool3Rule = config.rules?.find((r) => r.toolName === 'tool3');

    expect(tool1Rule).toBeDefined();
    expect(tool2Rule).toBeDefined();
    expect(tool3Rule).toBeDefined();

    // All should have the same decision and priority
    expect(tool1Rule?.decision).toBe(PolicyDecision.ALLOW);
    expect(tool2Rule?.decision).toBe(PolicyDecision.ALLOW);
    expect(tool3Rule?.decision).toBe(PolicyDecision.ALLOW);

    // Priority 100 in user tier → 2.100
    expect(tool1Rule?.priority).toBeCloseTo(2.1, 5);
    expect(tool2Rule?.priority).toBeCloseTo(2.1, 5);
    expect(tool3Rule?.priority).toBeCloseTo(2.1, 5);

    // MCP tools should have composite names
    const calendarFreeTime = config.rules?.find(
      (r) => r.toolName === 'google-workspace__calendar.findFreeTime',
    );
    const calendarGetEvent = config.rules?.find(
      (r) => r.toolName === 'google-workspace__calendar.getEvent',
    );
    const calendarList = config.rules?.find(
      (r) => r.toolName === 'google-workspace__calendar.list',
    );

    expect(calendarFreeTime).toBeDefined();
    expect(calendarGetEvent).toBeDefined();
    expect(calendarList).toBeDefined();

    // All should have the same decision and priority
    expect(calendarFreeTime?.decision).toBe(PolicyDecision.ALLOW);
    expect(calendarGetEvent?.decision).toBe(PolicyDecision.ALLOW);
    expect(calendarList?.decision).toBe(PolicyDecision.ALLOW);

    // Priority 150 in user tier → 2.150
    expect(calendarFreeTime?.priority).toBeCloseTo(2.15, 5);
    expect(calendarGetEvent?.priority).toBeCloseTo(2.15, 5);
    expect(calendarList?.priority).toBeCloseTo(2.15, 5);

    vi.doUnmock('node:fs/promises');
  });

  it('should support commandPrefix syntax for shell commands', async () => {
    const actualFs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );

    const mockReaddir = vi.fn(
      async (
        path: string | Buffer | URL,
        options?: Parameters<typeof actualFs.readdir>[1],
      ) => {
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies'))
        ) {
          return [
            {
              name: 'shell.toml',
              isFile: () => true,
              isDirectory: () => false,
            },
          ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
        }
        return actualFs.readdir(
          path,
          options as Parameters<typeof actualFs.readdir>[1],
        );
      },
    );

    const mockReadFile = vi.fn(
      async (
        path: Parameters<typeof actualFs.readFile>[0],
        options: Parameters<typeof actualFs.readFile>[1],
      ) => {
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies/shell.toml'))
        ) {
          return `
[[rule]]
toolName = "run_shell_command"
commandPrefix = "git status"
decision = "allow"
priority = 100
`;
        }
        return actualFs.readFile(path, options);
      },
    );

    vi.doMock('node:fs/promises', () => ({
      ...actualFs,
      default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
      readFile: mockReadFile,
      readdir: mockReaddir,
    }));

    vi.resetModules();
    const { createPolicyEngineConfig } = await import('./policy.js');

    const settings: Settings = {};
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBeCloseTo(2.1, 5);
    expect(rule?.argsPattern).toBeInstanceOf(RegExp);
    // Should match commands starting with "git status"
    expect(rule?.argsPattern?.test('{"command":"git status"}')).toBe(true);
    expect(rule?.argsPattern?.test('{"command":"git status --short"}')).toBe(
      true,
    );
    // Should not match other commands
    expect(rule?.argsPattern?.test('{"command":"git branch"}')).toBe(false);

    vi.doUnmock('node:fs/promises');
  });

  it('should support array syntax for commandPrefix', async () => {
    const actualFs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );

    const mockReaddir = vi.fn(
      async (
        path: string | Buffer | URL,
        options?: Parameters<typeof actualFs.readdir>[1],
      ) => {
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies'))
        ) {
          return [
            {
              name: 'shell.toml',
              isFile: () => true,
              isDirectory: () => false,
            },
          ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
        }
        return actualFs.readdir(
          path,
          options as Parameters<typeof actualFs.readdir>[1],
        );
      },
    );

    const mockReadFile = vi.fn(
      async (
        path: Parameters<typeof actualFs.readFile>[0],
        options: Parameters<typeof actualFs.readFile>[1],
      ) => {
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies/shell.toml'))
        ) {
          return `
[[rule]]
toolName = "run_shell_command"
commandPrefix = ["git status", "git branch", "git log"]
decision = "allow"
priority = 100
`;
        }
        return actualFs.readFile(path, options);
      },
    );

    vi.doMock('node:fs/promises', () => ({
      ...actualFs,
      default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
      readFile: mockReadFile,
      readdir: mockReaddir,
    }));

    vi.resetModules();
    const { createPolicyEngineConfig } = await import('./policy.js');

    const settings: Settings = {};
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    const rules = config.rules?.filter(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW,
    );

    // Should create 3 rules (one for each prefix)
    expect(rules?.length).toBe(3);

    // All rules should have the same priority and decision
    rules?.forEach((rule) => {
      expect(rule.priority).toBeCloseTo(2.1, 5);
      expect(rule.decision).toBe(PolicyDecision.ALLOW);
    });

    // Test that each prefix pattern works
    const patterns = rules?.map((r) => r.argsPattern);
    expect(patterns?.some((p) => p?.test('{"command":"git status"}'))).toBe(
      true,
    );
    expect(patterns?.some((p) => p?.test('{"command":"git branch"}'))).toBe(
      true,
    );
    expect(patterns?.some((p) => p?.test('{"command":"git log"}'))).toBe(true);
    // Should not match other commands
    expect(patterns?.some((p) => p?.test('{"command":"git commit"}'))).toBe(
      false,
    );

    vi.doUnmock('node:fs/promises');
  });

  it('should support commandRegex syntax for shell commands', async () => {
    const actualFs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );

    const mockReaddir = vi.fn(
      async (
        path: string | Buffer | URL,
        options?: Parameters<typeof actualFs.readdir>[1],
      ) => {
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies'))
        ) {
          return [
            {
              name: 'shell.toml',
              isFile: () => true,
              isDirectory: () => false,
            },
          ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
        }
        return actualFs.readdir(
          path,
          options as Parameters<typeof actualFs.readdir>[1],
        );
      },
    );

    const mockReadFile = vi.fn(
      async (
        path: Parameters<typeof actualFs.readFile>[0],
        options: Parameters<typeof actualFs.readFile>[1],
      ) => {
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies/shell.toml'))
        ) {
          return `
[[rule]]
toolName = "run_shell_command"
commandRegex = "git (status|branch|log).*"
decision = "allow"
priority = 100
`;
        }
        return actualFs.readFile(path, options);
      },
    );

    vi.doMock('node:fs/promises', () => ({
      ...actualFs,
      default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
      readFile: mockReadFile,
      readdir: mockReaddir,
    }));

    vi.resetModules();
    const { createPolicyEngineConfig } = await import('./policy.js');

    const settings: Settings = {};
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBeCloseTo(2.1, 5);
    expect(rule?.argsPattern).toBeInstanceOf(RegExp);

    // Should match commands matching the regex
    expect(rule?.argsPattern?.test('{"command":"git status"}')).toBe(true);
    expect(rule?.argsPattern?.test('{"command":"git status --short"}')).toBe(
      true,
    );
    expect(rule?.argsPattern?.test('{"command":"git branch"}')).toBe(true);
    expect(rule?.argsPattern?.test('{"command":"git log --all"}')).toBe(true);
    // Should not match commands not in the regex
    expect(rule?.argsPattern?.test('{"command":"git commit"}')).toBe(false);
    expect(rule?.argsPattern?.test('{"command":"git push"}')).toBe(false);

    vi.doUnmock('node:fs/promises');
  });

  it('should escape regex special characters in commandPrefix', async () => {
    const actualFs =
      await vi.importActual<typeof import('node:fs/promises')>(
        'node:fs/promises',
      );

    const mockReaddir = vi.fn(
      async (
        path: string | Buffer | URL,
        options?: Parameters<typeof actualFs.readdir>[1],
      ) => {
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies'))
        ) {
          return [
            {
              name: 'shell.toml',
              isFile: () => true,
              isDirectory: () => false,
            },
          ] as unknown as Awaited<ReturnType<typeof actualFs.readdir>>;
        }
        return actualFs.readdir(
          path,
          options as Parameters<typeof actualFs.readdir>[1],
        );
      },
    );

    const mockReadFile = vi.fn(
      async (
        path: Parameters<typeof actualFs.readFile>[0],
        options: Parameters<typeof actualFs.readFile>[1],
      ) => {
        if (
          typeof path === 'string' &&
          nodePath
            .normalize(path)
            .includes(nodePath.normalize('.gemini/policies/shell.toml'))
        ) {
          return `
[[rule]]
toolName = "run_shell_command"
commandPrefix = "git log *.txt"
decision = "allow"
priority = 100
`;
        }
        return actualFs.readFile(path, options);
      },
    );

    vi.doMock('node:fs/promises', () => ({
      ...actualFs,
      default: { ...actualFs, readFile: mockReadFile, readdir: mockReaddir },
      readFile: mockReadFile,
      readdir: mockReaddir,
    }));

    vi.resetModules();
    const { createPolicyEngineConfig } = await import('./policy.js');

    const settings: Settings = {};
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
    );

    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    // Should match the literal string "git log *.txt" (asterisk is escaped)
    expect(rule?.argsPattern?.test('{"command":"git log *.txt"}')).toBe(true);
    // Should not match "git log a.txt" because * is escaped to literal asterisk
    expect(rule?.argsPattern?.test('{"command":"git log a.txt"}')).toBe(false);

    vi.doUnmock('node:fs/promises');
  });
});
