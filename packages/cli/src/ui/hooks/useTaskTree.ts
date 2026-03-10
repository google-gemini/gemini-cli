/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from 'react';
import type { IndividualToolCallDisplay } from '../types.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';

/**
 * A node in the task tree hierarchy.
 * Each node wraps a single tool call display and may have children
 * derived from matching parentCallId references.
 */
export interface TaskTreeNode {
  /** The underlying tool call display data. */
  tool: IndividualToolCallDisplay;
  /** Child nodes whose parentCallId matches this node's callId. */
  children: TaskTreeNode[];
  /** Nesting depth (0 = root). */
  depth: number;
}

/**
 * Transforms a flat list of tool call displays into a hierarchical tree
 * using the parentCallId field as the edge connector.
 *
 * Algorithm:
 * 1. Build a Map<callId, TaskTreeNode> from all tool calls (O(n)).
 * 2. Walk the list: if parentCallId exists and is in the map, attach as child.
 *    Otherwise, treat as a root node.
 * 3. Return only root nodes (children are nested within).
 *
 * Orphaned parentCallId references (pointing to IDs not in the current list)
 * gracefully fall back to root nodes to prevent silent data loss.
 *
 * @param toolCalls - Flat list of tool call displays from mapToDisplay().
 * @returns Root-level TaskTreeNode array with nested children.
 */
export function useTaskTree(
  toolCalls: IndividualToolCallDisplay[],
): TaskTreeNode[] {
  return useMemo(() => buildTaskTree(toolCalls), [toolCalls]);
}

/**
 * Pure function for tree construction. Exported separately for unit testing
 * without requiring React hook context.
 *
 * When all tool calls are flat (no parentCallId edges), we synthesize a
 * "Current Turn" root node to create visible hierarchy in the tree.
 * This ensures the prototype demo always shows a meaningful tree structure
 * even when running non-agent tool calls.
 */
export function buildTaskTree(
  toolCalls: IndividualToolCallDisplay[],
): TaskTreeNode[] {
  if (toolCalls.length === 0) return [];

  const nodeMap = new Map<string, TaskTreeNode>();
  const roots: TaskTreeNode[] = [];

  // Pass 1: Create all nodes with default depth 0
  for (const tool of toolCalls) {
    if (nodeMap.has(tool.callId)) {
      // TODO(gsoc-idea-6): Handle duplicate callIds. The current implementation
      // uses a "last-write-wins" strategy, which can lead to data loss and an
      // inaccurate task tree. This is a known limitation of the prototype.
    }
    nodeMap.set(tool.callId, {
      tool,
      children: [],
      depth: 0,
    });
  }

  // Pass 2: Build parent-child edges using parentCallId
  for (const node of nodeMap.values()) {
    const parentCallId = node.tool.parentCallId;
    if (parentCallId && nodeMap.has(parentCallId)) {
      const parent = nodeMap.get(parentCallId)!;

      // Cycle detection: walk up the parent chain to ensure no circular references
      let ancestor: TaskTreeNode | undefined = parent;
      let hasCycle = false;
      const seen = new Set<string>();

      while (ancestor) {
        if (ancestor === node) {
          hasCycle = true;
          break;
        }
        if (seen.has(ancestor.tool.callId)) {
          break; // Connected to a pre-existing cycle above this node
        }
        seen.add(ancestor.tool.callId);
        ancestor = ancestor.tool.parentCallId
          ? nodeMap.get(ancestor.tool.parentCallId)
          : undefined;
      }

      if (hasCycle) {
        // Break the cycle by treating this node as a root
        roots.push(node);
      } else {
        node.depth = parent.depth + 1;
        parent.children.push(node);
      }
    } else {
      // Root node: either no parentCallId, or orphaned reference
      roots.push(node);
    }
  }

  // Pass 3 (prototype): If ALL nodes are roots (flat list with no edges),
  // wrap them under a synthetic "Current Turn" parent so the tree always
  // shows visible hierarchy during the demo.
  if (roots.length > 1 && roots.length === nodeMap.size) {
    const statuses = new Set(roots.map((r) => r.tool.status));

    let syntheticStatus: CoreToolCallStatus;
    if (statuses.has(CoreToolCallStatus.Error)) {
      syntheticStatus = CoreToolCallStatus.Error;
    } else if (statuses.has(CoreToolCallStatus.AwaitingApproval)) {
      syntheticStatus = CoreToolCallStatus.AwaitingApproval;
    } else if (
      statuses.has(CoreToolCallStatus.Executing) ||
      statuses.has(CoreToolCallStatus.Scheduled) ||
      statuses.has(CoreToolCallStatus.Validating)
    ) {
      syntheticStatus = CoreToolCallStatus.Executing;
    } else {
      syntheticStatus = CoreToolCallStatus.Success;
    }

    const syntheticRoot: TaskTreeNode = {
      tool: {
        callId: '__synthetic_turn_root__',
        name: 'Current Turn',
        description: `${roots.length} tool calls`,
        status: syntheticStatus,
        resultDisplay: undefined,
        confirmationDetails: undefined,
      },
      children: roots.map((r) => ({ ...r, depth: 1 })),
      depth: 0,
    };
    return [syntheticRoot];
  }

  return roots;
}
