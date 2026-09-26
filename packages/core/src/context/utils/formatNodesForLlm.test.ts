/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatNodesForLlm } from './formatNodesForLlm.js';
import { NodeType, type ConcreteNode } from '../graph/types.js';

describe('formatNodesForLlm', () => {
  it('should preserve first-seen turn numbering with repeated and empty turn IDs', () => {
    const nodes: ConcreteNode[] = [
      { turnId: 'older', text: 'first' },
      { turnId: 'newer', text: 'second' },
      { turnId: 'older', text: 'third' },
      { turnId: '', text: 'untracked' },
    ].map(({ turnId, text }, index) => ({
      id: String(index),
      turnId,
      type: NodeType.USER_PROMPT,
      timestamp: index,
      role: 'user',
      payload: { text },
    }));
    const originalNodes = structuredClone(nodes);

    expect(formatNodesForLlm(nodes)).toBe(
      '[Turn -1] [USER] [USER_PROMPT]: first\n' +
        '[Turn 0] [USER] [USER_PROMPT]: second\n' +
        '[Turn -1] [USER] [USER_PROMPT]: third\n' +
        '[USER] [USER_PROMPT]: untracked\n',
    );
    expect(nodes).toEqual(originalNodes);
  });

  it('should omit turn markers when all turn IDs are empty', () => {
    const nodes: ConcreteNode[] = [
      {
        id: 'untracked',
        turnId: '',
        type: NodeType.USER_PROMPT,
        timestamp: 100,
        role: 'user',
        payload: { text: 'message' },
      },
    ];

    expect(formatNodesForLlm(nodes)).toBe('[USER] [USER_PROMPT]: message\n');
  });

  it('should return an empty transcript for an empty history', () => {
    expect(formatNodesForLlm([])).toBe('');
  });

  it('should format standard user and model text messages with relative turns', () => {
    const nodes: ConcreteNode[] = [
      {
        id: '1',
        turnId: 'turn-a',
        type: NodeType.USER_PROMPT,
        timestamp: 1000,
        role: 'user',
        payload: { text: 'Hello AI' },
      },
      {
        id: '2',
        turnId: 'turn-b',
        type: NodeType.AGENT_THOUGHT,
        timestamp: 1001,
        role: 'model',
        payload: { text: 'Hello User' },
      },
    ];

    const result = formatNodesForLlm(nodes);
    // turn-a is idx 0 (relative: -1)
    // turn-b is idx 1 (relative: 0)
    expect(result).toContain('[Turn -1] [USER] [USER_PROMPT]: Hello AI');
    expect(result).toContain('[Turn 0] [MODEL] [AGENT_THOUGHT]: Hello User');
  });

  it('should format tool calls correctly', () => {
    const nodes: ConcreteNode[] = [
      {
        id: '1',
        turnId: '1',
        type: NodeType.TOOL_EXECUTION,
        timestamp: 1000,
        role: 'model',
        payload: {
          functionCall: { name: 'run_shell_command', args: { cmd: 'ls' } },
        },
      },
    ];

    const result = formatNodesForLlm(nodes);
    expect(result).toContain(
      '[Turn 0] [MODEL] [TOOL_EXECUTION]: CALL: run_shell_command({"cmd":"ls"})',
    );
  });

  it('should format tool responses with semantic wrappers', () => {
    const nodes: ConcreteNode[] = [
      {
        id: '1',
        turnId: '1',
        type: NodeType.TOOL_EXECUTION,
        timestamp: 1000,
        role: 'user',
        payload: {
          functionResponse: {
            name: 'run_shell_command',
            response: { output: 'file.txt' },
          },
        },
      },
    ];

    const result = formatNodesForLlm(nodes);
    expect(result).toContain(
      '[Turn 0] [USER] [TOOL_EXECUTION]: [SHELL EXECUTION (run_shell_command)]: {"output":"file.txt"}',
    );
  });

  it('should truncate massive tool responses and retain the semantic wrapper', () => {
    // Generate a 3000 character string (exceeds the default 2000 limit)
    const massiveOutput = 'A'.repeat(1500) + 'B'.repeat(1500);

    const nodes: ConcreteNode[] = [
      {
        id: '1',
        turnId: '1',
        type: NodeType.TOOL_EXECUTION,
        timestamp: 1000,
        role: 'user',
        payload: {
          functionResponse: {
            name: 'read_file',
            response: { output: massiveOutput },
          },
        },
      },
    ];

    const result = formatNodesForLlm(nodes, { maxToolResponseChars: 2000 });

    expect(result).toContain('[FILE/WEB CONTENT (read_file)]: {"output":"AAAA');
    expect(result).toContain('[TRUNCATED');
    expect(result).toContain('chars] ...BBBB');
    expect(result.length).toBeLessThan(2500); // Ensure it was actually truncated
  });

  it('should fallback to SYSTEM role if role is undefined', () => {
    const nodes: ConcreteNode[] = [
      {
        id: '1',
        turnId: '1',
        type: NodeType.SNAPSHOT,
        timestamp: 1000,
        // @ts-expect-error testing undefined role
        role: undefined,
        payload: { text: 'Summary of past' },
      },
    ];

    const result = formatNodesForLlm(nodes);
    expect(result).toContain('[Turn 0] [SYSTEM] [SNAPSHOT]: Summary of past');
  });
});
