/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEngine } from './policy-engine.js';
import {
  PolicyDecision,
  type PolicyRule,
  type PolicyEngineConfig,
} from './types.js';
import type { FunctionCall } from '@google/genai';

describe('PolicyEngine', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  describe('constructor', () => {
    it('should use default config when none provided', () => {
      const decision = engine.check({ name: 'test' });
      expect(decision).toBe(PolicyDecision.ASK_USER);
    });

    it('should respect custom default decision', () => {
      engine = new PolicyEngine({ defaultDecision: PolicyDecision.DENY });
      const decision = engine.check({ name: 'test' });
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
    it('should match tool by name', () => {
      const rules: PolicyRule[] = [
        { toolName: 'shell', decision: PolicyDecision.ALLOW },
        { toolName: 'edit', decision: PolicyDecision.DENY },
      ];

      engine = new PolicyEngine({ rules });

      expect(engine.check({ name: 'shell' })).toBe(PolicyDecision.ALLOW);
      expect(engine.check({ name: 'edit' })).toBe(PolicyDecision.DENY);
      expect(engine.check({ name: 'other' })).toBe(PolicyDecision.ASK_USER);
    });

    it('should match by args pattern', () => {
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

      expect(engine.check(dangerousCall)).toBe(PolicyDecision.DENY);
      expect(engine.check(safeCall)).toBe(PolicyDecision.ALLOW);
    });

    it('should apply rules by priority', () => {
      const rules: PolicyRule[] = [
        { toolName: 'shell', decision: PolicyDecision.DENY, priority: 1 },
        { toolName: 'shell', decision: PolicyDecision.ALLOW, priority: 10 },
      ];

      engine = new PolicyEngine({ rules });

      // Higher priority rule (ALLOW) should win
      expect(engine.check({ name: 'shell' })).toBe(PolicyDecision.ALLOW);
    });

    it('should apply wildcard rules (no toolName)', () => {
      const rules: PolicyRule[] = [
        { decision: PolicyDecision.DENY }, // Applies to all tools
        { toolName: 'safe-tool', decision: PolicyDecision.ALLOW, priority: 10 },
      ];

      engine = new PolicyEngine({ rules });

      expect(engine.check({ name: 'safe-tool' })).toBe(PolicyDecision.ALLOW);
      expect(engine.check({ name: 'any-other-tool' })).toBe(
        PolicyDecision.DENY,
      );
    });

    it('should handle non-interactive mode', () => {
      const config: PolicyEngineConfig = {
        nonInteractive: true,
        rules: [
          { toolName: 'interactive-tool', decision: PolicyDecision.ASK_USER },
          { toolName: 'allowed-tool', decision: PolicyDecision.ALLOW },
        ],
      };

      engine = new PolicyEngine(config);

      // ASK_USER should become DENY in non-interactive mode
      expect(engine.check({ name: 'interactive-tool' })).toBe(
        PolicyDecision.DENY,
      );
      // ALLOW should remain ALLOW
      expect(engine.check({ name: 'allowed-tool' })).toBe(PolicyDecision.ALLOW);
      // Default ASK_USER should also become DENY
      expect(engine.check({ name: 'unknown-tool' })).toBe(PolicyDecision.DENY);
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

    it('should apply newly added rules', () => {
      expect(engine.check({ name: 'new-tool' })).toBe(PolicyDecision.ASK_USER);

      engine.addRule({ toolName: 'new-tool', decision: PolicyDecision.ALLOW });

      expect(engine.check({ name: 'new-tool' })).toBe(PolicyDecision.ALLOW);
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
    it('should match MCP server wildcard patterns', () => {
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
      expect(engine.check({ name: 'my-server__tool1' })).toBe(
        PolicyDecision.ALLOW,
      );
      expect(engine.check({ name: 'my-server__another_tool' })).toBe(
        PolicyDecision.ALLOW,
      );

      // Should match blocked-server tools
      expect(engine.check({ name: 'blocked-server__tool1' })).toBe(
        PolicyDecision.DENY,
      );
      expect(engine.check({ name: 'blocked-server__dangerous' })).toBe(
        PolicyDecision.DENY,
      );

      // Should not match other patterns
      expect(engine.check({ name: 'other-server__tool' })).toBe(
        PolicyDecision.ASK_USER,
      );
      expect(engine.check({ name: 'my-server-tool' })).toBe(
        PolicyDecision.ASK_USER,
      ); // No __ separator
      expect(engine.check({ name: 'my-server' })).toBe(PolicyDecision.ASK_USER); // No tool name
    });

    it('should prioritize specific tool rules over server wildcards', () => {
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
      expect(engine.check({ name: 'my-server__dangerous-tool' })).toBe(
        PolicyDecision.DENY,
      );
      expect(engine.check({ name: 'my-server__safe-tool' })).toBe(
        PolicyDecision.ALLOW,
      );
    });
  });

  describe('complex scenarios', () => {
    it('should handle multiple matching rules with different priorities', () => {
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
      expect(engine.check({ name: 'shell', args: { command: 'ls -la' } })).toBe(
        PolicyDecision.ALLOW,
      );

      // Matches middle priority rule (shell without ls)
      expect(engine.check({ name: 'shell', args: { command: 'pwd' } })).toBe(
        PolicyDecision.ASK_USER,
      );

      // Matches lowest priority rule (not shell)
      expect(engine.check({ name: 'edit' })).toBe(PolicyDecision.DENY);
    });

    it('should handle tools with no args', () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'read',
          argsPattern: /secret/,
          decision: PolicyDecision.DENY,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Tool call without args should not match pattern
      expect(engine.check({ name: 'read' })).toBe(PolicyDecision.ASK_USER);

      // Tool call with args not matching pattern
      expect(engine.check({ name: 'read', args: { file: 'public.txt' } })).toBe(
        PolicyDecision.ASK_USER,
      );

      // Tool call with args matching pattern
      expect(engine.check({ name: 'read', args: { file: 'secret.txt' } })).toBe(
        PolicyDecision.DENY,
      );
    });

    it('should match args pattern regardless of property order', () => {
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

      expect(engine.check({ name: 'shell', args: args1 })).toBe(
        PolicyDecision.DENY,
      );
      expect(engine.check({ name: 'shell', args: args2 })).toBe(
        PolicyDecision.DENY,
      );

      // Verify safe command doesn't match
      const safeArgs = { command: 'ls -la', path: '/home' };
      expect(engine.check({ name: 'shell', args: safeArgs })).toBe(
        PolicyDecision.ASK_USER,
      );
    });

    it('should handle nested objects in args with stable stringification', () => {
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

      expect(engine.check({ name: 'api', args: args1 })).toBe(
        PolicyDecision.DENY,
      );
      expect(engine.check({ name: 'api', args: args2 })).toBe(
        PolicyDecision.DENY,
      );
    });

    it('should handle circular references without stack overflow', () => {
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
      expect(() =>
        engine.check({ name: 'test', args: circularArgs }),
      ).not.toThrow();

      // Should detect the circular reference pattern
      expect(engine.check({ name: 'test', args: circularArgs })).toBe(
        PolicyDecision.DENY,
      );

      // Non-circular object should not match
      const normalArgs = { name: 'test', data: { value: 'normal' } };
      expect(engine.check({ name: 'test', args: normalArgs })).toBe(
        PolicyDecision.ASK_USER,
      );
    });

    it('should handle deep circular references', () => {
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
      expect(() =>
        engine.check({ name: 'deep', args: deepCircular }),
      ).not.toThrow();

      // Should detect the circular reference
      expect(engine.check({ name: 'deep', args: deepCircular })).toBe(
        PolicyDecision.DENY,
      );
    });

    it('should handle repeated non-circular objects correctly', () => {
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
      expect(engine.check({ name: 'test', args })).toBe(PolicyDecision.ALLOW);
    });

    it('should omit undefined and function values from objects', () => {
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
      expect(engine.check({ name: 'test', args })).toBe(PolicyDecision.ALLOW);

      // Check that the pattern would NOT match if undefined was included
      const rulesWithUndefined: PolicyRule[] = [
        {
          toolName: 'test',
          argsPattern: /undefinedValue/,
          decision: PolicyDecision.DENY,
        },
      ];
      engine = new PolicyEngine({ rules: rulesWithUndefined });
      expect(engine.check({ name: 'test', args })).toBe(
        PolicyDecision.ASK_USER,
      );

      // Check that the pattern would NOT match if function was included
      const rulesWithFunction: PolicyRule[] = [
        {
          toolName: 'test',
          argsPattern: /functionValue/,
          decision: PolicyDecision.DENY,
        },
      ];
      engine = new PolicyEngine({ rules: rulesWithFunction });
      expect(engine.check({ name: 'test', args })).toBe(
        PolicyDecision.ASK_USER,
      );
    });

    it('should convert undefined and functions to null in arrays', () => {
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
      expect(engine.check({ name: 'test', args })).toBe(PolicyDecision.ALLOW);
    });

    it('should produce valid JSON for all inputs', () => {
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
        expect(() => engine.check({ name: 'test', args: input })).not.toThrow();

        // The check should succeed
        expect(engine.check({ name: 'test', args: input })).toBe(
          PolicyDecision.ALLOW,
        );
      }
    });

    it('should respect toJSON methods on objects', () => {
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
      expect(engine.check({ name: 'test', args })).toBe(PolicyDecision.ALLOW);
    });

    it('should handle toJSON that returns primitives', () => {
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
      expect(engine.check({ name: 'test', args })).toBe(PolicyDecision.ALLOW);
    });

    it('should handle toJSON that throws an error', () => {
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
      expect(engine.check({ name: 'test', args })).toBe(PolicyDecision.ALLOW);
    });
  });
});
