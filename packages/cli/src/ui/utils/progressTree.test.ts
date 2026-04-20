/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { buildProgressTree } from './progressTree.js';
import type { HistoryItem, IndividualToolCallDisplay } from '../types.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';

function makeTool(
  overrides: Partial<IndividualToolCallDisplay> = {},
): IndividualToolCallDisplay {
  return {
    callId: 'call-1',
    name: 'read_file',
    description: 'Read a file',
    status: CoreToolCallStatus.Success,
    resultDisplay: undefined,
    confirmationDetails: undefined,
    ...overrides,
  };
}

function makeToolGroup(
  tools: IndividualToolCallDisplay[],
  id = 1,
): HistoryItem {
  return {
    id,
    type: 'tool_group',
    tools,
  };
}

describe('buildProgressTree', () => {
  it('should return empty tree for no history', () => {
    const result = buildProgressTree([]);
    expect(result.totalToolCalls).toBe(0);
    expect(result.rootCalls).toHaveLength(0);
  });

  it('should count tool calls correctly', () => {
    const history: HistoryItem[] = [
      makeToolGroup([makeTool({ callId: 'a' }), makeTool({ callId: 'b' })]),
      makeToolGroup([makeTool({ callId: 'c' })], 2),
    ];

    const result = buildProgressTree(history);
    expect(result.totalToolCalls).toBe(3);
    expect(result.rootCalls).toHaveLength(3);
  });

  it('should build parent-child relationships', () => {
    const history: HistoryItem[] = [
      makeToolGroup([
        makeTool({ callId: 'parent-1', name: 'run_agent' }),
        makeTool({
          callId: 'child-1',
          parentCallId: 'parent-1',
          name: 'read_file',
        }),
        makeTool({
          callId: 'child-2',
          parentCallId: 'parent-1',
          name: 'write_file',
        }),
      ]),
    ];

    const result = buildProgressTree(history);
    expect(result.rootCalls).toHaveLength(1);
    expect(result.rootCalls[0]?.name).toBe('run_agent');
    expect(result.rootCalls[0]?.children).toHaveLength(2);
    expect(result.rootCalls[0]?.children[0]?.name).toBe('read_file');
    expect(result.rootCalls[0]?.children[1]?.name).toBe('write_file');
  });

  it('should handle deeply nested trees', () => {
    const history: HistoryItem[] = [
      makeToolGroup([
        makeTool({ callId: 'root', name: 'agent' }),
        makeTool({
          callId: 'mid',
          parentCallId: 'root',
          name: 'sub_agent',
        }),
        makeTool({
          callId: 'leaf',
          parentCallId: 'mid',
          name: 'read_file',
        }),
      ]),
    ];

    const result = buildProgressTree(history);
    expect(result.rootCalls).toHaveLength(1);
    expect(result.rootCalls[0]?.children).toHaveLength(1);
    expect(result.rootCalls[0]?.children[0]?.children).toHaveLength(1);
    expect(result.rootCalls[0]?.children[0]?.children[0]?.name).toBe(
      'read_file',
    );
  });

  it('should count status categories correctly', () => {
    const history: HistoryItem[] = [
      makeToolGroup([
        makeTool({ callId: 'a', status: CoreToolCallStatus.Success }),
        makeTool({ callId: 'b', status: CoreToolCallStatus.Success }),
        makeTool({ callId: 'c', status: CoreToolCallStatus.Error }),
        makeTool({ callId: 'd', status: CoreToolCallStatus.Executing }),
        makeTool({ callId: 'e', status: CoreToolCallStatus.Cancelled }),
      ]),
    ];

    const result = buildProgressTree(history);
    expect(result.statusCounts.success).toBe(2);
    expect(result.statusCounts.error).toBe(1);
    expect(result.statusCounts.executing).toBe(1);
    expect(result.statusCounts.cancelled).toBe(1);
    expect(result.statusCounts.pending).toBe(0);
  });

  it('should treat orphaned children as root calls', () => {
    const history: HistoryItem[] = [
      makeToolGroup([
        makeTool({
          callId: 'orphan',
          parentCallId: 'nonexistent',
          name: 'orphan_tool',
        }),
      ]),
    ];

    const result = buildProgressTree(history);
    expect(result.rootCalls).toHaveLength(1);
    expect(result.rootCalls[0]?.name).toBe('orphan_tool');
  });

  it('should ignore non-tool-group history items', () => {
    const history: HistoryItem[] = [
      { id: 1, type: 'user', text: 'hello' },
      { id: 2, type: 'gemini', text: 'hi' },
      makeToolGroup([makeTool({ callId: 'a' })], 3),
      { id: 4, type: 'info', text: 'info msg' },
    ];

    const result = buildProgressTree(history);
    expect(result.totalToolCalls).toBe(1);
    expect(result.rootCalls).toHaveLength(1);
  });

  it('should handle pending status for validating tools', () => {
    const history: HistoryItem[] = [
      makeToolGroup([
        makeTool({ callId: 'a', status: CoreToolCallStatus.Validating }),
        makeTool({ callId: 'b', status: CoreToolCallStatus.Scheduled }),
      ]),
    ];

    const result = buildProgressTree(history);
    expect(result.statusCounts.pending).toBe(2);
  });
});
