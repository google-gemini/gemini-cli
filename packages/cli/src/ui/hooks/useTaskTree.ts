/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import type { IndividualToolCallDisplay, TaskTreeNode } from '../types.js';

/**
 * Builds a TaskTreeNode hierarchy from a flat list of tool calls.
 *
 * Root nodes are calls with no parentCallId.  Every call whose parentCallId
 * matches an existing callId becomes a child of that node.  Calls whose
 * parentCallId references an unknown id are promoted to roots so nothing is
 * silently dropped.
 */
function buildTree(
  toolCalls: IndividualToolCallDisplay[],
  collapsedIds: Set<string>,
  focusedId: string | null,
): TaskTreeNode[] {
  const childrenMap = new Map<string, IndividualToolCallDisplay[]>();
  const roots: IndividualToolCallDisplay[] = [];
  const knownIds = new Set(toolCalls.map((t) => t.callId));

  for (const tool of toolCalls) {
    if (tool.parentCallId && knownIds.has(tool.parentCallId)) {
      const siblings = childrenMap.get(tool.parentCallId) ?? [];
      siblings.push(tool);
      childrenMap.set(tool.parentCallId, siblings);
    } else {
      roots.push(tool);
    }
  }

  function buildNode(
    tool: IndividualToolCallDisplay,
    depth: number,
  ): TaskTreeNode {
    const childCalls = childrenMap.get(tool.callId) ?? [];
    return {
      toolCall: tool,
      children: childCalls.map((c) => buildNode(c, depth + 1)),
      depth,
      isCollapsed: collapsedIds.has(tool.callId),
      isFocused: tool.callId === focusedId,
    };
  }

  return roots.map((r) => buildNode(r, 0));
}

/**
 * Returns a flat, pre-order traversal of a tree, skipping collapsed subtrees.
 * Useful for keyboard navigation.
 */
export function flattenVisibleNodes(nodes: TaskTreeNode[]): TaskTreeNode[] {
  const result: TaskTreeNode[] = [];
  function visit(node: TaskTreeNode) {
    result.push(node);
    if (!node.isCollapsed) {
      node.children.forEach(visit);
    }
  }
  nodes.forEach(visit);
  return result;
}

export interface UseTaskTreeResult {
  /** The hierarchical tree nodes ready to render. */
  nodes: TaskTreeNode[];
  /** Whether there is actually a hierarchy to show (any tool has a parentCallId). */
  hasHierarchy: boolean;
  /**
   * True when all tool calls have finished and the tree is showing the last
   * completed snapshot (stays visible until the next tool run).
   */
  isHoldingAfterCompletion: boolean;
  /** Toggle the collapsed state of a specific node. */
  toggleCollapse: (callId: string) => void;
  /** Collapse all nodes. */
  collapseAll: () => void;
  /** Expand all nodes. */
  expandAll: () => void;
  /** Move keyboard focus to the next visible node. */
  focusNext: () => void;
  /** Move keyboard focus to the previous visible node. */
  focusPrev: () => void;
  /** The callId that currently has keyboard focus, or null. */
  focusedId: string | null;
}

/**
 * Manages the task tree state derived from a flat list of tool calls.
 *
 * @param toolCalls - All tool calls from all active tool_group history items.
 */
export function useTaskTree(
  toolCalls: IndividualToolCallDisplay[],
): UseTaskTreeResult {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // When tool calls complete, keep the last snapshot visible until the next
  // tool run so the user can always see the full completed tree.
  const [heldNodes, setHeldNodes] = useState<TaskTreeNode[]>([]);
  const [isHeld, setIsHeld] = useState(false);

  const liveNodes = useMemo(
    () => buildTree(toolCalls, collapsedIds, focusedId),
    [toolCalls, collapsedIds, focusedId],
  );

  // Persist completed tree: while there are live calls, keep updating the
  // snapshot; when they drain to empty, show that snapshot until next run.
  useEffect(() => {
    if (toolCalls.length > 0) {
      setHeldNodes(liveNodes);
      setIsHeld(false);
    } else if (heldNodes.length > 0) {
      setIsHeld(true);
    }
  }, [toolCalls.length, liveNodes, heldNodes.length]);

  // Expose live nodes during execution; held (frozen) nodes after completion.
  const nodes = useMemo(
    () => (toolCalls.length > 0 ? liveNodes : isHeld ? heldNodes : []),
    [toolCalls.length, liveNodes, isHeld, heldNodes],
  );

  // Show the tree whenever there are active calls or a completed snapshot.
  const hasHierarchy = toolCalls.length > 0 || isHeld;

  const toggleCollapse = useCallback((callId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(callId)) {
        next.delete(callId);
      } else {
        next.add(callId);
      }
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    // Flatten the currently visible nodes (live or held) to collect all callIds.
    const allCallIds = flattenVisibleNodes(nodes).map((n) => n.toolCall.callId);
    setCollapsedIds(new Set(allCallIds));
  }, [nodes]);

  const expandAll = useCallback(() => {
    setCollapsedIds(new Set());
  }, []);

  const focusNext = useCallback(() => {
    const visible = flattenVisibleNodes(nodes);
    if (visible.length === 0) return;
    const idx = visible.findIndex((n) => n.toolCall.callId === focusedId);
    const next = visible[(idx + 1) % visible.length];
    setFocusedId(next.toolCall.callId);
  }, [nodes, focusedId]);

  const focusPrev = useCallback(() => {
    const visible = flattenVisibleNodes(nodes);
    if (visible.length === 0) return;
    const idx = visible.findIndex((n) => n.toolCall.callId === focusedId);
    // When nothing is focused (idx === -1), jump to the last visible node.
    const prevIdx =
      idx === -1
        ? visible.length - 1
        : (idx - 1 + visible.length) % visible.length;
    setFocusedId(visible[prevIdx].toolCall.callId);
  }, [nodes, focusedId]);

  return {
    nodes,
    hasHierarchy,
    isHoldingAfterCompletion: isHeld,
    toggleCollapse,
    collapseAll,
    expandAll,
    focusNext,
    focusPrev,
    focusedId,
  };
}
