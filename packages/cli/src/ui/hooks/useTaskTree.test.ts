/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { buildTaskTree } from './useTaskTree.js';
import type { IndividualToolCallDisplay } from '../types.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';

/**
 * Factory helper: creates a minimal IndividualToolCallDisplay for testing.
 * Only callId, name, and status are required; parentCallId is optional.
 */
function makeToolCall(
  callId: string,
  name: string,
  status: CoreToolCallStatus = CoreToolCallStatus.Success,
  parentCallId?: string,
): IndividualToolCallDisplay {
  return {
    callId,
    parentCallId,
    name,
    description: `${name} description`,
    resultDisplay: undefined,
    status,
    confirmationDetails: undefined,
  };
}

describe('buildTaskTree', () => {
  it('returns an empty array for an empty input list', () => {
    const result = buildTaskTree([]);
    expect(result).toEqual([]);
  });

  it('returns a single root node when given one tool call', () => {
    const calls = [makeToolCall('a', 'read_file')];
    const result = buildTaskTree(calls);

    expect(result).toHaveLength(1);
    expect(result[0].tool.callId).toBe('a');
    expect(result[0].depth).toBe(0);
    expect(result[0].children).toHaveLength(0);
  });

  it('returns a single synthetic root node for a flat list > 1 instead of multiple root nodes', () => {
    const calls = [
      makeToolCall('a', 'read_file'),
      makeToolCall('b', 'write_file'),
      makeToolCall('c', 'search_files'),
    ];
    const result = buildTaskTree(calls);

    // It should now be wrapped in a synthetic root
    expect(result).toHaveLength(1);
    expect(result[0].tool.callId).toBe('__synthetic_turn_root__');
    expect(result[0].children).toHaveLength(3);
    expect(result[0].children.every((n) => n.depth === 1)).toBe(true);
    expect(result[0].children.every((n) => n.children.length === 0)).toBe(true);
  });

  it('builds correct parent-child tree from parentCallId edges', () => {
    const calls = [
      makeToolCall('parent', 'agent_task', CoreToolCallStatus.Executing),
      makeToolCall(
        'child-1',
        'read_file',
        CoreToolCallStatus.Success,
        'parent',
      ),
      makeToolCall(
        'child-2',
        'write_file',
        CoreToolCallStatus.Executing,
        'parent',
      ),
    ];
    const result = buildTaskTree(calls);

    // Only the parent should be at root level
    expect(result).toHaveLength(1);
    expect(result[0].tool.callId).toBe('parent');
    expect(result[0].depth).toBe(0);

    // Parent should have two children
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children[0].tool.callId).toBe('child-1');
    expect(result[0].children[0].depth).toBe(1);
    expect(result[0].children[1].tool.callId).toBe('child-2');
    expect(result[0].children[1].depth).toBe(1);
  });

  it('handles deep 3-level nesting correctly', () => {
    const calls = [
      makeToolCall('root', 'agent_task', CoreToolCallStatus.Executing),
      makeToolCall('mid', 'sub_agent', CoreToolCallStatus.Executing, 'root'),
      makeToolCall('leaf', 'read_file', CoreToolCallStatus.Success, 'mid'),
    ];
    const result = buildTaskTree(calls);

    expect(result).toHaveLength(1);
    const root = result[0];
    expect(root.depth).toBe(0);
    expect(root.children).toHaveLength(1);

    const mid = root.children[0];
    expect(mid.depth).toBe(1);
    expect(mid.tool.callId).toBe('mid');
    expect(mid.children).toHaveLength(1);

    const leaf = mid.children[0];
    expect(leaf.depth).toBe(2);
    expect(leaf.tool.callId).toBe('leaf');
    expect(leaf.children).toHaveLength(0);
  });

  it('detects and breaks direct (self-referential) cycles by making the node a root', () => {
    const calls = [
      makeToolCall('a', 'agent_task', CoreToolCallStatus.Executing, 'a'), // self-cycle
      makeToolCall('b', 'read_file', CoreToolCallStatus.Success, 'a'),
    ];
    const result = buildTaskTree(calls);

    expect(result).toHaveLength(1);
    expect(result[0].tool.callId).toBe('a');
    expect(result[0].depth).toBe(0);
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].tool.callId).toBe('b');
    expect(result[0].children[0].depth).toBe(1);
  });

  it('detects and breaks indirect (multi-node) cycles by making the offending nodes roots', () => {
    const calls = [
      makeToolCall('a', 'agent_task', CoreToolCallStatus.Executing, 'b'), // a -> b
      makeToolCall('b', 'internal_subtask', CoreToolCallStatus.Executing, 'c'), // b -> c
      makeToolCall('c', 'cyclic_task', CoreToolCallStatus.Executing, 'a'), // c -> a (cycle)
    ];
    const result = buildTaskTree(calls);

    // The cycle detector forces all nodes involved in the cycle to become roots.
    // Being 3 roots, the prototype synthetic grouping wraps them.
    expect(result).toHaveLength(1);
    expect(result[0].tool.callId).toBe('__synthetic_turn_root__');
    expect(result[0].children).toHaveLength(3);

    const childrenIds = result[0].children.map((c) => c.tool.callId);
    expect(childrenIds).toContain('a');
    expect(childrenIds).toContain('b');
    expect(childrenIds).toContain('c');
  });

  it('treats orphaned parentCallId references as root nodes, grouping into synthetic turn if needed', () => {
    // The parentCallId references a callId not present in the list
    const calls = [
      makeToolCall(
        'orphan',
        'read_file',
        CoreToolCallStatus.Success,
        'nonexistent-parent',
      ),
      makeToolCall('normal', 'write_file'),
    ];
    const result = buildTaskTree(calls);

    // Because both resolve to roots, they get grouped under a synthetic turn root
    expect(result).toHaveLength(1);
    expect(result[0].tool.callId).toBe('__synthetic_turn_root__');
    expect(result[0].children).toHaveLength(2);
    expect(result[0].children[0].tool.callId).toBe('orphan');
    expect(result[0].children[0].depth).toBe(1);
    expect(result[0].children[1].tool.callId).toBe('normal');
    expect(result[0].children[1].depth).toBe(1);
  });

  it('preserves all status values across the tree', () => {
    const calls = [
      makeToolCall('a', 'agent', CoreToolCallStatus.Executing),
      makeToolCall('b', 'read', CoreToolCallStatus.Success, 'a'),
      makeToolCall('c', 'write', CoreToolCallStatus.Error, 'a'),
      makeToolCall('d', 'confirm', CoreToolCallStatus.AwaitingApproval, 'a'),
      makeToolCall('e', 'cancel', CoreToolCallStatus.Cancelled, 'a'),
    ];
    const result = buildTaskTree(calls);

    expect(result).toHaveLength(1);
    const children = result[0].children;
    expect(children).toHaveLength(4);
    expect(children[0].tool.status).toBe(CoreToolCallStatus.Success);
    expect(children[1].tool.status).toBe(CoreToolCallStatus.Error);
    expect(children[2].tool.status).toBe(CoreToolCallStatus.AwaitingApproval);
    expect(children[3].tool.status).toBe(CoreToolCallStatus.Cancelled);
  });

  it('handles duplicate callId by using the last occurrence and guarantees no duplicate insertions', () => {
    const calls = [
      makeToolCall('dup', 'first_tool', CoreToolCallStatus.Success),
      makeToolCall('dup', 'second_tool', CoreToolCallStatus.Error),
    ];
    const result = buildTaskTree(calls);

    // The Map overwrites the first entry, so only the second survives.
    // Iterating over unique values guarantees we only get exactly 1 entry.
    // Because there is only 1 root, no synthetic turn is needed.
    expect(result).toHaveLength(1);
    expect(result[0].tool.callId).toBe('dup');
    expect(result[0].tool.name).toBe('second_tool');
    expect(result[0].tool.status).toBe(CoreToolCallStatus.Error);
    expect(result[0].children).toHaveLength(0);
  });
});
