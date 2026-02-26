/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import nodePath from 'node:path';
import * as fs from 'node:fs/promises';

import { ApprovalMode, PolicyDecision, InProcessCheckerType } from './types.js';
import { isDirectorySecure } from '../utils/security.js';
import {
  createPolicyEngineConfig,
  clearEmittedPolicyWarnings,
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
    vi.mocked(fs.readdir).mockImplementation(async (p) => {
      if (nodePath.resolve(p.toString()) === nodePath.dirname(path)) {
        return [
          {
            name: nodePath.basename(path),
            isFile: () => true,
            isDirectory: () => false,
          },
        ] as any;
      }
      return (await vi.importActual<any>('node:fs/promises')).readdir(p);
    });

    vi.mocked(fs.stat).mockImplementation(async (p) => {
      if (nodePath.resolve(p.toString()) === nodePath.dirname(path)) {
        return { isDirectory: () => true, isFile: () => false } as any;
      }
      if (nodePath.resolve(p.toString()) === path) {
        return { isDirectory: () => false, isFile: () => true } as any;
      }
      return (await vi.importActual<any>('node:fs/promises')).stat(p);
    });

    vi.mocked(fs.readFile).mockImplementation(async (p) => {
      if (nodePath.resolve(p.toString()) === path) {
        return content;
      }
      return (await vi.importActual<any>('node:fs/promises')).readFile(p);
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
    vi.mocked(fs.readdir).mockResolvedValue([] as any);

    const config = await createPolicyEngineConfig(
      {},
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );
    expect(config.defaultDecision).toBe(PolicyDecision.ASK_USER);
    expect(config.rules).toEqual([]);
  });

  it('should allow tools in tools.allowed', async () => {
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
    expect(rule?.priority).toBeCloseTo(3.3, 5);
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
    expect(rule?.priority).toBeCloseTo(3.4, 5);
  });

  it('should allow tools from allowed MCP servers', async () => {
    const config = await createPolicyEngineConfig(
      { mcp: { allowed: ['my-server'] } },
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );
    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'my-server__*' && r.decision === PolicyDecision.ALLOW,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(3.1);
  });

  it('should deny tools from excluded MCP servers', async () => {
    const config = await createPolicyEngineConfig(
      { mcp: { excluded: ['my-server'] } },
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );
    const rule = config.rules?.find(
      (r) =>
        r.toolName === 'my-server__*' && r.decision === PolicyDecision.DENY,
    );
    expect(rule).toBeDefined();
    expect(rule?.priority).toBe(3.9);
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

    expect(
      config.rules?.some(
        (r) =>
          r.toolName === 'trusted-server__*' &&
          r.decision === PolicyDecision.ALLOW,
      ),
    ).toBe(true);
    expect(
      config.rules?.some((r) => r.toolName === 'untrusted-server__*'),
    ).toBe(false);
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

    expect(
      config.rules?.some((r) => r.toolName === 'allowed-server__*'),
    ).toBe(true);
    expect(
      config.rules?.some((r) => r.toolName === 'trusted-server__*'),
    ).toBe(true);
    expect(
      config.rules?.some(
        (r) =>
          r.toolName === 'excluded-server__*' &&
          r.decision === PolicyDecision.DENY,
      ),
    ).toBe(true);
  });

  it('should allow all tools in YOLO mode', async () => {
    const config = await createPolicyEngineConfig({}, ApprovalMode.YOLO);
    const rule = config.rules?.find(
      (r) => r.decision === PolicyDecision.ALLOW && !r.toolName,
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
    const config = await createPolicyEngineConfig(
      {
        mcp: { excluded: ['my-server'] },
        tools: { allowed: ['my-server__specific-tool'] },
      },
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );

    const serverDenyRule = config.rules?.find(
      (r) => r.toolName === 'my-server__*' && r.decision === PolicyDecision.DENY,
    );
    const toolAllowRule = config.rules?.find(
      (r) =>
        r.toolName === 'my-server__specific-tool' &&
        r.decision === PolicyDecision.ALLOW,
    );

    expect(serverDenyRule?.priority).toBe(3.9);
    expect(toolAllowRule?.priority).toBeCloseTo(3.3, 5);
    // Server-level blocks are higher priority than specific tool allows from settings
    expect(serverDenyRule!.priority).toBeGreaterThan(toolAllowRule!.priority!);
  });

  it('should handle complex priority scenarios correctly', async () => {
    mockPolicyFile(
      nodePath.join(MOCK_DEFAULT_DIR, 'default.toml'),
      '[[rule]]\ntoolName = "glob"\ndecision = "allow"\npriority = 50\n',
    );

    const config = await createPolicyEngineConfig(
      {
        tools: {
          allowed: ['my-server__tool1', 'other-tool'],
          exclude: ['my-server__tool2', 'glob'],
        },
        mcp: { allowed: ['allowed-server'], excluded: ['excluded-server'] },
        mcpServers: { 'trusted-server': { trust: true } },
      },
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );

    const globDenyRule = config.rules?.find(
      (r) => r.toolName === 'glob' && r.decision === PolicyDecision.DENY,
    );
    const globAllowRule = config.rules?.find(
      (r) => r.toolName === 'glob' && r.decision === PolicyDecision.ALLOW,
    );
    expect(globDenyRule!.priority).toBeCloseTo(3.4, 5);
    expect(globAllowRule!.priority).toBeCloseTo(1.05, 5);

    const priorities = config.rules?.sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );
    const highestExcludes = priorities?.filter(
      (p) =>
        Math.abs(p.priority! - 3.4) < 0.01 || Math.abs(p.priority! - 3.9) < 0.01,
    );
    expect(highestExcludes?.every((p) => p.decision === PolicyDecision.DENY))
      .toBe(true);
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

    expect(
      config.rules?.some((r) => r.toolName?.includes('no-trust-property')),
    ).toBe(false);
    expect(
      config.rules?.some((r) => r.toolName?.includes('explicit-false')),
    ).toBe(false);
  });

  it('should have YOLO allow-all rule beat write tool rules in YOLO mode', async () => {
    const config = await createPolicyEngineConfig(
      { tools: { exclude: ['dangerous-tool'] } },
      ApprovalMode.YOLO,
    );

    const wildcardRule = config.rules?.find(
      (r) => !r.toolName && r.decision === PolicyDecision.ALLOW,
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
    expect(rule?.priority).toBeCloseTo(1.15, 5);
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
        (r) => r.toolName === 'write_file' && r.decision === PolicyDecision.ALLOW,
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
    expect(config.rules?.find((r) => r.toolName === 'write_file'))
      .toBeUndefined();
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
    vi.mocked(fs.readdir).mockResolvedValue([] as any);
    const config = await createPolicyEngineConfig(
      { tools: { allowed: ['ShellTool'] } },
      ApprovalMode.DEFAULT,
      MOCK_DEFAULT_DIR,
    );
    expect(
      config.rules?.some(
        (r) =>
          r.toolName === 'run_shell_command' &&
          r.decision === PolicyDecision.ALLOW,
      ),
    ).toBe(true);
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
    expect(
      config.rules?.some(
        (r) =>
          r.toolName === 'codebase_investigator' &&
          r.decision === PolicyDecision.ALLOW,
      ),
    ).toBe(true);
  });

  it('should deduplicate security warnings when called multiple times', async () => {
    const systemPoliciesDir = '/tmp/gemini-cli-test/system/policies';
    vi.spyOn(Storage, 'getSystemPoliciesDir').mockReturnValue(
      systemPoliciesDir,
    );

    vi.mocked(fs.readdir).mockImplementation(async (path) => {
      if (nodePath.resolve(path.toString()) === systemPoliciesDir) {
        return ['policy.toml'] as any;
      }
      return [] as any;
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
