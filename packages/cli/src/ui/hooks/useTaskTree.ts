/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState, useCallback, useEffect } from 'react';
import { ROOT_SCHEDULER_ID } from '@google/gemini-cli-core';

export interface TaskTreeNode<T = unknown> {
  id: string; // The callId
  call: T;
  children: Array<TaskTreeNode<T>>;
  parent?: TaskTreeNode<T>;
  depth: number;
}

export function useTaskTree<
  T extends {
    callId?: string;
    request?: { callId: string; parentCallId?: string; schedulerId?: string };
    parentCallId?: string;
  },
>(
  toolCalls: T[],
  defaultCollapseHeuristic?: (call: T) => boolean,
): {
  roots: Array<TaskTreeNode<T>>;
  collapseState: Record<string, boolean>;
  toggleCollapse: (id: string) => void;
} {
  const [collapseState, setCollapseState] = useState<Record<string, boolean>>(
    {},
  );

  const toggleCollapse = useCallback((id: string) => {
    setCollapseState((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const syncCollapseState = useCallback(
    (activeIds: Set<string>, currentCalls: T[]) => {
      setCollapseState((prev) => {
        const next = { ...prev };
        let changed = false;

        // Initialize new nodes
        for (const call of currentCalls) {
          const callId = call.request?.callId ?? call.callId;
          if (callId && !(callId in next)) {
            if (defaultCollapseHeuristic?.(call)) {
              next[callId] = true;
              changed = true;
            }
          }
        }

        // Cleanup old nodes
        for (const id in next) {
          if (!activeIds.has(id)) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
    [defaultCollapseHeuristic],
  );

  useEffect(() => {
    const activeIds = new Set(
      toolCalls
        .map((c) => c.request?.callId ?? c.callId)
        .filter((id): id is string => typeof id === 'string'),
    );
    syncCollapseState(activeIds, toolCalls);
  }, [toolCalls, syncCollapseState]);

  const roots = useMemo(() => {
    const nodeMap = new Map<string, TaskTreeNode<T>>();
    const roots: Array<TaskTreeNode<T>> = [];

    // First pass: create all nodes
    for (const call of toolCalls) {
      const callId = call.request?.callId ?? call.callId;
      if (!callId) continue;

      nodeMap.set(callId, {
        id: callId,
        call,
        children: [],
        depth: 0,
      });
    }

    // Second pass: wire up parents and children
    for (const call of toolCalls) {
      const callId = call.request?.callId ?? call.callId;
      if (!callId) continue;

      const node = nodeMap.get(callId);
      if (!node) continue;

      let parentId: string | undefined = undefined;

      // Determine parent
      if (call.request) {
        if (call.request.parentCallId) {
          parentId = call.request.parentCallId;
        } else if (
          call.request.schedulerId &&
          call.request.schedulerId !== ROOT_SCHEDULER_ID
        ) {
          parentId = call.request.schedulerId;
        }
      } else {
        parentId = call.parentCallId;
      }

      if (parentId && nodeMap.has(parentId)) {
        const parentNode = nodeMap.get(parentId)!;
        parentNode.children.push(node);
        node.parent = parentNode;
      } else {
        // If no parent found (or it's root), it's a root node
        roots.push(node);
      }
    }

    // Third pass: compute depths via DFS
    function computeDepth(n: TaskTreeNode<T>, currentDepth: number) {
      n.depth = currentDepth;
      for (const child of n.children) {
        computeDepth(child, currentDepth + 1);
      }
    }

    for (const root of roots) {
      computeDepth(root, 0);
    }

    return roots;
  }, [toolCalls]);

  return { roots, collapseState, toggleCollapse };
}
