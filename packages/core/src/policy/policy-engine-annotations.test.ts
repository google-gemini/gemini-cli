/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEngine } from './policy-engine.js';
import { PolicyDecision, type PolicyRule, ApprovalMode } from './types.js';

describe('PolicyEngine Enhancements (Wildcards and Annotations)', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine({ approvalMode: ApprovalMode.DEFAULT });
  });

  describe('mcpName = "*" Wildcard Matching', () => {
    it('should match any serverName when mcpName is "*"', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: '*__*', // Represents mcpName = "*" from TOML
          decision: PolicyDecision.ALLOW,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Match any server when serverName is provided
      expect(
        (await engine.check({ name: 'server1__tool' }, 'server1')).decision,
      ).toBe(PolicyDecision.ALLOW);
      expect(
        (await engine.check({ name: 'server2__tool' }, 'server2')).decision,
      ).toBe(PolicyDecision.ALLOW);

      // Match unqualified name + serverName
      expect((await engine.check({ name: 'tool' }, 'server1')).decision).toBe(
        PolicyDecision.ALLOW,
      );

      // Should NOT match if NO serverName is provided (not an MCP tool call)
      // Even if the tool name contains __, without serverName it shouldn't match *__* rule
      expect(
        (await engine.check({ name: 'some__qualified__name' }, undefined))
          .decision,
      ).toBe(PolicyDecision.ASK_USER);

      // Should NOT match simple tool name
      expect((await engine.check({ name: 'ls' }, undefined)).decision).toBe(
        PolicyDecision.ASK_USER,
      );
    });

    it('should prioritize specific server wildcards over global wildcard', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: '*__*',
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

      expect(
        (await engine.check({ name: 'other-server__tool' }, 'other-server'))
          .decision,
      ).toBe(PolicyDecision.ALLOW);
      expect(
        (await engine.check({ name: 'blocked-server__tool' }, 'blocked-server'))
          .decision,
      ).toBe(PolicyDecision.DENY);
    });
  });

  describe('toolAnnotations Matching', () => {
    it('should match tools based on annotations', async () => {
      const rules: PolicyRule[] = [
        {
          toolAnnotations: { readOnlyHint: true },
          decision: PolicyDecision.ALLOW,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Match with annotation
      expect(
        (
          await engine.check({ name: 'tool' }, undefined, {
            readOnlyHint: true,
          })
        ).decision,
      ).toBe(PolicyDecision.ALLOW);

      // No match if annotation missing
      expect(
        (await engine.check({ name: 'tool' }, undefined, {})).decision,
      ).toBe(PolicyDecision.ASK_USER);

      // No match if annotation value differs
      expect(
        (
          await engine.check({ name: 'tool' }, undefined, {
            readOnlyHint: false,
          })
        ).decision,
      ).toBe(PolicyDecision.ASK_USER);
    });

    it('should match multiple annotations', async () => {
      const rules: PolicyRule[] = [
        {
          toolAnnotations: { a: 1, b: 2 },
          decision: PolicyDecision.ALLOW,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Match if all present
      expect(
        (await engine.check({ name: 'tool' }, undefined, { a: 1, b: 2, c: 3 }))
          .decision,
      ).toBe(PolicyDecision.ALLOW);

      // No match if one missing
      expect(
        (await engine.check({ name: 'tool' }, undefined, { a: 1 })).decision,
      ).toBe(PolicyDecision.ASK_USER);
    });

    it('should work together with tool names', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: 'read_file',
          toolAnnotations: { safe: true },
          decision: PolicyDecision.ALLOW,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Match tool name AND annotation
      expect(
        (await engine.check({ name: 'read_file' }, undefined, { safe: true }))
          .decision,
      ).toBe(PolicyDecision.ALLOW);

      // No match if name differs
      expect(
        (await engine.check({ name: 'write_file' }, undefined, { safe: true }))
          .decision,
      ).toBe(PolicyDecision.ASK_USER);

      // No match if annotation differs
      expect(
        (await engine.check({ name: 'read_file' }, undefined, { safe: false }))
          .decision,
      ).toBe(PolicyDecision.ASK_USER);
    });

    it('should work together with mcpName wildcard', async () => {
      const rules: PolicyRule[] = [
        {
          toolName: '*__*',
          toolAnnotations: { readOnlyHint: true },
          decision: PolicyDecision.ALLOW,
        },
      ];

      engine = new PolicyEngine({ rules });

      // Match MCP tool with annotation
      expect(
        (
          await engine.check({ name: 'server__tool' }, 'server', {
            readOnlyHint: true,
          })
        ).decision,
      ).toBe(PolicyDecision.ALLOW);

      // No match if annotation differs
      expect(
        (
          await engine.check({ name: 'server__tool' }, 'server', {
            readOnlyHint: false,
          })
        ).decision,
      ).toBe(PolicyDecision.ASK_USER);

      // No match if not an MCP tool call (serverName undefined)
      expect(
        (
          await engine.check({ name: 'server__tool' }, undefined, {
            readOnlyHint: true,
          })
        ).decision,
      ).toBe(PolicyDecision.ASK_USER);
    });
  });
});
