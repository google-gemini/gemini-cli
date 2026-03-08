/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as React from 'react';
import { Box, Text } from 'ink';
import type { TaskTreeNode } from '../../hooks/useTaskTree.js';
import { ToolMessage } from './ToolMessage.js';
import { ShellToolMessage } from './ShellToolMessage.js';
import { isShellTool } from './ToolShared.js';
import { theme } from '../../semantic-colors.js';
import type { IndividualToolCallDisplay } from '../../types.js';
import { useConfig } from '../../contexts/ConfigContext.js';

export interface TaskNodeProps {
  node: TaskTreeNode<IndividualToolCallDisplay>;
  isExpandable?: boolean;
  terminalWidth: number;
  availableTerminalHeight?: number;
  focusedNodeId?: string;
  collapseState?: Record<string, boolean>;
  toggleCollapse?: (id: string) => void;
}

export const TaskNode: React.FC<TaskNodeProps> = ({
  node,
  isExpandable,
  terminalWidth,
  availableTerminalHeight,
  focusedNodeId,
  collapseState = {},
  toggleCollapse,
}) => {
  const config = useConfig();
  const isFocused = node.id === focusedNodeId;
  const isError = node.call.status === 'error';

  // Build breadcrumb path for errors
  const getBreadcrumbs = (
    n: TaskTreeNode<IndividualToolCallDisplay>,
  ): string[] => {
    const parts: string[] = [];
    let current: TaskTreeNode<IndividualToolCallDisplay> | undefined = n;
    while (current) {
      parts.unshift(current.call.name);
      current = current.parent;
    }
    return parts;
  };

  const breadcrumbs = isError ? getBreadcrumbs(node) : [];
  const isCollapsed = collapseState[node.id] || false;
  const hasChildren = node.children.length > 0;

  const borderColor = isFocused ? theme.ui.focus : theme.border.default;
  const borderDimColor = !isFocused;

  const commonProps = {
    ...node.call,
    terminalWidth: terminalWidth - node.depth * 2,
    availableTerminalHeight,
    isFirst: true,
    borderColor,
    borderDimColor,
    isExpandable,
    emphasis: (isFocused ? 'high' : 'medium') as 'high' | 'medium' | 'low',
    hideSubagentTools: true,
  };

  return (
    <Box flexDirection="column" paddingLeft={node.depth > 0 ? 2 : 0}>
      <Box flexDirection="row">
        {hasChildren && (
          <Box marginRight={1}>
            <Text color={borderColor}>{isCollapsed ? '▶' : '▼'}</Text>
          </Box>
        )}
        <Box flexDirection="column" flexGrow={1}>
          {isShellTool(node.call.name) ? (
            <ShellToolMessage {...commonProps} config={config} />
          ) : (
            <ToolMessage {...commonProps} />
          )}

          {isError && breadcrumbs.length > 1 && (
            <Box marginLeft={2} marginTop={0}>
              <Text color={theme.status.error} dimColor>
                Error path: {breadcrumbs.join(' › ')}
              </Text>
            </Box>
          )}
        </Box>
      </Box>

      {hasChildren && !isCollapsed && (
        <Box flexDirection="column">
          {node.children.map((child) => (
            <TaskNode
              key={child.id}
              node={child}
              isExpandable={isExpandable}
              terminalWidth={terminalWidth}
              availableTerminalHeight={availableTerminalHeight}
              focusedNodeId={focusedNodeId}
              collapseState={collapseState}
              toggleCollapse={toggleCollapse}
            />
          ))}
        </Box>
      )}
    </Box>
  );
};
