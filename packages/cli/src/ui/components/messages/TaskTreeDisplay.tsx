/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable react/prop-types */

import { useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import { useTaskTree, type TaskTreeNode } from '../../hooks/useTaskTree.js';
import type { IndividualToolCallDisplay } from '../../types.js';
import { TaskNode } from './TaskNode.js';
import { useKeypress, type Key } from '../../hooks/useKeypress.js';
import { keyMatchers, Command } from '../../keyMatchers.js';
import { useConfig } from '../../contexts/ConfigContext.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { theme } from '../../semantic-colors.js';
import { copyToClipboard } from '../../utils/commandUtils.js';
import {
  appEvents,
  AppEvent,
  TransientMessageType,
} from '../../../utils/events.js';

export interface TaskTreeDisplayProps {
  toolCalls: IndividualToolCallDisplay[];
  availableTerminalHeight?: number;
  terminalWidth: number;
  isExpandable?: boolean;
  hasFocus?: boolean;
}

const flattenTree = (
  nodes: Array<TaskTreeNode<IndividualToolCallDisplay>>,
  collapseState: Record<string, boolean> = {},
): Array<TaskTreeNode<IndividualToolCallDisplay>> => {
  const result: Array<TaskTreeNode<IndividualToolCallDisplay>> = [];
  for (const node of nodes) {
    result.push(node);
    if (!collapseState[node.id]) {
      result.push(...flattenTree(node.children, collapseState));
    }
  }
  return result;
};

export const TaskTreeDisplay: React.FC<TaskTreeDisplayProps> = ({
  toolCalls,
  availableTerminalHeight,
  terminalWidth,
  isExpandable,
  hasFocus = false,
}) => {
  const config = useConfig();
  const { commandContext } = useUIState();
  const { roots, collapseState, toggleCollapse } = useTaskTree(
    toolCalls,
    (call) => {
      const verbosity = config.getResolvedVerbosity(call.callId, undefined);
      return verbosity === 'quiet';
    },
  );
  const [focusedIndex, setFocusedIndex] = useState(0);

  const flattenedNodes = useMemo(
    () => flattenTree(roots, collapseState),
    [roots, collapseState],
  );

  const focusedNode = flattenedNodes[focusedIndex];

  useKeypress(
    (key: Key) => {
      if (keyMatchers[Command.NAVIGATION_DOWN](key)) {
        setFocusedIndex((prev) =>
          Math.min(prev + 1, flattenedNodes.length - 1),
        );
        return true;
      }
      if (keyMatchers[Command.NAVIGATION_UP](key)) {
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
        return true;
      }

      if (focusedNode) {
        if (keyMatchers[Command.TREE_COLLAPSE](key)) {
          if (!collapseState[focusedNode.id]) {
            toggleCollapse(focusedNode.id);
            return true;
          }
        }
        if (keyMatchers[Command.TREE_EXPAND](key)) {
          if (collapseState[focusedNode.id]) {
            toggleCollapse(focusedNode.id);
            return true;
          }
        }

        // 'c' to copy error chain
        if (key.name === 'c' && !key.ctrl && !key.alt) {
          const parts: string[] = [];
          let current: typeof focusedNode | undefined = focusedNode;
          while (current) {
            parts.unshift(current.call.name);
            current = current.parent;
          }
          const path = parts.join(' › ');
          copyToClipboard(path, commandContext.services.settings.merged).catch(
            () => {},
          );
          appEvents.emit(AppEvent.TransientMessage, {
            message: `Copied error path: ${path}`,
            type: TransientMessageType.Hint,
          });
          return true;
        }
      }
      return false;
    },
    { isActive: hasFocus },
  );

  if (roots.length === 0) {
    return null;
  }

  const focusedNodeId = focusedNode?.id;

  return (
    <Box flexDirection="column" width={terminalWidth} paddingRight={2}>
      {roots.map((root) => (
        <TaskNode
          key={root.id}
          node={root}
          availableTerminalHeight={availableTerminalHeight}
          terminalWidth={terminalWidth - 2}
          isExpandable={isExpandable}
          focusedNodeId={focusedNodeId}
          collapseState={collapseState}
          toggleCollapse={toggleCollapse}
        />
      ))}
      {focusedNodeId && (
        <Box
          borderStyle="round"
          borderColor={theme.border.default}
          paddingX={1}
          marginTop={1}
        >
          <Text>
            <Text color={theme.text.accent}>↑/↓</Text> Navigate{' '}
            <Text color={theme.text.accent}>←/→</Text> Collapse/Expand{' '}
            <Text color={theme.text.accent}>c</Text> Copy path{' '}
            <Text color={theme.text.accent}>Enter</Text> View Result
          </Text>
        </Box>
      )}
    </Box>
  );
};
