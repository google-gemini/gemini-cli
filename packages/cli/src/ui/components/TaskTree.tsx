/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { TaskNode } from './TaskNode.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import type { TaskTreeNode } from '../types.js';
import type { UseTaskTreeResult } from '../hooks/useTaskTree.js';

interface TaskTreeProps
  extends Omit<UseTaskTreeResult, 'isHoldingAfterCompletion'> {
  terminalWidth: number;
  /** Whether the tree should capture key events. */
  isFocused?: boolean;
  /**
   * When true the tool calls have all finished and we are in the post-completion
   * hold window — show a "done" badge instead of the live navigation hint.
   */
  isHoldingAfterCompletion?: boolean;
}

/**
 * Renders the hierarchical task tree for all active tool calls.
 *
 * Shows each tool call as a tree row with its status icon, name, description,
 * and — when expanded — its output and child calls.  Keyboard navigation
 * (arrow keys) and collapse/expand commands are handled here.
 */
export const TaskTree: React.FC<TaskTreeProps> = ({
  nodes,
  terminalWidth,
  isFocused = true,
  isHoldingAfterCompletion = false,
  toggleCollapse,
  collapseAll,
  expandAll,
  focusNext,
  focusPrev,
  focusedId,
}) => {
  // Keyboard navigation for the tree.
  useKeypress(
    (key) => {
      if (keyMatchers[Command.NAVIGATION_DOWN](key)) {
        focusNext();
        return;
      }
      if (keyMatchers[Command.NAVIGATION_UP](key)) {
        focusPrev();
        return;
      }
      if (keyMatchers[Command.TOGGLE_COLLAPSE](key)) {
        if (focusedId) toggleCollapse(focusedId);
        return;
      }
      if (keyMatchers[Command.COLLAPSE_ALL](key)) {
        collapseAll();
        return;
      }
      if (keyMatchers[Command.EXPAND_ALL](key)) {
        expandAll();
        return;
      }
    },
    { isActive: isFocused },
  );

  if (nodes.length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      width={terminalWidth}
      paddingX={1}
      marginBottom={1}
    >
      {/* Header — marginBottom separates the tree from the Composer/Thinking area below */}
      <Box marginBottom={0}>
        <Text color={theme.text.secondary} bold>
          Task Tree
        </Text>
        {isHoldingAfterCompletion ? (
          // tree stays visible until the next tool run.
          <Text color={theme.status.success}>{'  ✓ completed'}</Text>
        ) : (
          <Text color={theme.text.secondary}>
            {
              '  ↑↓ navigate  →/← expand/collapse  Ctrl+] expand all  Ctrl+[ collapse all'
            }
          </Text>
        )}
      </Box>

      {/* Tree rows */}
      {nodes.map((node, idx) => (
        <TaskNode
          key={node.toolCall.callId}
          node={node}
          prefix=""
          isLast={idx === nodes.length - 1}
          terminalWidth={terminalWidth}
        />
      ))}
    </Box>
  );
};

/** Flattens a tree to a plain string for accessibility / screen-reader mode. */
export function taskTreeToText(nodes: TaskTreeNode[]): string {
  const lines: string[] = [];
  function visit(node: TaskTreeNode, indent: number) {
    const pad = '  '.repeat(indent);
    lines.push(
      `${pad}${node.toolCall.name}  ${node.toolCall.description ?? ''}  [${node.toolCall.status}]`,
    );
    if (!node.isCollapsed) {
      node.children.forEach((c) => visit(c, indent + 1));
    }
  }
  nodes.forEach((n) => visit(n, 0));
  return lines.join('\n');
}
