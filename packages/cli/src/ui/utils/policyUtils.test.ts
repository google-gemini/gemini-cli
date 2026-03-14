/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatArgsPattern, buildPolicyListItems } from './policyUtils.js';
import { PolicyDecision } from '@google/gemini-cli-core';

describe('formatArgsPattern', () => {
  it('should return undefined for undefined argsPattern', () => {
    expect(formatArgsPattern(undefined)).toBeUndefined();
  });

  it('should parse commandPrefix pattern (git diff)', () => {
    // buildArgsPatterns produces this for commandPrefix: "git diff"
    const pattern = new RegExp('"command":"git\\ diff(?:[\\s"]|\\\\")');
    expect(formatArgsPattern(pattern)).toBe('git diff*');
  });

  it('should parse commandPrefix with special chars (npm run test:ci)', () => {
    // escapeRegex escapes the colon
    const pattern = new RegExp(
      '"command":"npm\\ run\\ test\\:ci(?:[\\s"]|\\\\")',
    );
    expect(formatArgsPattern(pattern)).toBe('npm run test:ci*');
  });

  it('should parse commandPrefix with single word (ls)', () => {
    const pattern = new RegExp('"command":"ls(?:[\\s"]|\\\\")');
    expect(formatArgsPattern(pattern)).toBe('ls*');
  });

  it('should parse commandRegex pattern', () => {
    const pattern = new RegExp('"command":"npm run .*');
    expect(formatArgsPattern(pattern)).toBe('npm run .*');
  });

  it('should parse file_path pattern', () => {
    const pattern = new RegExp('"file_path":".*\\/plans\\/.*"');
    expect(formatArgsPattern(pattern)).toBe('path: .*\\/plans\\/.*');
  });

  it('should return file_path fallback for unrecognized file_path shape', () => {
    const pattern = new RegExp('"file_path"');
    expect(formatArgsPattern(pattern)).toBe('path: ...');
  });

  it('should return raw source for unknown short regex', () => {
    const pattern = new RegExp('something_unknown');
    expect(formatArgsPattern(pattern)).toBe('something_unknown');
  });

  it('should truncate long unknown patterns', () => {
    const longPattern = new RegExp('a'.repeat(50));
    const result = formatArgsPattern(longPattern);
    expect(result).toBe('a'.repeat(40) + '...');
  });
});

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
      { decision: PolicyDecision.ALLOW },
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
        argsPattern: new RegExp('"command":"git\\ diff(?:[\\s"]|\\\\")'),
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

  it('should format constraint from argsPattern', () => {
    const rules = [
      {
        decision: PolicyDecision.ALLOW,
        toolName: 'run_shell_command',
        argsPattern: new RegExp('"command":"git\\ show(?:[\\s"]|\\\\")'),
      },
    ];

    const items = buildPolicyListItems(
      rules,
      toolDisplayNames,
      PolicyDecision.ALLOW,
    );
    expect(items[0].constraint).toBe('git show*');
  });

  it('should have undefined constraint when no argsPattern', () => {
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
