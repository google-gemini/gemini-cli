/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { PolicyEngine } from './policy-engine.js';
import {
  PolicyDecision,
  type PolicyRule,
  type PolicyEngineConfig,
  type SafetyCheckerRule,
  InProcessCheckerType,
  ApprovalMode,
  PRIORITY_SUBAGENT_TOOL,
} from './types.js';
import type { FunctionCall } from '@google/genai';
import { SafetyCheckDecision } from '../safety/protocol.js';
import type { CheckerRunner } from '../safety/checker-runner.js';
import { initializeShellParsers } from '../utils/shell-utils.js';
import { buildArgsPatterns } from './utils.js';

// Mock shell-utils to ensure consistent behavior across platforms (especially Windows CI)
// We want to test PolicyEngine logic, not the shell parser's ability to parse commands
vi.mock('../utils/shell-utils.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/shell-utils.js')>();
  return {
    ...actual,
    initializeShellParsers: vi.fn().mockResolvedValue(undefined),
    splitCommands: vi.fn().mockImplementation((command: string) => {
      // Simple mock splitting logic for test cases
      if (command.includes('&&')) {
        return command.split('&&').map((c) => c.trim());
      }
      return [command];
    }),
    hasRedirection: vi.fn().mockImplementation(
      (command: string) =>
        // Simple mock: true if '>' is present, unless it looks like "-> arrow"
        command.includes('>') && !command.includes('-> arrow'),
    ),
  };
});

// Mock tool-names to provide a consistent alias for testing

vi.mock('../tools/tool-names.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../tools/tool-names.js')>();

  const mockedAliases: Record<string, string> = {
    ...actual.TOOL_LEGACY_ALIASES,

    legacy_test_tool: 'current_test_tool',

    another_legacy_test_tool: 'current_test_tool',
  };

  return {
    ...actual,

    TOOL_LEGACY_ALIASES: mockedAliases,

    getToolAliases: vi.fn().mockImplementation((name: string) => {
      const aliases = new Set<string>([name]);

      const canonicalName = mockedAliases[name] ?? name;

      aliases.add(canonicalName);

      for (const [legacyName, currentName] of Object.entries(mockedAliases)) {
        if (currentName === canonicalName) {
          aliases.add(legacyName);
        }
      }

      return Array.from(aliases);
    }),
  };
});

describe('PolicyEngine', () => {
  let engine: PolicyEngine;
  let mockCheckerRunner: CheckerRunner;

  beforeAll(async () => {
    await initializeShellParsers();
  });

  beforeEach(() => {
    mockCheckerRunner = {
      runChecker: vi.fn(),
    } as unknown as CheckerRunner;
    engine = new PolicyEngine(
      { approvalMode: ApprovalMode.DEFAULT },
      mockCheckerRunner,
    );
  });

  describe('constructor', () => {
    it('should use default config when none provided', async () => {
      const { decision } = await engine.check({ name: 'test' }, undefined);
      expect(decision).toBe(PolicyDecision.ASK_USER);
    });

    it('should respect custom default decision', async () => {
      engine = new PolicyEngine({ defaultDecision: PolicyDecision.DENY });
      const { decision } = await engine.check({ name: 'test' }, undefined);
      expect(decision).toBe(PolicyDecision.DENY);
    });

    it('should sort rules by priority', () => {
      const rules: PolicyRule[] = [
        { toolName: 'tool1', decision: PolicyDecision.DENY, priority: 1 },
        { toolName: 'tool2', decision: PolicyDecision.ALLOW, priority: 10 },
        { toolName: 'tool3', decision: PolicyDecision.ASK_USER, priority: 5 },
      ];

      engine = new PolicyEngine({ rules });
      const sortedRules = engine.getRules();

      expect(sortedRules[0].priority).toBe(10);
      expect(sortedRules[1].priority).toBe(5);
      expect(sortedRules[2].priority).toBe(1);
    });
  });

  describe('check', () => {
    it('should match tool by name', async () => {
      const rules: PolicyRule[] = [
        { toolName: 'shell', decision: PolicyDecision.ALLOW },
        { toolName: 'edit', decision: PolicyDecision.DENY },
      ];

      engine = new PolicyEngine({ rules });

      expect((await engine.check({ name: 'shell' }, undefined)).decision).toBe(
        PolicyDecision.ALLOW,
      );
      expect((await engine.check({ name: 'edit' }, undefined)).decision).toBe(
        PolicyDecision.DENY,
      );
      expect((await engine.check({ name: 'other' }, undefined)).decision).toBe(
        PolicyDecision.ASK_USER,
      );
    });

    it('should match unqualified tool names with qualified rules when serverName is provided', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'my-server__tool',
          decision: PolicyDecision.ALLOW,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Match with qualified name (standard)
      expect(
        (await engine.check({ name: 'my-server__tool' }, 'my-server')).decision,
      ).toBe(PolicyDecision.ALLOW);

      // Match with unqualified name + serverName (the fix)
      expect((await engine.check({ name: 'tool' }, 'my-server')).decision).toBe(
        PolicyDecision.ALLOW,
      );

      // Should NOT match with unqualified name but NO serverName
      expect((await engine.check({ name: 'tool' }, undefined)).decision).toBe(
        PolicyDecision.ASK_USER,
      );

      // Should NOT match with unqualified name but WRONG serverName
      expect(
        (await engine.check({ name: 'tool' }, 'wrong-server')).decision,
      ).toBe(PolicyDecision.ASK_USER);
    });

    it('should match by args pattern', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'shell',
          argsPattern: /rm -rf/,
          decision: PolicyDecision.DENY,
        },
        {
          toolName: 'shell',
          decision: PolicyDecision.ALLOW,
        },
      ];

      engine = new PolicyEngine({ rules });

      const dangerousCall: FunctionCall = {
        name: 'shell',
        args: { command: 'rm -rf /' },
      };

      const safeCall: FunctionCall = {
        name: 'shell',
        args: { command: 'ls -la' },
      };

      expect((await engine.check(dangerousCall, undefined)).decision).toBe(
        PolicyDecision.DENY,
      );
      expect((await engine.check(safeCall, undefined)).decision).toBe(
        PolicyDecision.ALLOW,
      );
    });

    it('should apply rules by priority', async () => {
      const rules: PolicyRule[] = [
        { toolName: 'shell', decision: PolicyDecision.DENY, priority: 1 },
        { toolName: 'shell', decision: PolicyDecision.ALLOW, priority: 10 },
      ];

      engine = new PolicyEngine({ rules });

      // Higher priority rule (ALLOW) should win
      expect((await engine.check({ name: 'shell' }, undefined)).decision).toBe(
        PolicyDecision.ALLOW,
      );
    });

    it('should match current tool call against legacy tool name rules', async () => {
      const legacyName = 'legacy_test_tool';
      const currentName = 'current_test_tool';

      const rules: PolicyRule[] = [
        { toolName: legacyName, decision: PolicyDecision.DENY },
      ];

      engine = new PolicyEngine({ rules });

      // Call using the CURRENT name, should be denied because of legacy rule
      const { decision } = await engine.check({ name: currentName }, undefined);
      expect(decision).toBe(PolicyDecision.DENY);
    });

    it('should match legacy tool call against current tool name rules (for skills support)', async () => {
      const legacyName = 'legacy_test_tool';
      const currentName = 'current_test_tool';

      const rules: PolicyRule[] = [
        { toolName: currentName, decision: PolicyDecision.ALLOW },
      ];

      engine = new PolicyEngine({ rules });

      // Call using the LEGACY name (from a skill), should be allowed because of current rule
      const { decision } = await engine.check({ name: legacyName }, undefined);
      expect(decision).toBe(PolicyDecision.ALLOW);
    });

    it('should match tool call using one legacy name against policy for another legacy name (same canonical tool)', async () => {
      const legacyName1 = 'legacy_test_tool';
      const legacyName2 = 'another_legacy_test_tool';

      const rules: PolicyRule[] = [
        { toolName: legacyName2, decision: PolicyDecision.DENY },
      ];

      engine = new PolicyEngine({ rules });

      // Call using legacyName1, should be denied because legacyName2 has a deny rule
      // and they both point to the same canonical tool.
      const { decision } = await engine.check({ name: legacyName1 }, undefined);
      expect(decision).toBe(PolicyDecision.DENY);
    });

    it('should apply wildcard rules (no toolName)', async () => {
      const rules: PolicyRule[] = [
        { decision: PolicyDecision.DENY }, // Applies to all tools
        { toolName: 'safe-tool', decision: PolicyDecision.ALLOW, priority: 10 },
      ];

      engine = new PolicyEngine({ rules });

      expect(
        (await engine.check({ name: 'safe-tool' }, undefined)).decision,
      ).toBe(PolicyDecision.ALLOW);
      expect(
        (await engine.check({ name: 'any-other-tool' }, undefined)).decision,
      ).toBe(PolicyDecision.DENY);
    });

    it('should handle non-interactive mode', async () => {
      const config: PolicyEngineConfig = {
        nonInteractive: true,
        rules: [
          { toolName: 'interactive-tool', decision: PolicyDecision.ASK_USER },
          { toolName: 'allowed-tool', decision: PolicyDecision.ALLOW },
        ],
      };

      engine = new PolicyEngine(config);

      // ASK_USER should become DENY in non-interactive mode
      expect(
        (await engine.check({ name: 'interactive-tool' }, undefined)).decision,
      ).toBe(PolicyDecision.DENY);
      // ALLOW should remain ALLOW
      expect(
        (await engine.check({ name: 'allowed-tool' }, undefined)).decision,
      ).toBe(PolicyDecision.ALLOW);
      // Default ASK_USER should also become DENY
      expect(
        (await engine.check({ name: 'unknown-tool' }, undefined)).decision,
      ).toBe(PolicyDecision.DENY);
    });

    it('should dynamically switch between modes and respect rule modes', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'edit',
          decision: PolicyDecision.ASK_USER,
          priority: 10,
        },
        {
          toolName: 'edit',
          decision: PolicyDecision.ALLOW,
          priority: 20,
          modes: [ApprovalMode.AUTO_EDIT],
        },
      ];

      engine = new PolicyEngine({ rules });

      // Default mode: priority 20 rule doesn't match, falls back to priority 10
      expect((await engine.check({ name: 'edit' }, undefined)).decision).toBe(
        PolicyDecision.ASK_USER,
      );

      // Switch to autoEdit mode
      engine.setApprovalMode(ApprovalMode.AUTO_EDIT);
      expect((await engine.check({ name: 'edit' }, undefined)).decision).toBe(
        PolicyDecision.ALLOW,
      );

      // Switch back to default
      engine.setApprovalMode(ApprovalMode.DEFAULT);
      expect((await engine.check({ name: 'edit' }, undefined)).decision).toBe(
        PolicyDecision.ASK_USER,
      );
    });
  });

  describe('addRule', () => {
    it('should add a new rule and maintain priority order', () => {
      engine.addRule({
        toolName: 'tool1',
        decision: PolicyDecision.ALLOW,
        priority: 5,
      });
      engine.addRule({
        toolName: 'tool2',
        decision: PolicyDecision.DENY,
        priority: 10,
      });
      engine.addRule({
        toolName: 'tool3',
        decision: PolicyDecision.ASK_USER,
        priority: 1,
      });

      const rules = engine.getRules();
      expect(rules).toHaveLength(3);
      expect(rules[0].priority).toBe(10);
      expect(rules[1].priority).toBe(5);
      expect(rules[2].priority).toBe(1);
    });

    it('should apply newly added rules', async () => {
      expect(
        (await engine.check({ name: 'new-tool' }, undefined)).decision,
      ).toBe(PolicyDecision.ASK_USER);

      engine.addRule({ toolName: 'new-tool', decision: PolicyDecision.ALLOW });

      expect(
        (await engine.check({ name: 'new-tool' }, undefined)).decision,
      ).toBe(PolicyDecision.ALLOW);
    });
  });

  describe('removeRulesForTool', () => {
    it('should remove rules for specific tool', () => {
      engine.addRule({ toolName: 'tool1', decision: PolicyDecision.ALLOW });
      engine.addRule({ toolName: 'tool2', decision: PolicyDecision.DENY });
      engine.addRule({
        toolName: 'tool1',
        decision: PolicyDecision.ASK_USER,
        priority: 10,
      });

      expect(engine.getRules()).toHaveLength(3);

      engine.removeRulesForTool('tool1');

      const remainingRules = engine.getRules();
      expect(remainingRules).toHaveLength(1);
      expect(remainingRules.some((r) => r.toolName === 'tool1')).toBe(false);
      expect(remainingRules.some((r) => r.toolName === 'tool2')).toBe(true);
    });

    it('should handle removing non-existent tool', () => {
      engine.addRule({ toolName: 'existing', decision: PolicyDecision.ALLOW });

      expect(() => engine.removeRulesForTool('non-existent')).not.toThrow();
      expect(engine.getRules()).toHaveLength(1);
    });
  });

  describe('getRules', () => {
    it('should return readonly array of rules', () => {
      const rules: PolicyRule[] = [
        { toolName: 'tool1', decision: PolicyDecision.ALLOW },
        { toolName: 'tool2', decision: PolicyDecision.DENY },
      ];

      engine = new PolicyEngine({ rules });

      const retrievedRules = engine.getRules();
      expect(retrievedRules).toHaveLength(2);
      expect(retrievedRules[0].toolName).toBe('tool1');
      expect(retrievedRules[1].toolName).toBe('tool2');
    });
  });

  describe('MCP server wildcard patterns', () => {
    it('should match MCP server wildcard patterns', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'my-server__*',
          decision: PolicyDecision.ALLOW,
          priority: 10,
        },
        {
          toolName: 'blocked-server__*',
          decision: PolicyDecision.DENY,
          priority: 20,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Should match my-server tools
      expect(
        (await engine.check({ name: 'my-server__tool1' }, undefined)).decision,
      ).toBe(PolicyDecision.ALLOW);
      expect(
        (await engine.check({ name: 'my-server__another_tool' }, undefined))
          .decision,
      ).toBe(PolicyDecision.ALLOW);

      // Should match blocked-server tools
      expect(
        (await engine.check({ name: 'blocked-server__tool1' }, undefined))
          .decision,
      ).toBe(PolicyDecision.DENY);
      expect(
        (await engine.check({ name: 'blocked-server__dangerous' }, undefined))
          .decision,
      ).toBe(PolicyDecision.DENY);

      // Should not match other patterns
      expect(
        (await engine.check({ name: 'other-server__tool' }, undefined))
          .decision,
      ).toBe(PolicyDecision.ASK_USER);
      expect(
        (await engine.check({ name: 'my-server-tool' }, undefined)).decision,
      ).toBe(PolicyDecision.ASK_USER); // No __ separator
      expect(
        (await engine.check({ name: 'my-server' }, undefined)).decision,
      ).toBe(PolicyDecision.ASK_USER); // No tool name
    });

    it('should prioritize specific tool rules over server wildcards', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'my-server__*',
          decision: PolicyDecision.ALLOW,
          priority: 10,
        },
        {
          toolName: 'my-server__dangerous-tool',
          decision: PolicyDecision.DENY,
          priority: 20,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Specific tool deny should override server allow
      expect(
        (await engine.check({ name: 'my-server__dangerous-tool' }, undefined))
          .decision,
      ).toBe(PolicyDecision.DENY);
      expect(
        (await engine.check({ name: 'my-server__safe-tool' }, undefined))
          .decision,
      ).toBe(PolicyDecision.ALLOW);
    });

    it('should NOT match spoofed server names when using wildcards', async () => {
      // Vulnerability: A rule for 'prefix__*' matches 'prefix__suffix__tool'
      // effectively allowing a server named 'prefix__suffix' to spoof 'prefix'.
      const rules: PolicyRule[] = [
        {
          toolName: 'safe_server__*',
          decision: PolicyDecision.ALLOW,
        },
      ];
      engine = new PolicyEngine({ rules });

      // A tool from a different server 'safe_server__malicious'
      const spoofedToolCall = { name: 'safe_server__malicious__tool' };

      // CURRENT BEHAVIOR (FIXED): Matches because it starts with 'safe_server__' BUT serverName doesn't match 'safe_server'
      // We expect this to FAIL matching the ALLOW rule, thus falling back to default (ASK_USER)
      expect(
        (await engine.check(spoofedToolCall, 'safe_server__malicious'))
          .decision,
      ).toBe(PolicyDecision.ASK_USER);
    });

    it('should verify tool name prefix even if serverName matches', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'safe_server__*',
          decision: PolicyDecision.ALLOW,
        },
      ];
      engine = new PolicyEngine({ rules });

      // serverName matches, but tool name does not start with prefix
      const invalidToolCall = { name: 'other_server__tool' };
      expect(
        (await engine.check(invalidToolCall, 'safe_server')).decision,
      ).toBe(PolicyDecision.ASK_USER);
    });

    it('should allow when both serverName and tool name prefix match', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'safe_server__*',
          decision: PolicyDecision.ALLOW,
        },
      ];
      engine = new PolicyEngine({ rules });

      const validToolCall = { name: 'safe_server__tool' };
      expect((await engine.check(validToolCall, 'safe_server')).decision).toBe(
        PolicyDecision.ALLOW,
      );
    });
  });

  describe('complex scenarios', () => {
    it('should handle multiple matching rules with different priorities', async () => {
      const rules: PolicyRule[] = [
        { decision: PolicyDecision.DENY, priority: 0 }, // Default deny all
        { toolName: 'shell', decision: PolicyDecision.ASK_USER, priority: 5 },
        {
          toolName: 'shell',
          argsPattern: /"command":"ls/,
          decision: PolicyDecision.ALLOW,
          priority: 10,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Matches highest priority rule (ls command)
      expect(
        (
          await engine.check(
            { name: 'shell', args: { command: 'ls -la' } },
            undefined,
          )
        ).decision,
      ).toBe(PolicyDecision.ALLOW);

      // Matches middle priority rule (shell without ls)
      expect(
        (
          await engine.check(
            { name: 'shell', args: { command: 'pwd' } },
            undefined,
          )
        ).decision,
      ).toBe(PolicyDecision.ASK_USER);

      // Matches lowest priority rule (not shell)
      expect((await engine.check({ name: 'edit' }, undefined)).decision).toBe(
        PolicyDecision.DENY,
      );
    });

    it('should correctly match commands with quotes in commandPrefix', async () => {
      const prefix = 'git commit -m "fix"';
      const patterns = buildArgsPatterns(undefined, prefix);
      const rules: PolicyRule[] = [
        {
          toolName: 'run_shell_command',
          argsPattern: new RegExp(patterns[0]!),
          decision: PolicyDecision.ALLOW,
        },
      ];
      engine = new PolicyEngine({ rules });

      const result = await engine.check(
        {
          name: 'run_shell_command',
          args: { command: 'git commit -m "fix"' },
        },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.ALLOW);
    });

    it('should handle tools with no args', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'read',
          argsPattern: /secret/,
          decision: PolicyDecision.DENY,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Tool call without args should not match pattern
      expect((await engine.check({ name: 'read' }, undefined)).decision).toBe(
        PolicyDecision.ASK_USER,
      );

      // Tool call with args not matching pattern
      expect(
        (
          await engine.check(
            { name: 'read', args: { file: 'public.txt' } },
            undefined,
          )
        ).decision,
      ).toBe(PolicyDecision.ASK_USER);

      // Tool call with args matching pattern
      expect(
        (
          await engine.check(
            { name: 'read', args: { file: 'secret.txt' } },
            undefined,
          )
        ).decision,
      ).toBe(PolicyDecision.DENY);
    });

    it('should match args pattern regardless of property order', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'shell',
          // Pattern matches the stable stringified format
          argsPattern: /"command":"rm[^"]*-rf/,
          decision: PolicyDecision.DENY,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Same args with different property order should both match
      const args1 = { command: 'rm -rf /', path: '/home' };
      const args2 = { path: '/home', command: 'rm -rf /' };

      expect(
        (await engine.check({ name: 'shell', args: args1 }, undefined))
          .decision,
      ).toBe(PolicyDecision.DENY);
      expect(
        (await engine.check({ name: 'shell', args: args2 }, undefined))
          .decision,
      ).toBe(PolicyDecision.DENY);

      // Verify safe command doesn't match
      const safeArgs = { command: 'ls -la', path: '/home' };
      expect(
        (await engine.check({ name: 'shell', args: safeArgs }, undefined))
          .decision,
      ).toBe(PolicyDecision.ASK_USER);
    });

    it('should handle nested objects in args with stable stringification', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'api',
          argsPattern: /"sensitive":true/,
          decision: PolicyDecision.DENY,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Nested objects with different key orders should match consistently
      const args1 = {
        data: { sensitive: true, value: 'secret' },
        method: 'POST',
      };
      const args2 = {
        method: 'POST',
        data: { value: 'secret', sensitive: true },
      };

      expect(
        (await engine.check({ name: 'api', args: args1 }, undefined)).decision,
      ).toBe(PolicyDecision.DENY);
      expect(
        (await engine.check({ name: 'api', args: args2 }, undefined)).decision,
      ).toBe(PolicyDecision.DENY);
    });

    it('should handle circular references without stack overflow', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'test',
          argsPattern: /\[Circular\]/,
          decision: PolicyDecision.DENY,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Create an object with a circular reference
      type CircularArgs = Record<string, unknown> & {
        data?: Record<string, unknown>;
      };
      const circularArgs: CircularArgs = {
        name: 'test',
        data: {},
      };
      // Create circular reference - TypeScript allows this since data is Record<string, unknown>
      (circularArgs.data as Record<string, unknown>)['self'] =
        circularArgs.data;

      // Should not throw stack overflow error
      await expect(
        engine.check({ name: 'test', args: circularArgs }, undefined),
      ).resolves.not.toThrow();

      // Should detect the circular reference pattern
      expect(
        (await engine.check({ name: 'test', args: circularArgs }, undefined))
          .decision,
      ).toBe(PolicyDecision.DENY);

      // Non-circular object should not match
      const normalArgs = { name: 'test', data: { value: 'normal' } };
      expect(
        (await engine.check({ name: 'test', args: normalArgs }, undefined))
          .decision,
      ).toBe(PolicyDecision.ASK_USER);
    });

    it('should handle deep circular references', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'deep',
          argsPattern: /\[Circular\]/,
          decision: PolicyDecision.DENY,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Create a deep circular reference
      type DeepCircular = Record<string, unknown> & {
        level1?: {
          level2?: {
            level3?: Record<string, unknown>;
          };
        };
      };
      const deepCircular: DeepCircular = {
        level1: {
          level2: {
            level3: {},
          },
        },
      };
      // Create circular reference with proper type assertions
      const level3 = deepCircular.level1!.level2!.level3!;
      level3['back'] = deepCircular.level1;

      // Should handle without stack overflow
      await expect(
        engine.check({ name: 'deep', args: deepCircular }, undefined),
      ).resolves.not.toThrow();

      // Should detect the circular reference
      expect(
        (await engine.check({ name: 'deep', args: deepCircular }, undefined))
          .decision,
      ).toBe(PolicyDecision.DENY);
    });

    it('should handle repeated non-circular objects correctly', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'test',
          argsPattern: /\[Circular\]/,
          decision: PolicyDecision.DENY,
        },
        {
          toolName: 'test',
          argsPattern: /"value":"shared"/,
          decision: PolicyDecision.ALLOW,
          priority: 10,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Create an object with repeated references but no cycles
      const sharedObj = { value: 'shared' };
      const args = {
        first: sharedObj,
        second: sharedObj,
        third: { nested: sharedObj },
      };

      // Should NOT mark repeated objects as circular, and should match the shared value pattern
      expect(
        (await engine.check({ name: 'test', args }, undefined)).decision,
      ).toBe(PolicyDecision.ALLOW);
    });

    it('should omit undefined and function values from objects', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'test',
          argsPattern: /"definedValue":"test"/,
          decision: PolicyDecision.ALLOW,
        },
      ];

      engine = new PolicyEngine({ rules });

      const args = {
        definedValue: 'test',
        undefinedValue: undefined,
        functionValue: () => 'hello',
        nullValue: null,
      };

      // Should match pattern with defined value, undefined and functions omitted
      expect(
        (await engine.check({ name: 'test', args }, undefined)).decision,
      ).toBe(PolicyDecision.ALLOW);

      // Check that the pattern would NOT match if undefined was included
      const rulesWithUndefined: PolicyRule[] = [
        {
          toolName: 'test',
          argsPattern: /undefinedValue/,
          decision: PolicyDecision.DENY,
        },
      ];
      engine = new PolicyEngine({ rules: rulesWithUndefined });
      expect(
        (await engine.check({ name: 'test', args }, undefined)).decision,
      ).toBe(PolicyDecision.ASK_USER);

      // Check that the pattern would NOT match if function was included
      const rulesWithFunction: PolicyRule[] = [
        {
          toolName: 'test',
          argsPattern: /functionValue/,
          decision: PolicyDecision.DENY,
        },
      ];
      engine = new PolicyEngine({ rules: rulesWithFunction });
      expect(
        (await engine.check({ name: 'test', args }, undefined)).decision,
      ).toBe(PolicyDecision.ASK_USER);
    });

    it('should convert undefined and functions to null in arrays', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'test',
          argsPattern: /\["value",null,null,null\]/,
          decision: PolicyDecision.ALLOW,
        },
      ];

      engine = new PolicyEngine({ rules });

      const args = {
        array: ['value', undefined, () => 'hello', null],
      };

      // Should match pattern with undefined and functions converted to null
      expect(
        (await engine.check({ name: 'test', args }, undefined)).decision,
      ).toBe(PolicyDecision.ALLOW);
    });

    it('should produce valid JSON for all inputs', async () => {
      const testCases: Array<{ input: Record<string, unknown>; desc: string }> =
        [
          { input: { simple: 'string' }, desc: 'simple object' },
          {
            input: { nested: { deep: { value: 123 } } },
            desc: 'nested object',
          },
          { input: { data: [1, 2, 3] }, desc: 'simple array' },
          { input: { mixed: [1, { a: 'b' }, null] }, desc: 'mixed array' },
          {
            input: { undef: undefined, func: () => {}, normal: 'value' },
            desc: 'object with undefined and function',
          },
          {
            input: { data: ['a', undefined, () => {}, null] },
            desc: 'array with undefined and function',
          },
        ];

      for (const { input } of testCases) {
        const rules: PolicyRule[] = [
          {
            toolName: 'test',
            argsPattern: /.*/,
            decision: PolicyDecision.ALLOW,
          },
        ];
        engine = new PolicyEngine({ rules });

        // Should not throw when checking (which internally uses stableStringify)
        await expect(
          engine.check({ name: 'test', args: input }, undefined),
        ).resolves.not.toThrow();

        // The check should succeed
        expect(
          (await engine.check({ name: 'test', args: input }, undefined))
            .decision,
        ).toBe(PolicyDecision.ALLOW);
      }
    });

    it('should respect toJSON methods on objects', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'test',
          argsPattern: /"sanitized":"safe"/,
          decision: PolicyDecision.ALLOW,
        },
        {
          toolName: 'test',
          argsPattern: /"dangerous":"data"/,
          decision: PolicyDecision.DENY,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Object with toJSON that sanitizes output
      const args = {
        data: {
          dangerous: 'data',
          toJSON: () => ({ sanitized: 'safe' }),
        },
      };

      // Should match the sanitized pattern, not the dangerous one
      expect(
        (await engine.check({ name: 'test', args }, undefined)).decision,
      ).toBe(PolicyDecision.ALLOW);
    });

    it('should handle toJSON that returns primitives', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'test',
          argsPattern: /"value":"string-value"/,
          decision: PolicyDecision.ALLOW,
        },
      ];

      engine = new PolicyEngine({ rules });

      const args = {
        value: {
          complex: 'object',
          toJSON: () => 'string-value',
        },
      };

      // toJSON returns a string, which should be properly stringified
      expect(
        (await engine.check({ name: 'test', args }, undefined)).decision,
      ).toBe(PolicyDecision.ALLOW);
    });

    it('should handle toJSON that throws an error', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'test',
          argsPattern: /"fallback":"value"/,
          decision: PolicyDecision.ALLOW,
        },
      ];

      engine = new PolicyEngine({ rules });

      const args = {
        data: {
          fallback: 'value',
          toJSON: () => {
            throw new Error('toJSON error');
          },
        },
      };

      // Should fall back to regular object serialization when toJSON throws
      expect(
        (await engine.check({ name: 'test', args }, undefined)).decision,
      ).toBe(PolicyDecision.ALLOW);
    });
    it('should downgrade ALLOW to ASK_USER for redirected shell commands', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'run_shell_command',
          // Matches "echo" prefix
          argsPattern: /"command":"echo/,
          decision: PolicyDecision.ALLOW,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Safe command should be allowed
      expect(
        (
          await engine.check(
            { name: 'run_shell_command', args: { command: 'echo "hello"' } },
            undefined,
          )
        ).decision,
      ).toBe(PolicyDecision.ALLOW);

      // Redirected command should be downgraded to ASK_USER
      expect(
        (
          await engine.check(
            {
              name: 'run_shell_command',
              args: { command: 'echo "hello" > file.txt' },
            },
            undefined,
          )
        ).decision,
      ).toBe(PolicyDecision.ASK_USER);
    });

    it('should allow redirected shell commands when allowRedirection is true', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'run_shell_command',
          // Matches "echo" prefix
          argsPattern: /"command":"echo/,
          decision: PolicyDecision.ALLOW,
          allowRedirection: true,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Redirected command should stay ALLOW
      expect(
        (
          await engine.check(
            {
              name: 'run_shell_command',
              args: { command: 'echo "hello" > file.txt' },
            },
            undefined,
          )
        ).decision,
      ).toBe(PolicyDecision.ALLOW);
    });

    it('should NOT downgrade ALLOW to ASK_USER for quoted redirection chars', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'run_shell_command',
          argsPattern: /"command":"echo/,
          decision: PolicyDecision.ALLOW,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Should remain ALLOW because it's not a real redirection
      expect(
        (
          await engine.check(
            {
              name: 'run_shell_command',
              args: { command: 'echo "-> arrow"' },
            },
            undefined,
          )
        ).decision,
      ).toBe(PolicyDecision.ALLOW);
    });

    it('should preserve dir_path during recursive shell command checks', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'run_shell_command',
          // Rule that only allows echo in a specific directory
          // Note: stableStringify sorts keys alphabetically and has no spaces: {"command":"echo hello","dir_path":"/safe/path"}
          argsPattern: /"command":"echo hello".*"dir_path":"\/safe\/path"/,
          decision: PolicyDecision.ALLOW,
        },
        {
          // Catch-all ALLOW for shell but with low priority
          toolName: 'run_shell_command',
          decision: PolicyDecision.ALLOW,
          priority: -100,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Compound command. The decomposition will call check() for "echo hello"
      // which should match our specific high-priority rule IF dir_path is preserved.
      const result = await engine.check(
        {
          name: 'run_shell_command',
          args: { command: 'echo hello && pwd', dir_path: '/safe/path' },
        },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.ALLOW);
    });

    it('should upgrade ASK_USER to ALLOW if all sub-commands are allowed', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'run_shell_command',
          argsPattern: /"command":"git status/,
          decision: PolicyDecision.ALLOW,
          priority: 20,
        },
        {
          toolName: 'run_shell_command',
          argsPattern: /"command":"ls/,
          decision: PolicyDecision.ALLOW,
          priority: 20,
        },
        {
          // Catch-all ASK_USER for shell
          toolName: 'run_shell_command',
          decision: PolicyDecision.ASK_USER,
          priority: 10,
        },
      ];

      engine = new PolicyEngine({ rules });

      // "git status && ls" matches the catch-all ASK_USER rule initially.
      // But since both parts are explicitly ALLOWed, the result should be upgraded to ALLOW.
      const result = await engine.check(
        {
          name: 'run_shell_command',
          args: { command: 'git status && ls' },
        },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.ALLOW);
    });

    it('should respect explicit DENY for compound commands even if parts are allowed', async () => {
      const rules: PolicyRule[] = [
        {
          // Explicitly DENY the compound command
          toolName: 'run_shell_command',
          argsPattern: /"command":"git status && ls"/,
          decision: PolicyDecision.DENY,
          priority: 30,
        },
        {
          toolName: 'run_shell_command',
          argsPattern: /"command":"git status/,
          decision: PolicyDecision.ALLOW,
          priority: 20,
        },
        {
          toolName: 'run_shell_command',
          argsPattern: /"command":"ls/,
          decision: PolicyDecision.ALLOW,
          priority: 20,
        },
      ];

      engine = new PolicyEngine({ rules });

      const result = await engine.check(
        {
          name: 'run_shell_command',
          args: { command: 'git status && ls' },
        },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.DENY);
    });

    it('should propagate DENY from any sub-command', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'run_shell_command',
          argsPattern: /"command":"rm/,
          decision: PolicyDecision.DENY,
          priority: 20,
        },
        {
          toolName: 'run_shell_command',
          argsPattern: /"command":"echo/,
          decision: PolicyDecision.ALLOW,
          priority: 20,
        },
        {
          toolName: 'run_shell_command',
          decision: PolicyDecision.ASK_USER,
          priority: 10,
        },
      ];

      engine = new PolicyEngine({ rules });

      // "echo hello && rm -rf /" -> echo is ALLOW, rm is DENY -> Result DENY
      const result = await engine.check(
        {
          name: 'run_shell_command',
          args: { command: 'echo hello && rm -rf /' },
        },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.DENY);
    });

    it('should DENY redirected shell commands in non-interactive mode', async () => {
      const config: PolicyEngineConfig = {
        nonInteractive: true,
        rules: [
          {
            toolName: 'run_shell_command',
            decision: PolicyDecision.ALLOW,
          },
        ],
      };

      engine = new PolicyEngine(config);

      // Redirected command should be DENIED in non-interactive mode
      // (Normally ASK_USER, but ASK_USER -> DENY in non-interactive)
      expect(
        (
          await engine.check(
            {
              name: 'run_shell_command',
              args: { command: 'echo "hello" > file.txt' },
            },
            undefined,
          )
        ).decision,
      ).toBe(PolicyDecision.DENY);
    });

    it('should default to ASK_USER for atomic commands when matching a wildcard ASK_USER rule', async () => {
      // Regression test: atomic commands were auto-allowing because of optimistic initialization
      const rules: PolicyRule[] = [
        {
          toolName: 'run_shell_command',
          decision: PolicyDecision.ASK_USER,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Atomic command "whoami" matches the wildcard rule (ASK_USER).
      // It should NOT be upgraded to ALLOW.
      expect(
        (
          await engine.check(
            {
              name: 'run_shell_command',
              args: { command: 'whoami' },
            },
            undefined,
          )
        ).decision,
      ).toBe(PolicyDecision.ASK_USER);
    });

    it('should allow redirected shell commands in non-interactive mode if allowRedirection is true', async () => {
      const config: PolicyEngineConfig = {
        nonInteractive: true,
        rules: [
          {
            toolName: 'run_shell_command',
            decision: PolicyDecision.ALLOW,
            allowRedirection: true,
          },
        ],
      };

      engine = new PolicyEngine(config);

      // Redirected command should stay ALLOW even in non-interactive mode
      expect(
        (
          await engine.check(
            {
              name: 'run_shell_command',
              args: { command: 'echo "hello" > file.txt' },
            },
            undefined,
          )
        ).decision,
      ).toBe(PolicyDecision.ALLOW);
    });

    it('should avoid infinite recursion for commands with substitution', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'run_shell_command',
          decision: PolicyDecision.ALLOW,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Command with substitution triggers splitCommands returning the same command as its first element.
      // This verifies the fix for the infinite recursion bug.
      const result = await engine.check(
        {
          name: 'run_shell_command',
          args: { command: 'echo $(ls)' },
        },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.ALLOW);
    });

    it('should require confirmation for a compound command with redirection even if individual commands are allowed', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'run_shell_command',
          argsPattern: /"command":"mkdir\b/,
          decision: PolicyDecision.ALLOW,
          priority: 20,
        },
        {
          toolName: 'run_shell_command',
          argsPattern: /"command":"echo\b/,
          decision: PolicyDecision.ALLOW,
          priority: 20,
        },
      ];

      engine = new PolicyEngine({ rules });

      // The full command has redirection, even if the individual split commands do not.
      // splitCommands will return ['mkdir -p "bar"', 'echo "hello"']
      // The redirection '> bar/test.md' is stripped by splitCommands.
      const result = await engine.check(
        {
          name: 'run_shell_command',
          args: { command: 'mkdir -p "bar" && echo "hello" > bar/test.md' },
        },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.ASK_USER);
    });

    it('should report redirection when a sub-command specifically has redirection', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'run_shell_command',
          argsPattern: /"command":"mkdir\b/,
          decision: PolicyDecision.ALLOW,
          priority: 20,
        },
        {
          toolName: 'run_shell_command',
          argsPattern: /"command":"echo\b/,
          decision: PolicyDecision.ALLOW,
          priority: 20,
        },
      ];

      engine = new PolicyEngine({ rules });

      // In this case, we mock splitCommands to keep the redirection in the sub-command
      vi.mocked(initializeShellParsers).mockResolvedValue(undefined);
      const { splitCommands } = await import('../utils/shell-utils.js');
      vi.mocked(splitCommands).mockReturnValueOnce([
        'mkdir bar',
        'echo hello > bar/test.md',
      ]);

      const result = await engine.check(
        {
          name: 'run_shell_command',
          args: { command: 'mkdir bar && echo hello > bar/test.md' },
        },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.ASK_USER);
    });

    it('should allow redirected shell commands in AUTO_EDIT mode if individual commands are allowed', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'run_shell_command',
          argsPattern: /"command":"echo\b/,
          decision: PolicyDecision.ALLOW,
          priority: 20,
        },
      ];

      engine = new PolicyEngine({ rules });
      engine.setApprovalMode(ApprovalMode.AUTO_EDIT);

      const result = await engine.check(
        {
          name: 'run_shell_command',
          args: { command: 'echo "hello" > test.txt' },
        },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.ALLOW);
    });

    it('should allow compound commands with safe operators (&&, ||) if individual commands are allowed', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'run_shell_command',
          argsPattern: /"command":"echo\b/,
          decision: PolicyDecision.ALLOW,
          priority: 20,
        },
      ];

      engine = new PolicyEngine({ rules });

      // "echo hello && echo world" should be allowed since both parts are ALLOW and no redirection is present.
      const result = await engine.check(
        {
          name: 'run_shell_command',
          args: { command: 'echo hello && echo world' },
        },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.ALLOW);
    });
  });

  describe('Plan Mode vs Subagent Priority (Regression)', () => {
    it('should DENY subagents in Plan Mode despite dynamic allow rules', async () => {
      // Plan Mode Deny (1.06) > Subagent Allow (1.05)

      const fixedRules: PolicyRule[] = [
        {
          decision: PolicyDecision.DENY,
          priority: 1.06,
          modes: [ApprovalMode.PLAN],
        },
        {
          toolName: 'codebase_investigator',
          decision: PolicyDecision.ALLOW,
          priority: PRIORITY_SUBAGENT_TOOL,
        },
      ];

      const fixedEngine = new PolicyEngine({
        rules: fixedRules,
        approvalMode: ApprovalMode.PLAN,
      });

      const fixedResult = await fixedEngine.check(
        { name: 'codebase_investigator' },
        undefined,
      );

      expect(fixedResult.decision).toBe(PolicyDecision.DENY);
    });
  });

  describe('shell command parsing failure', () => {
    it('should return ALLOW in YOLO mode even if shell command parsing fails', async () => {
      const { splitCommands } = await import('../utils/shell-utils.js');
      const rules: PolicyRule[] = [
        {
          decision: PolicyDecision.ALLOW,
          priority: 999,
          modes: [ApprovalMode.YOLO],
        },
        {
          toolName: 'run_shell_command',
          decision: PolicyDecision.ASK_USER,
          priority: 10,
        },
      ];

      engine = new PolicyEngine({
        rules,
        approvalMode: ApprovalMode.YOLO,
      });

      // Simulate parsing failure (splitCommands returning empty array)
      vi.mocked(splitCommands).mockReturnValueOnce([]);

      const result = await engine.check(
        { name: 'run_shell_command', args: { command: 'complex command' } },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.ALLOW);
      expect(result.rule).toBeDefined();
      expect(result.rule?.priority).toBe(999);
    });

    it('should return DENY in YOLO mode if shell command parsing fails and a higher priority rule says DENY', async () => {
      const { splitCommands } = await import('../utils/shell-utils.js');
      const rules: PolicyRule[] = [
        {
          toolName: 'run_shell_command',
          decision: PolicyDecision.DENY,
          priority: 2000, // Very high priority DENY (e.g. Admin)
        },
        {
          decision: PolicyDecision.ALLOW,
          priority: 999,
          modes: [ApprovalMode.YOLO],
        },
      ];

      engine = new PolicyEngine({
        rules,
        approvalMode: ApprovalMode.YOLO,
      });

      // Simulate parsing failure
      vi.mocked(splitCommands).mockReturnValueOnce([]);

      const result = await engine.check(
        { name: 'run_shell_command', args: { command: 'complex command' } },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.DENY);
    });

    it('should return ASK_USER in non-YOLO mode if shell command parsing fails', async () => {
      const { splitCommands } = await import('../utils/shell-utils.js');
      const rules: PolicyRule[] = [
        {
          toolName: 'run_shell_command',
          decision: PolicyDecision.ALLOW,
          priority: 20,
        },
      ];

      engine = new PolicyEngine({
        rules,
        approvalMode: ApprovalMode.DEFAULT,
      });

      // Simulate parsing failure
      vi.mocked(splitCommands).mockReturnValueOnce([]);

      const result = await engine.check(
        { name: 'run_shell_command', args: { command: 'complex command' } },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.ASK_USER);
      expect(result.rule).toBeDefined();
      expect(result.rule?.priority).toBe(20);
    });
  });

  describe('safety checker integration', () => {
    it('should call checker when rule allows and has safety_checker', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'test-tool',
          decision: PolicyDecision.ALLOW,
        },
      ];
      const checkers: SafetyCheckerRule[] = [
        {
          toolName: 'test-tool',
          checker: {
            type: 'external',
            name: 'test-checker',
            config: { content: 'test-content' },
          },
        },
      ];
      engine = new PolicyEngine({ rules, checkers }, mockCheckerRunner);
      vi.mocked(mockCheckerRunner.runChecker).mockResolvedValue({
        decision: SafetyCheckDecision.ALLOW,
      });

      const result = await engine.check(
        { name: 'test-tool', args: { foo: 'bar' } },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.ALLOW);
      expect(mockCheckerRunner.runChecker).toHaveBeenCalledWith(
        { name: 'test-tool', args: { foo: 'bar' } },
        {
          type: 'external',
          name: 'test-checker',
          config: { content: 'test-content' },
        },
      );
    });

    it('should handle checker errors as DENY', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'test',
          decision: PolicyDecision.ALLOW,
        },
      ];
      const checkers: SafetyCheckerRule[] = [
        {
          toolName: 'test',
          checker: {
            type: 'in-process',
            name: InProcessCheckerType.ALLOWED_PATH,
          },
        },
      ];

      mockCheckerRunner.runChecker = vi
        .fn()
        .mockRejectedValue(new Error('Checker failed'));

      engine = new PolicyEngine({ rules, checkers }, mockCheckerRunner);
      const { decision } = await engine.check({ name: 'test' }, undefined);

      expect(decision).toBe(PolicyDecision.DENY);
    });

    it('should return DENY when checker denies', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'test-tool',
          decision: PolicyDecision.ALLOW,
        },
      ];
      const checkers: SafetyCheckerRule[] = [
        {
          toolName: 'test-tool',
          checker: {
            type: 'external',
            name: 'test-checker',
            config: { content: 'test-content' },
          },
        },
      ];
      engine = new PolicyEngine({ rules, checkers }, mockCheckerRunner);
      vi.mocked(mockCheckerRunner.runChecker).mockResolvedValue({
        decision: SafetyCheckDecision.DENY,
        reason: 'test reason',
      });

      const result = await engine.check(
        { name: 'test-tool', args: { foo: 'bar' } },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.DENY);
      expect(mockCheckerRunner.runChecker).toHaveBeenCalled();
    });

    it('should not call checker if decision is not ALLOW', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'test-tool',
          decision: PolicyDecision.ASK_USER,
        },
      ];
      const checkers: SafetyCheckerRule[] = [
        {
          toolName: 'test-tool',
          checker: {
            type: 'external',
            name: 'test-checker',
            config: { content: 'test-content' },
          },
        },
      ];
      engine = new PolicyEngine({ rules, checkers }, mockCheckerRunner);

      vi.mocked(mockCheckerRunner.runChecker).mockResolvedValue({
        decision: SafetyCheckDecision.ALLOW,
      });

      const result = await engine.check(
        { name: 'test-tool', args: { foo: 'bar' } },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.ASK_USER);
      expect(mockCheckerRunner.runChecker).toHaveBeenCalled();
    });

    it('should run checkers when rule allows', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'test',
          decision: PolicyDecision.ALLOW,
        },
      ];
      const checkers: SafetyCheckerRule[] = [
        {
          toolName: 'test',
          checker: {
            type: 'in-process',
            name: InProcessCheckerType.ALLOWED_PATH,
          },
        },
      ];

      mockCheckerRunner.runChecker = vi.fn().mockResolvedValue({
        decision: SafetyCheckDecision.ALLOW,
      });

      engine = new PolicyEngine({ rules, checkers }, mockCheckerRunner);
      const { decision } = await engine.check({ name: 'test' }, undefined);

      expect(decision).toBe(PolicyDecision.ALLOW);
      expect(mockCheckerRunner.runChecker).toHaveBeenCalledTimes(1);
    });

    it('should not call checker if rule has no safety_checker', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'test-tool',
          decision: PolicyDecision.ALLOW,
        },
      ];
      engine = new PolicyEngine({ rules }, mockCheckerRunner);

      const result = await engine.check(
        { name: 'test-tool', args: { foo: 'bar' } },
        undefined,
      );

      expect(result.decision).toBe(PolicyDecision.ALLOW);
      expect(mockCheckerRunner.runChecker).not.toHaveBeenCalled();
    });
  });

  describe('serverName requirement', () => {
    it('should require serverName for checks', async () => {
      // @ts-expect-error - intentionally testing missing serverName
      expect((await engine.check({ name: 'test' })).decision).toBe(
        PolicyDecision.ASK_USER,
      );
      // When serverName is provided (even undefined), it should work
      expect((await engine.check({ name: 'test' }, undefined)).decision).toBe(
        PolicyDecision.ASK_USER,
      );
      expect(
        (await engine.check({ name: 'test' }, 'some-server')).decision,
      ).toBe(PolicyDecision.ASK_USER);
    });
    it('should run multiple checkers in priority order and stop at first denial', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'test',
          decision: PolicyDecision.ALLOW,
        },
      ];
      const checkers: SafetyCheckerRule[] = [
        {
          toolName: 'test',
          priority: 10,
          checker: { type: 'external', name: 'checker1' },
        },
        {
          toolName: 'test',
          priority: 20, // Should run first
          checker: { type: 'external', name: 'checker2' },
        },
      ];

      mockCheckerRunner.runChecker = vi
        .fn()
        .mockImplementation(async (_toolCall, config) => {
          if (config.name === 'checker2') {
            return {
              decision: SafetyCheckDecision.DENY,
              reason: 'checker2 denied',
            };
          }
          return { decision: SafetyCheckDecision.ALLOW };
        });

      engine = new PolicyEngine({ rules, checkers }, mockCheckerRunner);
      const { decision, rule } = await engine.check(
        { name: 'test' },
        undefined,
      );

      expect(decision).toBe(PolicyDecision.DENY);
      expect(rule).toBeDefined();
      expect(mockCheckerRunner.runChecker).toHaveBeenCalledTimes(1);
      expect(mockCheckerRunner.runChecker).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'checker2' }),
      );
    });
  });

  describe('addChecker', () => {
    it('should add a new checker and maintain priority order', () => {
      const checker1: SafetyCheckerRule = {
        checker: { type: 'external', name: 'checker1' },
        priority: 5,
      };
      const checker2: SafetyCheckerRule = {
        checker: { type: 'external', name: 'checker2' },
        priority: 10,
      };

      engine.addChecker(checker1);
      engine.addChecker(checker2);

      const checkers = engine.getCheckers();
      expect(checkers).toHaveLength(2);
      expect(checkers[0].priority).toBe(10);
      expect(checkers[0].checker.name).toBe('checker2');
      expect(checkers[1].priority).toBe(5);
      expect(checkers[1].checker.name).toBe('checker1');
    });
  });

  describe('checker matching logic', () => {
    it('should match checkers using toolName and argsPattern', async () => {
      const rules: PolicyRule[] = [
        { toolName: 'tool', decision: PolicyDecision.ALLOW },
      ];
      const matchingChecker: SafetyCheckerRule = {
        checker: { type: 'external', name: 'matching' },
        toolName: 'tool',
        argsPattern: /"safe":true/,
      };
      const nonMatchingChecker: SafetyCheckerRule = {
        checker: { type: 'external', name: 'non-matching' },
        toolName: 'other',
      };

      engine = new PolicyEngine(
        { rules, checkers: [matchingChecker, nonMatchingChecker] },
        mockCheckerRunner,
      );

      vi.mocked(mockCheckerRunner.runChecker).mockResolvedValue({
        decision: SafetyCheckDecision.ALLOW,
      });

      await engine.check({ name: 'tool', args: { safe: true } }, undefined);

      expect(mockCheckerRunner.runChecker).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'matching' }),
      );
      expect(mockCheckerRunner.runChecker).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'non-matching' }),
      );
    });

    it('should support wildcard patterns for checkers', async () => {
      const rules: PolicyRule[] = [
        { toolName: 'server__tool', decision: PolicyDecision.ALLOW },
      ];
      const wildcardChecker: SafetyCheckerRule = {
        checker: { type: 'external', name: 'wildcard' },
        toolName: 'server__*',
      };

      engine = new PolicyEngine(
        { rules, checkers: [wildcardChecker] },
        mockCheckerRunner,
      );

      vi.mocked(mockCheckerRunner.runChecker).mockResolvedValue({
        decision: SafetyCheckDecision.ALLOW,
      });

      await engine.check({ name: 'server__tool' }, 'server');

      expect(mockCheckerRunner.runChecker).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ name: 'wildcard' }),
      );
    });
    it('should run safety checkers when decision is ASK_USER and downgrade to DENY on failure', async () => {
      const rules: PolicyRule[] = [
        { toolName: 'tool', decision: PolicyDecision.ASK_USER },
      ];
      const checkers: SafetyCheckerRule[] = [
        {
          checker: {
            type: 'in-process',
            name: InProcessCheckerType.ALLOWED_PATH,
          },
        },
      ];

      engine = new PolicyEngine({ rules, checkers }, mockCheckerRunner);

      vi.mocked(mockCheckerRunner.runChecker).mockResolvedValue({
        decision: SafetyCheckDecision.DENY,
        reason: 'Safety check failed',
      });

      const result = await engine.check({ name: 'tool' }, undefined);
      expect(result.decision).toBe(PolicyDecision.DENY);
      expect(mockCheckerRunner.runChecker).toHaveBeenCalled();
    });

    it('should run safety checkers when decision is ASK_USER and keep ASK_USER on success', async () => {
      const rules: PolicyRule[] = [
        { toolName: 'tool', decision: PolicyDecision.ASK_USER },
      ];
      const checkers: SafetyCheckerRule[] = [
        {
          checker: {
            type: 'in-process',
            name: InProcessCheckerType.ALLOWED_PATH,
          },
        },
      ];

      engine = new PolicyEngine({ rules, checkers }, mockCheckerRunner);

      vi.mocked(mockCheckerRunner.runChecker).mockResolvedValue({
        decision: SafetyCheckDecision.ALLOW,
      });

      const result = await engine.check({ name: 'tool' }, undefined);
      expect(result.decision).toBe(PolicyDecision.ASK_USER);
      expect(mockCheckerRunner.runChecker).toHaveBeenCalled();
    });

    it('should downgrade ALLOW to ASK_USER if checker returns ASK_USER', async () => {
      const rules: PolicyRule[] = [
        { toolName: 'tool', decision: PolicyDecision.ALLOW },
      ];
      const checkers: SafetyCheckerRule[] = [
        {
          checker: {
            type: 'in-process',
            name: InProcessCheckerType.ALLOWED_PATH,
          },
        },
      ];

      engine = new PolicyEngine({ rules, checkers }, mockCheckerRunner);

      vi.mocked(mockCheckerRunner.runChecker).mockResolvedValue({
        decision: SafetyCheckDecision.ASK_USER,
        reason: 'Suspicious path',
      });

      const result = await engine.check({ name: 'tool' }, undefined);
      expect(result.decision).toBe(PolicyDecision.ASK_USER);
    });

    it('should DENY if checker returns ASK_USER in non-interactive mode', async () => {
      const rules: PolicyRule[] = [
        { toolName: 'tool', decision: PolicyDecision.ALLOW },
      ];
      const checkers: SafetyCheckerRule[] = [
        {
          checker: {
            type: 'in-process',
            name: InProcessCheckerType.ALLOWED_PATH,
          },
        },
      ];

      engine = new PolicyEngine(
        { rules, checkers, nonInteractive: true },
        mockCheckerRunner,
      );

      vi.mocked(mockCheckerRunner.runChecker).mockResolvedValue({
        decision: SafetyCheckDecision.ASK_USER,
        reason: 'Suspicious path',
      });

      const result = await engine.check({ name: 'tool' }, undefined);
      expect(result.decision).toBe(PolicyDecision.DENY);
    });
  });

  describe('getExcludedTools', () => {
    interface TestCase {
      name: string;
      rules: PolicyRule[];
      approvalMode?: ApprovalMode;
      nonInteractive?: boolean;
      expected: string[];
    }

    const testCases: TestCase[] = [
      {
        name: 'should return empty set when no rules provided',
        rules: [],
        expected: [],
      },
      {
        name: 'should apply rules without explicit modes to all modes',
        rules: [{ toolName: 'tool1', decision: PolicyDecision.DENY }],
        expected: ['tool1'],
      },
      {
        name: 'should NOT exclude tool if higher priority argsPattern rule exists',
        rules: [
          {
            toolName: 'tool1',
            decision: PolicyDecision.ALLOW,
            argsPattern: /safe/,
            priority: 100,
            modes: [ApprovalMode.DEFAULT],
          },
          {
            toolName: 'tool1',
            decision: PolicyDecision.DENY,
            priority: 10,
            modes: [ApprovalMode.DEFAULT],
          },
        ],
        expected: [],
      },
      {
        name: 'should include tools with DENY decision',
        rules: [
          {
            toolName: 'tool1',
            decision: PolicyDecision.DENY,
            modes: [ApprovalMode.DEFAULT],
          },
          {
            toolName: 'tool2',
            decision: PolicyDecision.ALLOW,
            modes: [ApprovalMode.DEFAULT],
          },
        ],
        expected: ['tool1'],
      },
      {
        name: 'should respect priority and ignore lower priority rules (DENY wins)',
        rules: [
          {
            toolName: 'tool1',
            decision: PolicyDecision.DENY,
            priority: 100,
            modes: [ApprovalMode.DEFAULT],
          },
          {
            toolName: 'tool1',
            decision: PolicyDecision.ALLOW,
            priority: 10,
            modes: [ApprovalMode.DEFAULT],
          },
        ],
        expected: ['tool1'],
      },
      {
        name: 'should respect priority and ignore lower priority rules (ALLOW wins)',
        rules: [
          {
            toolName: 'tool1',
            decision: PolicyDecision.ALLOW,
            priority: 100,
            modes: [ApprovalMode.DEFAULT],
          },
          {
            toolName: 'tool1',
            decision: PolicyDecision.DENY,
            priority: 10,
            modes: [ApprovalMode.DEFAULT],
          },
        ],
        expected: [],
      },
      {
        name: 'should NOT include ASK_USER tools even in non-interactive mode',
        rules: [
          {
            toolName: 'tool1',
            decision: PolicyDecision.ASK_USER,
            modes: [ApprovalMode.DEFAULT],
          },
        ],
        nonInteractive: true,
        expected: [],
      },
      {
        name: 'should ignore rules with argsPattern',
        rules: [
          {
            toolName: 'tool1',
            decision: PolicyDecision.DENY,
            argsPattern: /something/,
            modes: [ApprovalMode.DEFAULT],
          },
        ],
        expected: [],
      },
      {
        name: 'should respect approval mode (PLAN mode)',
        rules: [
          {
            toolName: 'tool1',
            decision: PolicyDecision.DENY,
            modes: [ApprovalMode.PLAN],
          },
        ],
        approvalMode: ApprovalMode.PLAN,
        expected: ['tool1'],
      },
      {
        name: 'should respect approval mode (DEFAULT mode)',
        rules: [
          {
            toolName: 'tool1',
            decision: PolicyDecision.DENY,
            modes: [ApprovalMode.PLAN],
          },
        ],
        approvalMode: ApprovalMode.DEFAULT,
        expected: [],
      },
      {
        name: 'should respect wildcard ALLOW rules (e.g. YOLO mode)',
        rules: [
          {
            decision: PolicyDecision.ALLOW,
            priority: 999,
            modes: [ApprovalMode.YOLO],
          },
          {
            toolName: 'dangerous-tool',
            decision: PolicyDecision.DENY,
            priority: 10,
            modes: [ApprovalMode.YOLO],
          },
        ],
        approvalMode: ApprovalMode.YOLO,
        expected: [],
      },
      {
        name: 'should respect server wildcard DENY',
        rules: [
          {
            toolName: 'server__*',
            decision: PolicyDecision.DENY,
            modes: [ApprovalMode.DEFAULT],
          },
        ],
        expected: ['server__*'],
      },
      {
        name: 'should expand server wildcard for specific tools if already processed',
        rules: [
          {
            toolName: 'server__*',
            decision: PolicyDecision.DENY,
            priority: 100,
            modes: [ApprovalMode.DEFAULT],
          },
          {
            toolName: 'server__tool1',
            decision: PolicyDecision.DENY,
            priority: 10,
            modes: [ApprovalMode.DEFAULT],
          },
        ],
        expected: ['server__*', 'server__tool1'],
      },
      {
        name: 'should exclude run_shell_command but NOT write_file in simulated Plan Mode',
        approvalMode: ApprovalMode.PLAN,
        rules: [
          {
            // Simulates the high-priority allow for plans directory
            toolName: 'write_file',
            decision: PolicyDecision.ALLOW,
            priority: 70,
            argsPattern: /plans/,
            modes: [ApprovalMode.PLAN],
          },
          {
            // Simulates the global deny in Plan Mode
            decision: PolicyDecision.DENY,
            priority: 60,
            modes: [ApprovalMode.PLAN],
          },
          {
            // Simulates a tool from another policy (e.g. write.toml)
            toolName: 'run_shell_command',
            decision: PolicyDecision.ASK_USER,
            priority: 10,
          },
        ],
        expected: ['run_shell_command'],
      },
      {
        name: 'should NOT exclude tool if covered by a higher priority wildcard ALLOW',
        rules: [
          {
            toolName: 'server__*',
            decision: PolicyDecision.ALLOW,
            priority: 100,
            modes: [ApprovalMode.DEFAULT],
          },
          {
            toolName: 'server__tool1',
            decision: PolicyDecision.DENY,
            priority: 10,
            modes: [ApprovalMode.DEFAULT],
          },
        ],
        expected: [],
      },
    ];

    it.each(testCases)(
      '$name',
      ({ rules, approvalMode, nonInteractive, expected }) => {
        engine = new PolicyEngine({
          rules,
          approvalMode: approvalMode ?? ApprovalMode.DEFAULT,
          nonInteractive: nonInteractive ?? false,
        });
        const excluded = engine.getExcludedTools();
        expect(Array.from(excluded).sort()).toEqual(expected.sort());
      },
    );
  });

  describe('YOLO mode with ask_user tool', () => {
    it('should return ASK_USER for ask_user tool even in YOLO mode', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'ask_user',
          decision: PolicyDecision.ASK_USER,
          priority: 999,
          modes: [ApprovalMode.YOLO],
        },
        {
          decision: PolicyDecision.ALLOW,
          priority: 998,
          modes: [ApprovalMode.YOLO],
        },
      ];

      engine = new PolicyEngine({
        rules,
        approvalMode: ApprovalMode.YOLO,
      });

      const result = await engine.check(
        { name: 'ask_user', args: {} },
        undefined,
      );
      expect(result.decision).toBe(PolicyDecision.ASK_USER);
    });

    it('should return ALLOW for other tools in YOLO mode', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'ask_user',
          decision: PolicyDecision.ASK_USER,
          priority: 999,
          modes: [ApprovalMode.YOLO],
        },
        {
          decision: PolicyDecision.ALLOW,
          priority: 998,
          modes: [ApprovalMode.YOLO],
        },
      ];

      engine = new PolicyEngine({
        rules,
        approvalMode: ApprovalMode.YOLO,
      });

      const result = await engine.check(
        { name: 'run_shell_command', args: { command: 'ls' } },
        undefined,
      );
      expect(result.decision).toBe(PolicyDecision.ALLOW);
    });
  });

  describe('Plan Mode', () => {
    it('should allow activate_skill but deny shell commands in Plan Mode', async () => {
      const rules: PolicyRule[] = [
        {
          decision: PolicyDecision.DENY,
          priority: 60,
          modes: [ApprovalMode.PLAN],
          denyMessage:
            'You are in Plan Mode with access to read-only tools. Execution of scripts (including those from skills) is blocked.',
        },
        {
          toolName: 'activate_skill',
          decision: PolicyDecision.ALLOW,
          priority: 70,
          modes: [ApprovalMode.PLAN],
        },
      ];

      engine = new PolicyEngine({
        rules,
        approvalMode: ApprovalMode.PLAN,
      });

      const skillResult = await engine.check(
        { name: 'activate_skill', args: { name: 'test' } },
        undefined,
      );
      expect(skillResult.decision).toBe(PolicyDecision.ALLOW);

      const shellResult = await engine.check(
        { name: 'run_shell_command', args: { command: 'ls' } },
        undefined,
      );
      expect(shellResult.decision).toBe(PolicyDecision.DENY);
      expect(shellResult.rule?.denyMessage).toContain(
        'Execution of scripts (including those from skills) is blocked',
      );
    });
  });

  describe('removeRulesByTier', () => {
    it('should remove rules matching a specific tier', () => {
      engine.addRule({
        toolName: 'rule1',
        decision: PolicyDecision.ALLOW,
        priority: 1.1,
      });
      engine.addRule({
        toolName: 'rule2',
        decision: PolicyDecision.ALLOW,
        priority: 1.5,
      });
      engine.addRule({
        toolName: 'rule3',
        decision: PolicyDecision.ALLOW,
        priority: 2.1,
      });
      engine.addRule({
        toolName: 'rule4',
        decision: PolicyDecision.ALLOW,
        priority: 0.5,
      });
      engine.addRule({ toolName: 'rule5', decision: PolicyDecision.ALLOW }); // priority undefined -> 0

      expect(engine.getRules()).toHaveLength(5);

      engine.removeRulesByTier(1);

      const rules = engine.getRules();
      expect(rules).toHaveLength(3);
      expect(rules.some((r) => r.toolName === 'rule1')).toBe(false);
      expect(rules.some((r) => r.toolName === 'rule2')).toBe(false);
      expect(rules.some((r) => r.toolName === 'rule3')).toBe(true);
      expect(rules.some((r) => r.toolName === 'rule4')).toBe(true);
      expect(rules.some((r) => r.toolName === 'rule5')).toBe(true);
    });

    it('should handle removing tier 0 rules (including undefined priority)', () => {
      engine.addRule({
        toolName: 'rule1',
        decision: PolicyDecision.ALLOW,
        priority: 0.5,
      });
      engine.addRule({ toolName: 'rule2', decision: PolicyDecision.ALLOW }); // defaults to 0
      engine.addRule({
        toolName: 'rule3',
        decision: PolicyDecision.ALLOW,
        priority: 1.5,
      });

      expect(engine.getRules()).toHaveLength(3);

      engine.removeRulesByTier(0);

      const rules = engine.getRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].toolName).toBe('rule3');
    });
  });

  describe('removeCheckersByTier', () => {
    it('should remove checkers matching a specific tier', () => {
      engine.addChecker({
        checker: { type: 'external', name: 'c1' },
        priority: 1.1,
      });
      engine.addChecker({
        checker: { type: 'external', name: 'c2' },
        priority: 1.9,
      });
      engine.addChecker({
        checker: { type: 'external', name: 'c3' },
        priority: 2.5,
      });

      expect(engine.getCheckers()).toHaveLength(3);

      engine.removeCheckersByTier(1);

      const checkers = engine.getCheckers();
      expect(checkers).toHaveLength(1);
      expect(checkers[0].priority).toBe(2.5);
    });
  });
});
