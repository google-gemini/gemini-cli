/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { theme } from '../../semantic-colors.js';
import { useUIState } from '../../contexts/UIStateContext.js';

const HORIZONTAL_RULE_CHAR = '─';
const MIN_RULE_LENGTH = 3;
const HEADER_INDENT = 1;
const BODY_INDENT = 2;

/**
 * Picks a deterministic accent color for a forum member so the same member is
 * always rendered in the same color across rounds.
 *
 * The palette intentionally pulls from the active semantic theme so the colors
 * follow the user's chosen theme.
 */
function getMemberPalette(): string[] {
  return [
    theme.text.link,
    theme.text.accent,
    theme.status.success,
    theme.status.warning,
    theme.status.error,
    theme.ui.symbol,
  ];
}

function memberColor(memberId: string): string {
  const palette = getMemberPalette();
  let hash = 0;
  for (let i = 0; i < memberId.length; i++) {
    hash = (hash * 31 + memberId.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

/**
 * Renders a centered, dim "rule" used for forum system notices and section
 * separators. Output looks like: ────── text ──────
 */
const ForumRule: React.FC<{ text: string; terminalWidth: number }> = ({
  text,
  terminalWidth,
}) => {
  const padded = ` ${text} `;
  const remaining = Math.max(
    terminalWidth - padded.length,
    MIN_RULE_LENGTH * 2,
  );
  const sideLen = Math.max(MIN_RULE_LENGTH, Math.floor(remaining / 2));
  const side = HORIZONTAL_RULE_CHAR.repeat(sideLen);
  return (
    <Box width={terminalWidth} justifyContent="center">
      <Text color={theme.ui.comment} dimColor>
        {side}
        {padded}
        {side}
      </Text>
    </Box>
  );
};

/* ------------------------------------------------------------------------- */
/* System notices                                                            */
/* ------------------------------------------------------------------------- */

interface ForumSystemMessageProps {
  text: string;
  terminalWidth: number;
}

/**
 * System events (entered forum, seeded context, members started, errors,
 * synthesizing, etc.) render as a dim, centered rule rather than a regular
 * chat message so they recede into the background of the conversation.
 */
export const ForumSystemMessage: React.FC<ForumSystemMessageProps> = ({
  text,
  terminalWidth,
}) => <ForumRule text={text} terminalWidth={terminalWidth} />;

/* ------------------------------------------------------------------------- */
/* User input within forum                                                   */
/* ------------------------------------------------------------------------- */

interface ForumUserMessageProps {
  text: string;
  isTask: boolean;
  terminalWidth: number;
}

/**
 * Renders a user post in forum mode with a distinct chat-bubble appearance.
 * The initial task is emphasized; subsequent steer messages use a softer label.
 */
export const ForumUserMessage: React.FC<ForumUserMessageProps> = ({
  text,
  isTask,
  terminalWidth,
}) => {
  const label = isTask ? 'You (task)' : 'You (steer)';
  const color = theme.text.accent;
  return (
    <Box flexDirection="column" width={terminalWidth} marginTop={1}>
      <Box paddingLeft={HEADER_INDENT}>
        <Text color={color} bold>
          ▌ {label}
        </Text>
      </Box>
      <Box paddingLeft={BODY_INDENT}>
        <Text color={theme.text.primary} wrap="wrap">
          {text}
        </Text>
      </Box>
    </Box>
  );
};

/* ------------------------------------------------------------------------- */
/* Member posts (the core "chat room" experience)                            */
/* ------------------------------------------------------------------------- */

interface ForumAgentMessageProps {
  label: string;
  memberId: string;
  text: string;
  terminalWidth: number;
}

/**
 * Renders a chat-room style message from a forum member: a colored header bar
 * with the member's name, then a markdown body indented under a vertical rule
 * in the same color. Each member keeps the same color across all rounds so
 * users can scan the conversation by speaker at a glance.
 */
export const ForumAgentMessage: React.FC<ForumAgentMessageProps> = ({
  label,
  memberId,
  text,
  terminalWidth,
}) => {
  const { renderMarkdown } = useUIState();
  const color = memberColor(memberId);
  const bodyIndent = BODY_INDENT;
  const bodyWidth = Math.max(terminalWidth - bodyIndent - 2, 0);

  return (
    <Box flexDirection="column" width={terminalWidth} marginTop={1}>
      <Box paddingLeft={HEADER_INDENT}>
        <Text color={color} bold>
          ● {label}
        </Text>
      </Box>
      <Box flexDirection="row">
        <Box width={bodyIndent}>
          <Text color={color}>{' │'}</Text>
        </Box>
        <Box flexGrow={1} flexDirection="column">
          <MarkdownDisplay
            text={text}
            isPending={false}
            terminalWidth={bodyWidth}
            renderMarkdown={renderMarkdown}
          />
        </Box>
      </Box>
    </Box>
  );
};

/* ------------------------------------------------------------------------- */
/* Final synthesis (highlighted variant of an agent message)                 */
/* ------------------------------------------------------------------------- */

interface ForumFinalMessageProps {
  label: string;
  memberId: string;
  text: string;
  terminalWidth: number;
}

/**
 * Renders the synthesizer's final post with stronger emphasis: a flag marker
 * in success color, a section rule, and the body in the member's color.
 */
export const ForumFinalMessage: React.FC<ForumFinalMessageProps> = ({
  label,
  memberId,
  text,
  terminalWidth,
}) => {
  const { renderMarkdown } = useUIState();
  const color = memberColor(memberId);
  const bodyIndent = BODY_INDENT;
  const bodyWidth = Math.max(terminalWidth - bodyIndent - 2, 0);

  return (
    <Box flexDirection="column" width={terminalWidth} marginTop={1}>
      <ForumRule text="final synthesis" terminalWidth={terminalWidth} />
      <Box paddingLeft={HEADER_INDENT} marginTop={1}>
        <Text color={theme.status.success} bold>
          ⚑{' '}
        </Text>
        <Text color={color} bold>
          {label}
        </Text>
      </Box>
      <Box flexDirection="row">
        <Box width={bodyIndent}>
          <Text color={color}>{' │'}</Text>
        </Box>
        <Box flexGrow={1} flexDirection="column">
          <MarkdownDisplay
            text={text}
            isPending={false}
            terminalWidth={bodyWidth}
            renderMarkdown={renderMarkdown}
          />
        </Box>
      </Box>
    </Box>
  );
};

/* ------------------------------------------------------------------------- */
/* Activity (transient: thinking, tool, error)                               */
/* ------------------------------------------------------------------------- */

interface ForumActivityMessageProps {
  label: string;
  activityKind: 'thinking' | 'tool' | 'error';
  text: string;
  terminalWidth: number;
}

const ACTIVITY_GLYPH: Record<
  ForumActivityMessageProps['activityKind'],
  string
> = {
  thinking: '∴',
  tool: '⚙',
  error: '⚠',
};

/**
 * A subtle one-line indicator showing what a member is currently doing while
 * we wait for their next post. By default the line is collapsed to a generic
 * "thinking…" placeholder per member so the conversation stays uncluttered;
 * when the user expands the view with Ctrl+O the full activity (model
 * thoughts, tool calls with their argument summary, or errors) is revealed.
 */
export const ForumActivityMessage: React.FC<ForumActivityMessageProps> = ({
  label,
  activityKind,
  text,
  terminalWidth,
}) => {
  const { constrainHeight } = useUIState();
  const expanded = !constrainHeight;
  const color =
    expanded && activityKind === 'error'
      ? theme.status.error
      : theme.ui.comment;
  const glyph = expanded
    ? ACTIVITY_GLYPH[activityKind]
    : ACTIVITY_GLYPH.thinking;
  const body = expanded ? `${label} · ${text}` : `${label} thinking…`;
  return (
    <Box paddingLeft={HEADER_INDENT} width={terminalWidth}>
      <Text color={color} dimColor italic wrap="truncate-end">
        {glyph} {body}
      </Text>
    </Box>
  );
};
