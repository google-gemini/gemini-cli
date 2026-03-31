/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { buildPolicyListItems } from './policyUtils.js';
import { PolicyDecision } from '@google/gemini-cli-core';

describe('buildPolicyListItems', () => {
  const toolDisplayNames = new Map([
    ['run_shell_command', 'Shell'],
    ['glob', 'FindFiles'],
    ['read_file', 'ReadFile'],
  ]);

  it('should filter by decision correctly', () => {
    const rules = [
      { decision: PolicyDecision.ALLOW, toolName: 'glob', priority: 10 },
      { decision: PolicyDecision.DENY, toolName: 'read_file', priority: 5 },
      { decision: PolicyDecision.ALLOW, toolName: 'read_file', priority: 3 },
    ];

    const allowItems = buildPolicyListItems(
      rules,
      toolDisplayNames,
      PolicyDecision.ALLOW,
    );
    expect(allowItems).toHaveLength(2);
    expect(allowItems[0].toolDisplayName).toBe('FindFiles');
    expect(allowItems[1].toolDisplayName).toBe('ReadFile');

    const denyItems = buildPolicyListItems(
      rules,
      toolDisplayNames,
      PolicyDecision.DENY,
    );
    expect(denyItems).toHaveLength(1);
    expect(denyItems[0].toolDisplayName).toBe('ReadFile');
  });

  it('should sort by priority descending', () => {
    const rules = [
      { decision: PolicyDecision.ALLOW, toolName: 'glob', priority: 1 },
      {
        decision: PolicyDecision.ALLOW,
        toolName: 'run_shell_command',
        priority: 10,
      },
      { decision: PolicyDecision.ALLOW, toolName: 'read_file', priority: 5 },
    ];

    const items = buildPolicyListItems(
      rules,
      toolDisplayNames,
      PolicyDecision.ALLOW,
    );
    expect(items[0].toolDisplayName).toBe('Shell');
    expect(items[1].toolDisplayName).toBe('ReadFile');
    expect(items[2].toolDisplayName).toBe('FindFiles');
  });

  it('should resolve display names from map', () => {
    const rules = [
      { decision: PolicyDecision.ALLOW, toolName: 'run_shell_command' },
      { decision: PolicyDecision.ALLOW, toolName: 'unknown_tool' },
      { decision: PolicyDecision.ALLOW, toolName: '*' },
    ];

    const items = buildPolicyListItems(
      rules,
      toolDisplayNames,
      PolicyDecision.ALLOW,
    );
    expect(items[0].toolDisplayName).toBe('Shell');
    expect(items[1].toolDisplayName).toBe('unknown_tool');
    expect(items[2].toolDisplayName).toBe('all tools');
  });

  it('should include constraint in searchText', () => {
    const rules = [
      {
        decision: PolicyDecision.ALLOW,
        toolName: 'run_shell_command',
        constraintDisplay: 'git diff*',
      },
    ];

    const items = buildPolicyListItems(
      rules,
      toolDisplayNames,
      PolicyDecision.ALLOW,
    );
    expect(items[0].searchText).toContain('Shell');
    expect(items[0].searchText).toContain('git diff*');
  });

  it('should include both display name and internal name in searchText', () => {
    const rules = [
      {
        decision: PolicyDecision.ALLOW,
        toolName: 'run_shell_command',
      },
    ];

    const items = buildPolicyListItems(
      rules,
      toolDisplayNames,
      PolicyDecision.ALLOW,
    );
    expect(items[0].searchText).toContain('Shell');
    expect(items[0].searchText).toContain('run_shell_command');
  });

  it('should take constraint from constraintDisplay', () => {
    const rules = [
      {
        decision: PolicyDecision.ALLOW,
        toolName: 'run_shell_command',
        constraintDisplay: 'git show*',
      },
    ];

    const items = buildPolicyListItems(
      rules,
      toolDisplayNames,
      PolicyDecision.ALLOW,
    );
    expect(items[0].constraint).toBe('git show*');
  });

  it('should have undefined constraint when no constraintDisplay', () => {
    const rules = [
      { decision: PolicyDecision.ALLOW, toolName: 'glob', priority: 5 },
    ];

    const items = buildPolicyListItems(
      rules,
      toolDisplayNames,
      PolicyDecision.ALLOW,
    );
    expect(items[0].constraint).toBeUndefined();
  });
});
