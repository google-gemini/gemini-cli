/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useTaskTree, flattenVisibleNodes } from './useTaskTree.js';
import type { IndividualToolCallDisplay } from '../types.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Create a minimal IndividualToolCallDisplay for test fixtures. */
function makeTool(
  callId: string,
  name: string,
  opts: Partial<IndividualToolCallDisplay> = {},
): IndividualToolCallDisplay {
  return {
    callId,
    name,
    description: `args for ${name}`,
    status: CoreToolCallStatus.Success,
    resultDisplay: undefined,
    confirmationDetails: undefined,
    approvalMode: undefined,
    isClientInitiated: false,
    ...opts,
  };
}

// ── buildTree / useTaskTree ───────────────────────────────────────────────────

describe('useTaskTree – flat list', () => {
  it('returns hasHierarchy=true when there are tool calls', () => {
    const tools = [makeTool('a', 'read_file'), makeTool('b', 'write_file')];
    const { result } = renderHook(() => useTaskTree(tools));

    expect(result.current.hasHierarchy).toBe(true);
  });

  it('returns hasHierarchy=false when list is empty', () => {
    const { result } = renderHook(() => useTaskTree([]));
    expect(result.current.hasHierarchy).toBe(false);
  });

  it('builds two root nodes from a flat list', () => {
    const tools = [makeTool('a', 'read_file'), makeTool('b', 'write_file')];
    const { result } = renderHook(() => useTaskTree(tools));

    expect(result.current.nodes).toHaveLength(2);
    expect(result.current.nodes[0].toolCall.callId).toBe('a');
    expect(result.current.nodes[1].toolCall.callId).toBe('b');
    expect(result.current.nodes[0].depth).toBe(0);
  });

  it('all root nodes start expanded (isCollapsed=false)', () => {
    const tools = [makeTool('a', 'read_file'), makeTool('b', 'write_file')];
    const { result } = renderHook(() => useTaskTree(tools));

    result.current.nodes.forEach((n) => expect(n.isCollapsed).toBe(false));
  });
});

describe('useTaskTree – hierarchy', () => {
  it('nests a child under its parent via parentCallId', () => {
    const tools = [
      makeTool('parent', 'agent'),
      makeTool('child', 'read_file', { parentCallId: 'parent' }),
    ];
    const { result } = renderHook(() => useTaskTree(tools));

    // Only the parent is a root
    expect(result.current.nodes).toHaveLength(1);
    const parent = result.current.nodes[0];
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].toolCall.callId).toBe('child');
    expect(parent.children[0].depth).toBe(1);
  });

  it('promotes orphan (unknown parentCallId) to root', () => {
    const tools = [makeTool('orphan', 'read_file', { parentCallId: 'ghost' })];
    const { result } = renderHook(() => useTaskTree(tools));

    expect(result.current.nodes).toHaveLength(1);
    expect(result.current.nodes[0].toolCall.callId).toBe('orphan');
    expect(result.current.nodes[0].depth).toBe(0);
  });

  it('supports two levels of nesting', () => {
    const tools = [
      makeTool('root', 'agent'),
      makeTool('child', 'sub_agent', { parentCallId: 'root' }),
      makeTool('grandchild', 'read_file', { parentCallId: 'child' }),
    ];
    const { result } = renderHook(() => useTaskTree(tools));

    const root = result.current.nodes[0];
    expect(root.depth).toBe(0);
    expect(root.children[0].depth).toBe(1);
    expect(root.children[0].children[0].depth).toBe(2);
    expect(root.children[0].children[0].toolCall.callId).toBe('grandchild');
  });
});

describe('useTaskTree – collapse/expand', () => {
  it('toggleCollapse collapses a node', () => {
    const tools = [makeTool('a', 'read_file')];
    const { result } = renderHook(() => useTaskTree(tools));

    act(() => {
      result.current.toggleCollapse('a');
    });

    expect(result.current.nodes[0].isCollapsed).toBe(true);
  });

  it('toggleCollapse expands a collapsed node', () => {
    const tools = [makeTool('a', 'read_file')];
    const { result } = renderHook(() => useTaskTree(tools));

    act(() => {
      result.current.toggleCollapse('a');
    });
    act(() => {
      result.current.toggleCollapse('a');
    });

    expect(result.current.nodes[0].isCollapsed).toBe(false);
  });

  it('collapseAll marks every node collapsed', () => {
    const tools = [makeTool('a', 'read_file'), makeTool('b', 'write_file')];
    const { result } = renderHook(() => useTaskTree(tools));

    act(() => {
      result.current.collapseAll();
    });

    result.current.nodes.forEach((n) => expect(n.isCollapsed).toBe(true));
  });

  it('expandAll clears all collapsed state', () => {
    const tools = [makeTool('a', 'read_file'), makeTool('b', 'write_file')];
    const { result } = renderHook(() => useTaskTree(tools));

    act(() => {
      result.current.collapseAll();
    });
    act(() => {
      result.current.expandAll();
    });

    result.current.nodes.forEach((n) => expect(n.isCollapsed).toBe(false));
  });
});

describe('useTaskTree – keyboard focus', () => {
  it('focusNext advances focus through visible nodes', () => {
    const tools = [makeTool('a', 'read_file'), makeTool('b', 'write_file')];
    const { result } = renderHook(() => useTaskTree(tools));

    act(() => result.current.focusNext());
    expect(result.current.focusedId).toBe('a');

    act(() => result.current.focusNext());
    expect(result.current.focusedId).toBe('b');
  });

  it('focusPrev wraps around to the last node', () => {
    const tools = [makeTool('a', 'read_file'), makeTool('b', 'write_file')];
    const { result } = renderHook(() => useTaskTree(tools));

    // Start unfocused → focusPrev → lands on last
    act(() => result.current.focusPrev());
    expect(result.current.focusedId).toBe('b');
  });

  it('focused node has isFocused=true', () => {
    const tools = [makeTool('a', 'read_file'), makeTool('b', 'write_file')];
    const { result } = renderHook(() => useTaskTree(tools));

    act(() => result.current.focusNext());

    const focused = result.current.nodes.find((n) => n.isFocused);
    expect(focused?.toolCall.callId).toBe('a');
  });

  it('collapsed nodes hide their children from focusNext traversal', () => {
    const tools = [
      makeTool('parent', 'agent'),
      makeTool('child', 'read_file', { parentCallId: 'parent' }),
      makeTool('sibling', 'write_file'),
    ];
    const { result } = renderHook(() => useTaskTree(tools));

    // Collapse the parent — child should be skipped by focusNext
    act(() => result.current.toggleCollapse('parent'));
    act(() => result.current.focusNext()); // → parent
    act(() => result.current.focusNext()); // → sibling (child skipped)

    expect(result.current.focusedId).toBe('sibling');
  });
});

describe('flattenVisibleNodes', () => {
  it('returns all nodes when nothing is collapsed', () => {
    const tools = [
      makeTool('root', 'agent'),
      makeTool('child', 'read_file', { parentCallId: 'root' }),
    ];
    const { result } = renderHook(() => useTaskTree(tools));
    const flat = flattenVisibleNodes(result.current.nodes);

    expect(flat.map((n) => n.toolCall.callId)).toEqual(['root', 'child']);
  });

  it('excludes children of collapsed nodes', () => {
    const tools = [
      makeTool('root', 'agent'),
      makeTool('child', 'read_file', { parentCallId: 'root' }),
    ];
    const { result } = renderHook(() => useTaskTree(tools));

    act(() => result.current.toggleCollapse('root'));

    const flat = flattenVisibleNodes(result.current.nodes);
    expect(flat.map((n) => n.toolCall.callId)).toEqual(['root']);
  });
});
