/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { CoreToolCallStatus } from '@google/gemini-cli-core';
import { CliSpinner } from './CliSpinner.js';
import { ToolResultDisplay } from './messages/ToolResultDisplay.js';
import { theme } from '../semantic-colors.js';
import type { TaskTreeNode } from '../types.js';

// ── Tree-drawing characters ─────────────────────────────────────
const BRANCH = '├─ ';
const LAST = '└─ ';
const PIPE = '│   ';
const BLANK = '    ';
/** Min width for tool name column so descriptions align. */
const TOOL_NAME_WIDTH = 14;

// ── Status glyphs (spec: ✓ ● ◷ ◌) ───────────────────────────────────────────
function statusGlyph(status: CoreToolCallStatus): {
  text: string;
  color: string;
} {
  switch (status) {
    case CoreToolCallStatus.Success:
      return { text: '✓', color: theme.status.success };
    case CoreToolCallStatus.Error:
      return { text: '✗', color: theme.status.error };
    case CoreToolCallStatus.Cancelled:
      return { text: '⊘', color: theme.text.secondary };
    case CoreToolCallStatus.Executing:
      return { text: '●', color: theme.status.warning };
    case CoreToolCallStatus.AwaitingApproval:
      return { text: '?', color: theme.status.warning };
    case CoreToolCallStatus.Scheduled:
      return { text: '◷', color: theme.text.secondary };
    case CoreToolCallStatus.Validating:
    default:
      return { text: '◌', color: theme.text.secondary };
  }
}

/** Status suffix for row: [0.3s], [running…], [pending], [queued]. No duration in data so we use [done] for success. */
function statusSuffix(status: CoreToolCallStatus): string {
  switch (status) {
    case CoreToolCallStatus.Success:
      return '[done]';
    case CoreToolCallStatus.Executing:
      return '[running…]';
    case CoreToolCallStatus.Scheduled:
      return '[pending]';
    case CoreToolCallStatus.AwaitingApproval:
      return '[pending]';
    case CoreToolCallStatus.Error:
    case CoreToolCallStatus.Cancelled:
      return '[done]';
    case CoreToolCallStatus.Validating:
    default:
      return '[queued]';
  }
}

interface TaskNodeProps {
  node: TaskTreeNode;
  /** Characters to prepend that come from ancestor nodes (pipe/blank). */
  prefix: string;
  /** True when this is the last sibling at its level. */
  isLast: boolean;
  terminalWidth: number;
}

/**
 * Renders a single row in the task tree, including its branch connector,
 * status icon, tool name, description, and — when expanded — the tool's
 * output and its children.
 */
export const TaskNode: React.FC<TaskNodeProps> = ({
  node,
  prefix,
  isLast,
  terminalWidth,
}) => {
  const { toolCall, children, isCollapsed, isFocused } = node;
  const glyph = statusGlyph(toolCall.status);
  const isRunning = toolCall.status === CoreToolCallStatus.Executing;
  const hasChildren = children.length > 0;
  const hasOutput =
    toolCall.resultDisplay !== undefined && toolCall.resultDisplay !== '';

  // Connector and prefix for children (spec: ├─ └─ │   )
  const connector = isLast ? LAST : BRANCH;
  const childPrefix = prefix + (isLast ? BLANK : PIPE);

  // Spec row: ├─ ✓ read_file       src/auth.ts              [0.3s]
  const namePadded = toolCall.name.padEnd(TOOL_NAME_WIDTH);
  const suffix = statusSuffix(toolCall.status);

  // Collapse hint when focused
  const collapseToggle =
    hasChildren || hasOutput ? (isCollapsed ? ' [+]' : ' [-]') : '';
  const collapseHintColor = isFocused
    ? theme.text.accent
    : theme.text.secondary;

  return (
    <Box flexDirection="column">
      {/* Single-line row per spec */}
      <Box flexDirection="row" flexShrink={0}>
        <Text color={theme.text.secondary}>{prefix}</Text>
        <Text color={theme.text.secondary}>{connector}</Text>
        <Box minWidth={2} flexShrink={0}>
          {isRunning ? (
            <Text color={glyph.color}>
              <CliSpinner type="toggle" />
            </Text>
          ) : (
            <Text color={glyph.color}>{glyph.text}</Text>
          )}
          <Text> </Text>
        </Box>
        <Text
          color={
            toolCall.status === CoreToolCallStatus.Cancelled
              ? theme.text.secondary
              : theme.text.primary
          }
          bold
          strikethrough={toolCall.status === CoreToolCallStatus.Cancelled}
          wrap="truncate"
        >
          {namePadded}
        </Text>
        {toolCall.description ? (
          <Text color={theme.text.secondary} wrap="truncate">
            {' '}
            {toolCall.description}
          </Text>
        ) : null}
        <Text color={theme.text.secondary}> {suffix}</Text>
        {collapseToggle ? (
          <Text color={collapseHintColor}>{collapseToggle}</Text>
        ) : null}
      </Box>

      {/* ── Inline output (shown when not collapsed) ── */}
      {!isCollapsed && hasOutput && (
        <Box flexDirection="row">
          {/* Continuation pipe from this node */}
          <Text color={theme.text.secondary}>
            {childPrefix}
            {'   '}
          </Text>
          <Box flexDirection="column" flexShrink={1} flexGrow={1}>
            <ToolResultDisplay
              resultDisplay={toolCall.resultDisplay}
              terminalWidth={
                terminalWidth - (childPrefix.length + 3) /* indent */
              }
              renderOutputAsMarkdown={toolCall.renderOutputAsMarkdown}
            />
          </Box>
        </Box>
      )}

      {/* ── Children (shown when not collapsed) ── */}
      {!isCollapsed &&
        children.map((child, idx) => (
          <TaskNode
            key={child.toolCall.callId}
            node={child}
            prefix={childPrefix}
            isLast={idx === children.length - 1}
            terminalWidth={terminalWidth}
          />
        ))}
    </Box>
  );
};
