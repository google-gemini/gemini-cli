/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HistoryItem, IndividualToolCallDisplay } from '../types.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';

export interface ToolCallTreeNode {
  callId: string;
  name: string;
  description: string;
  status: CoreToolCallStatus;
  children: ToolCallTreeNode[];
}

export interface ProgressTreeData {
  totalToolCalls: number;
  rootCalls: ToolCallTreeNode[];
  statusCounts: {
    success: number;
    error: number;
    executing: number;
    pending: number;
    cancelled: number;
  };
}

function mapStatusToCategory(
  status: CoreToolCallStatus,
): keyof ProgressTreeData['statusCounts'] {
  switch (status) {
    case CoreToolCallStatus.Success:
      return 'success';
    case CoreToolCallStatus.Error:
      return 'error';
    case CoreToolCallStatus.Executing:
      return 'executing';
    case CoreToolCallStatus.Cancelled:
      return 'cancelled';
    default:
      return 'pending';
  }
}

/**
 * Builds a tree structure from the history's tool call data.
 * Extracts all tool calls from tool_group history items and
 * reconstructs the parent-child hierarchy using parentCallId.
 */
export function buildProgressTree(history: HistoryItem[]): ProgressTreeData {
  const allToolCalls: IndividualToolCallDisplay[] = [];

  for (const item of history) {
    if (item.type === 'tool_group') {
      for (const tool of item.tools) {
        allToolCalls.push(tool);
      }
    }
  }

  const statusCounts: ProgressTreeData['statusCounts'] = {
    success: 0,
    error: 0,
    executing: 0,
    pending: 0,
    cancelled: 0,
  };

  // Build a map of callId -> node
  const nodeMap = new Map<string, ToolCallTreeNode>();
  for (const tool of allToolCalls) {
    const category = mapStatusToCategory(tool.status);
    statusCounts[category]++;

    nodeMap.set(tool.callId, {
      callId: tool.callId,
      name: tool.name,
      description: tool.description,
      status: tool.status,
      children: [],
    });
  }

  // Build tree by linking children to parents
  const rootCalls: ToolCallTreeNode[] = [];
  for (const tool of allToolCalls) {
    const node = nodeMap.get(tool.callId);
    if (!node) continue;

    if (tool.parentCallId) {
      const parent = nodeMap.get(tool.parentCallId);
      if (parent) {
        parent.children.push(node);
      } else {
        // Parent not found — treat as root
        rootCalls.push(node);
      }
    } else {
      rootCalls.push(node);
    }
  }

  return {
    totalToolCalls: allToolCalls.length,
    rootCalls,
    statusCounts,
  };
}
