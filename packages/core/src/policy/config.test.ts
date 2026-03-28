/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import nodePath from 'node:path';
import * as fs from 'node:fs/promises';
import { type Dirent, type Stats, type PathLike } from 'node:fs';

import {
  ApprovalMode,
  PolicyDecision,
  InProcessCheckerType,
  type PolicySettings,
} from './types.js';
import { isDirectorySecure } from '../utils/security.js';
import {
  createPolicyEngineConfig,
  clearEmittedPolicyWarnings,
  getPolicyDirectories,
} from './config.js';
import { Storage } from '../config/storage.js';
import * as tomlLoader from './toml-loader.js';
import { coreEvents } from '../utils/events.js';

vi.unmock('../config/storage.js');

vi.mock('../utils/security.js', () => ({
  isDirectorySecure: vi.fn().mockResolvedValue({ secure: true }),
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const mockFs = {
    ...actual,
    readdir: vi.fn(actual.readdir),
    readFile: vi.fn(actual.readFile),
    stat: vi.fn(actual.stat),
    mkdir: vi.fn(actual.mkdir),
    open: vi.fn(actual.open),
    rename: vi.fn(actual.rename),
  };
  return {
    ...mockFs,
    default: mockFs,
  };
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('createPolicyEngineConfig', () => {
  const MOCK_DEFAULT_DIR = '/tmp/mock/default/policies';

  beforeEach(async () => {
    clearEmittedPolicyWarnings();
    // Mock Storage to avoid host environment contamination
    vi.spyOn(Storage, 'getUserPoliciesDir').mockReturnValue(
      '/non/existent/user/policies',
    );
    vi.spyOn(Storage, 'getSystemPoliciesDir').mockReturnValue(
      '/non/existent/system/policies',
    );
    vi.mocked(isDirectorySecure).mockResolvedValue({ secure: true });
  });

  /**
   * Helper to mock a policy file in the filesystem.
   */
  function mockPolicyFile(path: string, content: string) {
    vi.mocked(
      fs.readdir as (path: PathLike) => Promise<string[] | Dirent[]>,
    ).mockImplementation(async (p) => {
      if (nodePath.resolve(p.toString()) === nodePath.dirname(path)) {
        return [
          {
            name: nodePath.basename(path),
            isFile: () => true,
            isDirectory: () => false,
          } as unknown as Dirent,
        ];
      }
      return (
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        )
      ).readdir(p);
    });

    vi.mocked(fs.stat).mockImplementation(async (p) => {
      if (nodePath.resolve(p.toString()) === nodePath.dirname(path)) {
        return {
          isDirectory: () => true,
          isFile: () => false,
        } as unknown as Stats;
      }
      if (nodePath.resolve(p.toString()) === path) {
        return {
          isDirectory: () => false,
          isFile: () => true,
        } as unknown as Stats;
      }
      return (
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        )
      ).stat(p);
    });

    vi.mocked(fs.readFile).mockImplementation(async (p) => {
      if (nodePath.resolve(p.toString()) === path) {
        return content;
      }
      return (
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        )
      ).readFile(p);
    });
  }

  it('should filter out insecure system policy directories', async () => {
    const systemPolicyDir = '/insecure/system/policies';
    vi.spyOn(Storage, 'getSystemPoliciesDir').mockReturnValue(systemPolicyDir);

    vi.mocked(isDirectorySecure).mockImplementation(async (path: string) => {
      if (nodePath.resolve(path) === nodePath.resolve(systemPolicyDir)) {
        return { secure: false, reason: 'Insecure directory' };
      }
      return { secure: true };
    });

    const loadPoliciesSpy = vi
      .spyOn(tomlLoader, 'loadPoliciesFromToml')
      .mockResolvedValue({ rules: [], checkers: [], errors: [] });

    await createPolicyEngineConfig(
      {},
      ApprovalMode.DEFAULT,
      '/tmp/mock/default/policies',
    );

    expect(loadPoliciesSpy).toHaveBeenCalled();
    const calledDirs = loadPoliciesSpy.mock.calls[0][0];
    expect(calledDirs).not.toContain(systemPolicyDir);
    expect(calledDirs).toContain('/non/existent/user/policies');
    expect(calledDirs).toContain('/tmp/mock/default/policies');
  });

  it('should NOT filter out insecure supplemental admin policy directories', async () => {
    const adminPolicyDir = '/insecure/admin/policies';
    vi.mocked(isDirectorySecure).mockImplementation(async (path: string) => {
      if (nodePath.resolve(path) === nodePath.resolve(adminPolicyDir)) {
        return { secure: false, reason: 'Insecure directory' };
      }
      return { secure: true };
    });

    const loadPoliciesSpy = vi
      .spyOn(tomlLoader, 'loadPoliciesFromToml')
      .mockResolvedValue({ rules: [], checkers: [], errors: [] });

    await createPolicyEngineConfig(
      { adminPolicyPaths: [adminPolicyDir] },
      ApprovalMode.DEFAULT,
      '/tmp/mock/default/policies',
    );

    const calledDirs = loadPoliciesSpy.mock.calls[0][0];
    expect(calledDirs).toContain(adminPolicyDir);
    expect(calledDirs).toContain('/non/existent/system/policies');
    expect(calledDirs).toContain('/non/existent/user/policies');
    expect(calledDirs).toContain('/tmp/mock/default/policies');
  });

  it('should return ASK_USER for write tools and ALLOW for read-only tools by default', async () => {
    vi.mocked(
      fs.readdir as (path: PathLike) => Promise<string[]>,
    ).mockResolvedValue([]);

    const config = await createPolicyEngineConfig(
      {},
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );
    expect(config.defaultDecision).toBe(PolicyDecision.ASK_USER);
    expect(config.rules).toEqual([]);
  });

  it('should allow tools in tools.allowed', async () => {
    vi.mocked(
      fs.readdir as (path: PathLike) => Promise<string[]>,
    ).mockResolvedValue([]);
    const config = await createPolicyEngineConfig(
      { tools: { allowed: ['run_shell_command'] } },
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );
    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBeCloseTo(4.3, 5); // Command line allow
  });

  it('should deny tools in tools.exclude', async () => {
    const config = await createPolicyEngineConfig(
      { tools: { exclude: ['run_shell_command'] } },
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );
    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.DENY,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBeCloseTo(4.4, 5); // Command line exclude
  });

  it('should allow tools from allowed MCP servers', async () => {
    const config = await createPolicyEngineConfig(
      { mcp: { allowed: ['my-server'] } },
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );
    const rule = config.rules?.find(
      (r) => r.mcpName === 'my-server' && r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(4.1); // MCP allowed server
  });

  it('should deny tools from excluded MCP servers', async () => {
    const config = await createPolicyEngineConfig(
      { mcp: { excluded: ['my-server'] } },
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );
    const rule = config.rules?.find(
      (r) => r.mcpName === 'my-server' && r.decision === PolicyDecision.DENY,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(4.9); // MCP excluded server
  });

  it('should allow tools from trusted MCP servers', async () => {
    const config = await createPolicyEngineConfig(
      {
        mcpServers: {
          'trusted-server': { trust: true },
          'untrusted-server': { trust: false },
        },
      },
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );

    const trustedRule = config.rules?.find(
      (r) =>
        r.mcpName === 'trusted-server' && r.decision === PolicyDecision.ALLOW,
    );
    expect(trustedRule).toBeDefined();
    expect(trustedRule?.priority).toBe(4.2); // MCP trusted server

    // Untrusted server should not have an allow rule
    const untrustedRule = config.rules?.find(
      (r) =>
        r.mcpName === 'untrusted-server' && r.decision === PolicyDecision.ALLOW,
    );
    expect(untrustedRule).toBeUndefined();
  });

  it('should handle multiple MCP server configurations together', async () => {
    const config = await createPolicyEngineConfig(
      {
        mcp: { allowed: ['allowed-server'], excluded: ['excluded-server'] },
        mcpServers: { 'trusted-server': { trust: true } },
      },
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );

    // Check allowed server
    const allowedRule = config.rules?.find(
      (r) =>
        r.mcpName === 'allowed-server' && r.decision === PolicyDecision.ALLOW,
    );
    expect(allowedRule).toBeDefined();
    expect(allowedRule?.priority).toBe(4.1); // MCP allowed server

    // Check trusted server
    const trustedRule = config.rules?.find(
      (r) =>
        r.mcpName === 'trusted-server' && r.decision === PolicyDecision.ALLOW,
    );
    expect(trustedRule).toBeDefined();
    expect(trustedRule?.priority).toBe(4.2); // MCP trusted server

    // Check excluded server
    const excludedRule = config.rules?.find(
      (r) =>
        r.mcpName === 'excluded-server' && r.decision === PolicyDecision.DENY,
    );
    expect(excludedRule).toBeDefined();
    expect(excludedRule?.priority).toBe(4.9); // MCP excluded server
  });

  it('should allow all tools in YOLO mode', async () => {
    const config = await createPolicyEngineConfig({}, ApprovalMode.YOLO);
    const rule = config.rules?.find(
      (r) => r.decision === PolicyDecision.ALLOW && r.toolName === '*',
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBeCloseTo(1.998, 5);
  });

  it('should allow edit tool in AUTO_EDIT mode', async () => {
    const config = await createPolicyEngineConfig({}, ApprovalMode.AUTO_EDIT);
    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'replace' &&
        r.decision === PolicyDecision.ALLOW &&
        r.modes?.includes(ApprovalMode.AUTO_EDIT),
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBeCloseTo(1.015, 5);
  });

  it('should prioritize exclude over allow', async () => {
    const config = await createPolicyEngineConfig(
      {
        tools: {
          allowed: ['run_shell_command'],
          exclude: ['run_shell_command'],
        },
      },
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
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
    expect(denyRule!.priority).toBeGreaterThan(allowRule!.priority!);
  });

  it('should prioritize specific tool allows over MCP server excludes', async () => {
    const settings: PolicySettings = {
      mcp: { excluded: ['my-server'] },
      tools: { allowed: ['mcp_my-server_specific-tool'] },
    };
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );

    const serverDenyRule = config.rules?.find(
      (r) => r.mcpName === 'my-server' && r.decision === PolicyDecision.DENY,
    );
    const toolAllowRule = config.rules?.find(
      (r) =>
        r.toolName === 'mcp_my-server_specific-tool' &&
        r.decision === PolicyDecision.ALLOW,
    );

    expect(serverDenyRule).toBeDefined();
    expect(serverDenyRule?.priority).toBe(4.9); // MCP excluded server
    expect(toolAllowRule).toBeDefined();
    expect(toolAllowRule?.priority).toBeCloseTo(4.3, 5); // Command line allow

    // Server deny (4.9) has higher priority than tool allow (4.3),
    // so server deny wins (this is expected behavior - server-level blocks are security critical)
  });

  it('should handle MCP server allows and tool excludes', async () => {
    const { createPolicyEngineConfig } = await import('./config.js');
    const settings: PolicySettings = {
      mcp: { allowed: ['my-server'] },
      mcpServers: {
        'my-server': {
          trust: true,
        },
      },
      tools: { exclude: ['mcp_my-server_dangerous-tool'] },
    };
    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
      '/tmp/mock/default/policies',
    );

    const serverAllowRule = config.rules?.find(
      (r) => r.mcpName === 'my-server' && r.decision === PolicyDecision.ALLOW,
    );
    const toolDenyRule = config.rules?.find(
      (r) =>
        r.toolName === 'mcp_my-server_dangerous-tool' &&
        r.decision === PolicyDecision.DENY,
    );

    expect(serverAllowRule).toBeDefined();
    expect(toolDenyRule).toBeDefined();
    // Command line exclude (4.4) has higher priority than MCP server trust (4.2)
    // This is the correct behavior - specific exclusions should beat general server trust
    expect(toolDenyRule!.priority).toBeGreaterThan(serverAllowRule!.priority!);
  });

  it('should handle complex priority scenarios correctly', async () => {
    mockPolicyFile(
      nodePath.join(MOCK_DEFAULT_DIR, 'default.toml'),
      '[[rule]]\ntoolName = "glob"\ndecision = "allow"\npriority = 50\n',
    );

    const settings: PolicySettings = {
      tools: {
        allowed: ['mcp_trusted-server_tool1', 'other-tool'], // Priority 4.3
        exclude: ['mcp_trusted-server_tool2', 'glob'], // Priority 4.4
      },
      mcp: {
        allowed: ['allowed-server'], // Priority 4.1
        excluded: ['excluded-server'], // Priority 4.9
      },
      mcpServers: {
        'trusted-server': {
          trust: true, // Priority 4.2
        },
      },
    };

    const config = await createPolicyEngineConfig(
      settings,
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );

    const globDenyRule = config.rules?.find(
      (r) => r.toolName === 'glob' && r.decision === PolicyDecision.DENY,
    );
    const globAllowRule = config.rules?.find(
      (r) => r.toolName === 'glob' && r.decision === PolicyDecision.ALLOW,
    );
    expect(globDenyRule).toBeDefined();
    expect(globAllowRule).toBeDefined();
    // Deny from settings (user tier)
    expect(globDenyRule!.priority).toBeCloseTo(4.4, 5); // Command line exclude
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

    // Check that the highest priority items are the excludes (user tier: 4.4 and 4.9)
    const highestPriorityExcludes = priorities?.filter(
      (p) =>
        Math.abs(p.priority! - 4.4) < 0.01 ||
        Math.abs(p.priority! - 4.9) < 0.01,
    );
    expect(
      highestPriorityExcludes?.every((p) => p.decision === PolicyDecision.DENY),
    ).toBe(true);
  });

  it('should handle MCP servers with undefined trust property', async () => {
    const config = await createPolicyEngineConfig(
      {
        mcpServers: {
          'no-trust-property': {},
          'explicit-false': { trust: false },
        },
      },
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );

    // Neither server should have an allow rule
    const noTrustRule = config.rules?.find(
      (r) =>
        r.mcpName === 'no-trust-property' &&
        r.decision === PolicyDecision.ALLOW,
    );
    const explicitFalseRule = config.rules?.find(
      (r) =>
        r.mcpName === 'explicit-false' && r.decision === PolicyDecision.ALLOW,
    );

    expect(noTrustRule).toBeUndefined();
    expect(explicitFalseRule).toBeUndefined();
  });

  it('should have YOLO allow-all rule beat write tool rules in YOLO mode', async () => {
    const config = await createPolicyEngineConfig(
      { tools: { exclude: ['dangerous-tool'] } },
      ApprovalMode.YOLO,
    );

    const wildcardRule = config.rules?.find(
      (r) => r.toolName === '*' && r.decision === PolicyDecision.ALLOW,
    );
    const writeToolRules = config.rules?.filter(
      (r) =>
        ['run_shell_command'].includes(r.toolName || '') &&
        r.decision === PolicyDecision.ASK_USER,
    );

    expect(wildcardRule).toBeDefined();
    writeToolRules?.forEach((writeRule) => {
      expect(wildcardRule!.priority).toBeGreaterThan(writeRule.priority!);
    });
    // Should still have the exclude rule (from settings, user tier)
    const excludeRule = config.rules?.find(
      (r) =>
        r.toolName === 'dangerous-tool' && r.decision === PolicyDecision.DENY,
    );
    expect(excludeRule).toBeDefined();
    expect(excludeRule?.priority).toBeCloseTo(4.4, 5); // Command line exclude
  });

  it('should support argsPattern in policy rules', async () => {
    mockPolicyFile(
      nodePath.join(MOCK_DEFAULT_DIR, 'write.toml'),
      `
  [[rule]]
  toolName = "run_shell_command"
  argsPattern = "\\"command\\":\\"git (status|diff|log)\\""
  decision = "allow"
  priority = 150
  `,
    );

    const config = await createPolicyEngineConfig(
      {},
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );

    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    // Priority 150 in default tier → 1.150
    expect(rule?.priority).toBeCloseTo(1.15, 5);
    expect(rule?.argsPattern).toBeInstanceOf(RegExp);
    expect(rule?.argsPattern?.test('{"command":"git status"}')).toBe(true);
    expect(rule?.argsPattern?.test('{"command":"git commit"}')).toBe(false);
  });

  it('should load safety_checker configuration from TOML', async () => {
    mockPolicyFile(
      nodePath.join(MOCK_DEFAULT_DIR, 'safety.toml'),
      `
[[rule]]
toolName = "write_file"
decision = "allow"
priority = 10

[[safety_checker]]
toolName = "write_file"
priority = 10
[safety_checker.checker]
type = "in-process"
name = "allowed-path"
required_context = ["environment"]
`,
    );

    const config = await createPolicyEngineConfig(
      {},
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );

    expect(
      config.rules?.some(
        (r) =>
          r.toolName === 'write_file' && r.decision === PolicyDecision.ALLOW,
      ),
    ).toBe(true);
    const checker = config.checkers?.find(
      (c) => c.toolName === 'write_file' && c.checker.type === 'in-process',
    );
    expect(checker?.checker.name).toBe(InProcessCheckerType.ALLOWED_PATH);
  });

  it('should reject invalid in-process checker names', async () => {
    mockPolicyFile(
      nodePath.join(MOCK_DEFAULT_DIR, 'invalid_safety.toml'),
      `
[[rule]]
toolName = "write_file"
decision = "allow"
priority = 10

[[safety_checker]]
toolName = "write_file"
priority = 10
[safety_checker.checker]
type = "in-process"
name = "invalid-name"
`,
    );

    const config = await createPolicyEngineConfig(
      {},
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );
    expect(
      config.rules?.find((r) => r.toolName === 'write_file'),
    ).toBeUndefined();
  });

  it('should support mcpName in policy rules from TOML', async () => {
    mockPolicyFile(
      nodePath.join(MOCK_DEFAULT_DIR, 'mcp.toml'),
      `
  [[rule]]
  toolName = "my-tool"
  mcpName = "my-server"
  decision = "allow"
  priority = 150
  `,
    );

    const config = await createPolicyEngineConfig(
      {},
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );

    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'mcp_my-server_my-tool' &&
        r.mcpName === 'my-server' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBeCloseTo(1.15, 5);
  });

  it('should have default ASK_USER rule for discovered tools', async () => {
    const config = await createPolicyEngineConfig({}, ApprovalMode.DEFAULT);
    const discoveredRule = config.rules?.find(
      (r) =>
        r.toolName === 'discovered_tool_*' &&
        r.decision === PolicyDecision.ASK_USER,
    );
    expect(discoveredRule).toBeDefined();
    expect(discoveredRule?.priority).toBeCloseTo(1.01, 5);
  });

  it('should normalize legacy "ShellTool" alias to "run_shell_command"', async () => {
    vi.mocked(
      fs.readdir as (path: PathLike) => Promise<string[]>,
    ).mockResolvedValue([]);
    const config = await createPolicyEngineConfig(
      { tools: { allowed: ['ShellTool'] } },
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );
    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBeCloseTo(4.3, 5); // Command line allow

    vi.doUnmock('node:fs/promises');
  });

  it('should allow overriding Plan Mode deny with user policy', async () => {
    const userPolicyDir = '/tmp/gemini-cli-test/user/policies';
    vi.spyOn(Storage, 'getUserPoliciesDir').mockReturnValue(userPolicyDir);

    mockPolicyFile(
      nodePath.join(userPolicyDir, 'user-plan.toml'),
      `
[[rule]]
toolName = "run_shell_command"
commandPrefix = ["git status", "git diff"]
decision = "allow"
priority = 100
modes = ["plan"]

[[rule]]
toolName = "codebase_investigator"
decision = "allow"
priority = 100
modes = ["plan"]
`,
    );

    const config = await createPolicyEngineConfig(
      {},
      ApprovalMode.PLAN,
      nodePath.join(__dirname, 'policies'),
    );

    const shellRules = config.rules?.filter(
      (r) =>
        r.toolName === 'run_shell_command' &&
        r.decision === PolicyDecision.ALLOW &&
        r.modes?.includes(ApprovalMode.PLAN),
    );
    expect(shellRules?.length).toBeGreaterThan(0);
    shellRules?.forEach((r) => expect(r.priority).toBeCloseTo(4.1, 5));

    const subagentRule = config.rules?.find(
      (r) =>
        r.toolName === 'codebase_investigator' &&
        r.decision === PolicyDecision.ALLOW,
    );
    expect(subagentRule).toBeDefined();
    expect(subagentRule?.priority).toBeCloseTo(4.1, 5);
  });

  it('should deduplicate security warnings when called multiple times', async () => {
    const systemPoliciesDir = '/tmp/gemini-cli-test/system/policies';
    vi.spyOn(Storage, 'getSystemPoliciesDir').mockReturnValue(
      systemPoliciesDir,
    );

    vi.mocked(
      fs.readdir as (path: PathLike) => Promise<string[]>,
    ).mockImplementation(async (path) => {
      if (nodePath.resolve(path.toString()) === systemPoliciesDir) {
        return ['policy.toml'] as string[];
      }
      return [] as string[];
    });

    const feedbackSpy = vi
      .spyOn(coreEvents, 'emitFeedback')
      .mockImplementation(() => {});

    // First call
    await createPolicyEngineConfig(
      { adminPolicyPaths: ['/tmp/other/admin/policies'] },
      ApprovalMode.DEFAULT,
    );
    expect(feedbackSpy).toHaveBeenCalledWith(
      'warning',
      expect.stringContaining('Ignoring --admin-policy'),
    );
    const count = feedbackSpy.mock.calls.length;

    // Second call
    await createPolicyEngineConfig(
      { adminPolicyPaths: ['/tmp/other/admin/policies'] },
      ApprovalMode.DEFAULT,
    );
    expect(feedbackSpy.mock.calls.length).toBe(count);

    feedbackSpy.mockRestore();
  });
});

describe('getPolicyDirectories', () => {
  const USER_POLICIES_DIR = '/mock/user/policies';
  const SYSTEM_POLICIES_DIR = '/mock/system/policies';

  beforeEach(() => {
    vi.spyOn(Storage, 'getUserPoliciesDir').mockReturnValue(USER_POLICIES_DIR);
    vi.spyOn(Storage, 'getSystemPoliciesDir').mockReturnValue(
      SYSTEM_POLICIES_DIR,
    );
  });

  it('should include default user policies directory when policyPaths is undefined', () => {
    const dirs = getPolicyDirectories();
    expect(dirs).toContain(USER_POLICIES_DIR);
  });

  it('should include default user policies directory when policyPaths is an empty array', () => {
    // This is the specific case that regressed
    const dirs = getPolicyDirectories(undefined, []);
    expect(dirs).toContain(USER_POLICIES_DIR);
  });

  it('should replace default user policies directory when policyPaths has entries', () => {
    const customPath = '/custom/policies';
    const dirs = getPolicyDirectories(undefined, [customPath]);
    expect(dirs).toContain(customPath);
    expect(dirs).not.toContain(USER_POLICIES_DIR);
  });

  it('should include all tiers in correct order', () => {
    const defaultDir = '/default/policies';
    const workspaceDir = '/workspace/policies';
    const adminPath = '/admin/extra/policies';
    const userPath = '/user/custom/policies';

    const dirs = getPolicyDirectories(defaultDir, [userPath], workspaceDir, [
      adminPath,
    ]);

    // Order should be Admin -> User -> Workspace -> Default
    // getPolicyDirectories returns them in that order (which is then reversed by the loader)
    expect(dirs[0]).toBe(SYSTEM_POLICIES_DIR);
    expect(dirs[1]).toBe(adminPath);
    expect(dirs[2]).toBe(userPath);
    expect(dirs[3]).toBe(workspaceDir);
    expect(dirs[4]).toBe(defaultDir);
  });
});
