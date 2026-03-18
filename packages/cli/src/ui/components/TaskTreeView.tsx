/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import type { TaskTreeNode } from '../hooks/useTaskTree.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import { TOOL_STATUS } from '../constants.js';

/**
 * Tree connector characters for visualizing hierarchy.
 * ├─ connects non-last siblings; └─ connects the last sibling.
 */
const TREE_BRANCH = '├─ ';
const TREE_CORNER = '└─ ';
const TREE_PIPE = '│  ';
const TREE_SPACE = '   ';

/**
 * Returns the status icon and color for a given CoreToolCallStatus.
 * Reuses the same symbol conventions as ToolShared.tsx (constants.ts:20-27)
 * to maintain visual consistency across the CLI.
 */
function getStatusDisplay(status: CoreToolCallStatus): {
  icon: string;
  color: string;
} {
  switch (status) {
    case CoreToolCallStatus.Success:
      return { icon: TOOL_STATUS.SUCCESS, color: theme.status.success };
    case CoreToolCallStatus.Executing:
      return { icon: TOOL_STATUS.EXECUTING, color: theme.text.accent };
    case CoreToolCallStatus.AwaitingApproval:
      return { icon: TOOL_STATUS.CONFIRMING, color: theme.status.warning };
    case CoreToolCallStatus.Error:
      return { icon: TOOL_STATUS.ERROR, color: theme.status.error };
    case CoreToolCallStatus.Cancelled:
      return { icon: TOOL_STATUS.CANCELED, color: theme.status.warning };
    case CoreToolCallStatus.Validating:
    case CoreToolCallStatus.Scheduled:
    default:
      return { icon: TOOL_STATUS.PENDING, color: theme.text.secondary };
  }
}

// ---------------------------------------------------------------------------
// TaskTreeNodeRow: renders a single row in the task tree
// ---------------------------------------------------------------------------

interface TaskTreeNodeRowProps {
  node: TaskTreeNode;
  /** Prefix string containing tree connector characters from ancestor levels. */
  prefix: string;
  /** The connector character for this specific node (├─ or └─). */
  connector: string;
  /** Whether this node is currently collapsed (children hidden). */
  isCollapsed: boolean;
  /** Callback to toggle collapse state for this node. */
  onToggleCollapse: (callId: string) => void;
}

export const TaskTreeNodeRow: React.FC<TaskTreeNodeRowProps> = ({
  node,
  prefix,
  connector,
  isCollapsed,
  onToggleCollapse: _onToggleCollapse,
}) => {
  const { icon, color } = getStatusDisplay(node.tool.status);
  const hasChildren = node.children.length > 0;

  return (
    <Box>
      <Text color={theme.text.secondary}>{prefix}</Text>
      <Text color={theme.text.secondary}>{connector}</Text>
      <Text color={color}>{icon}</Text>
      <Text> </Text>
      <Text color={theme.text.primary} bold>
        {node.tool.name}
      </Text>
      {node.tool.description && (
        <Text color={theme.text.secondary}> {node.tool.description}</Text>
      )}
      {/* Progress message for executing tools */}
      {node.tool.progressMessage && (
        <Text color={theme.text.secondary}> ({node.tool.progressMessage})</Text>
      )}
      {/* Progress indicator for executing tools with progress data */}
      {node.tool.progress !== undefined && (
        <Text color={theme.text.accent}>
          {' '}
          {node.tool.progressTotal
            ? `${Math.round((node.tool.progress / node.tool.progressTotal) * 100)}%`
            : `${node.tool.progress}`}
        </Text>
      )}
      {/* Collapse indicator for nodes with children */}
      {hasChildren && isCollapsed && (
        <Text color={theme.text.secondary}>
          {' '}
          [+{node.children.length} hidden]
        </Text>
      )}
      {/* Clickable toggle hint */}
      {hasChildren && (
        <Text color={theme.text.secondary} dimColor>
          {' '}
          {isCollapsed ? '▶' : '▼'}
        </Text>
      )}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// TaskTreeView: recursively renders the full tree
// ---------------------------------------------------------------------------

export interface TaskTreeViewProps {
  /** Root-level tree nodes from useTaskTree(). */
  nodes: TaskTreeNode[];
  /** Terminal width for layout calculations. */
  terminalWidth: number;
}

/**
 * Interactive task tree visualization component for the Gemini CLI.
 *
 * Renders a hierarchical view of tool call execution using tree connectors
 * (├─ / └─), color-coded status icons, and collapsible child nodes.
 *
 * Terminal output example:
 *   ✓ read_file reading package.json
 *   ├─ ✓ search_files searching *.ts
 *   ├─ ? write_file updating config
 *   └─ ⊷ run_shell npm test  60%
 */
export const TaskTreeView: React.FC<TaskTreeViewProps> = ({
  nodes,
  terminalWidth: _terminalWidth,
}) => {
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  const toggleCollapse = useCallback((callId: string) => {
    setCollapsedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(callId)) {
        next.delete(callId);
      } else {
        next.add(callId);
      }
      return next;
    });
  }, []);

  if (nodes.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {nodes.map((node, index) => (
        <TreeNodeRenderer
          key={node.tool.callId}
          node={node}
          isLast={index === nodes.length - 1}
          prefix=""
          collapsedNodes={collapsedNodes}
          onToggleCollapse={toggleCollapse}
        />
      ))}
    </Box>
  );
};

// ---------------------------------------------------------------------------
// TreeNodeRenderer: recursive rendering of a single node + its children
// ---------------------------------------------------------------------------

interface TreeNodeRendererProps {
  node: TaskTreeNode;
  isLast: boolean;
  prefix: string;
  collapsedNodes: Set<string>;
  onToggleCollapse: (callId: string) => void;
}

const TreeNodeRenderer: React.FC<TreeNodeRendererProps> = ({
  node,
  isLast,
  prefix,
  collapsedNodes,
  onToggleCollapse,
}) => {
  const isCollapsed = collapsedNodes.has(node.tool.callId);
  const connector = node.depth === 0 ? '' : isLast ? TREE_CORNER : TREE_BRANCH;
  const childPrefix =
    node.depth === 0 ? '' : prefix + (isLast ? TREE_SPACE : TREE_PIPE);

  return (
    <Box flexDirection="column">
      <TaskTreeNodeRow
        node={node}
        prefix={prefix}
        connector={connector}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {!isCollapsed &&
        node.depth < 10 &&
        node.children.map((child, index) => (
          <TreeNodeRenderer
            key={child.tool.callId}
            node={child}
            isLast={index === node.children.length - 1}
            prefix={childPrefix}
            collapsedNodes={collapsedNodes}
            onToggleCollapse={onToggleCollapse}
          />
        ))}
    </Box>
  );
};
