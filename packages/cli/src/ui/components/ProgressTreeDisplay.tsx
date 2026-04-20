/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useUIState } from '../contexts/UIStateContext.js';
import {
  buildProgressTree,
  type ToolCallTreeNode,
} from '../utils/progressTree.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';

function getStatusIcon(status: CoreToolCallStatus): {
  icon: string;
  color: string;
} {
  switch (status) {
    case CoreToolCallStatus.Success:
      return { icon: '\u2713', color: theme.status.success };
    case CoreToolCallStatus.Error:
      return { icon: '\u2717', color: theme.status.error };
    case CoreToolCallStatus.Executing:
      return { icon: '\u00BB', color: theme.text.accent };
    case CoreToolCallStatus.Cancelled:
      return { icon: '\u2717', color: theme.status.warning };
    default:
      return { icon: '\u2610', color: theme.text.secondary };
  }
}

interface TreeNodeProps {
  node: ToolCallTreeNode;
  prefix: string;
  isLast: boolean;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, prefix, isLast }) => {
  const { icon, color } = getStatusIcon(node.status);
  const connector = isLast ? '\u2514\u2500 ' : '\u251C\u2500 ';
  const childPrefix = prefix + (isLast ? '   ' : '\u2502  ');

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.text.secondary}>
          {prefix}
          {connector}
        </Text>
        <Text color={color}>{icon} </Text>
        <Text color={theme.text.primary}>{node.name}</Text>
        {node.description && (
          <Text color={theme.text.secondary}> {node.description}</Text>
        )}
      </Box>
      {node.children.map((child, i) => (
        <TreeNode
          key={child.callId}
          node={child}
          prefix={childPrefix}
          isLast={i === node.children.length - 1}
        />
      ))}
    </Box>
  );
};

export const ProgressTreeDisplay: React.FC = () => {
  const { history } = useUIState();
  const treeData = buildProgressTree(history);

  if (treeData.totalToolCalls === 0) {
    return (
      <Box marginY={1}>
        <Text color={theme.text.secondary}>
          No tool calls in this session yet.
        </Text>
      </Box>
    );
  }

  const { statusCounts } = treeData;

  return (
    <Box flexDirection="column" marginY={1}>
      <Box marginBottom={1}>
        <Text color={theme.text.primary} bold>
          Session Progress Tree
        </Text>
      </Box>

      <Box marginBottom={1} columnGap={2}>
        <Text color={theme.text.secondary}>
          Total:{' '}
          <Text color={theme.text.primary}>{treeData.totalToolCalls}</Text>
        </Text>
        {statusCounts.success > 0 && (
          <Text color={theme.status.success}>
            {'\u2713'} {statusCounts.success}
          </Text>
        )}
        {statusCounts.error > 0 && (
          <Text color={theme.status.error}>
            {'\u2717'} {statusCounts.error}
          </Text>
        )}
        {statusCounts.executing > 0 && (
          <Text color={theme.text.accent}>
            {'\u00BB'} {statusCounts.executing}
          </Text>
        )}
        {statusCounts.cancelled > 0 && (
          <Text color={theme.status.warning}>
            {'\u2717'} {statusCounts.cancelled}
          </Text>
        )}
        {statusCounts.pending > 0 && (
          <Text color={theme.text.secondary}>
            {'\u2610'} {statusCounts.pending}
          </Text>
        )}
      </Box>

      <Box flexDirection="column">
        {treeData.rootCalls.map((node, i) => (
          <TreeNode
            key={node.callId}
            node={node}
            prefix=""
            isLast={i === treeData.rootCalls.length - 1}
          />
        ))}
      </Box>
    </Box>
  );
};
