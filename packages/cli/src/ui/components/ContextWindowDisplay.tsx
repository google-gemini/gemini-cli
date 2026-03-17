/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import type { ContextWindowData, ContextWindowTurn } from '../types.js';

const BAR_WIDTH = 30;
const LABEL_WIDTH = 22;
const TOKEN_WIDTH = 14;
const PCT_WIDTH = 7;

/**
 * Renders a visual progress bar using Unicode block characters.
 */
function renderBar(fraction: number, width: number): string {
  const clamped = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(clamped * width);
  const empty = width - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

/**
 * Formats a number with thousands separators.
 */
function fmtNum(n: number): string {
  return Math.floor(n).toLocaleString();
}

/**
 * Returns a color based on how full the bar is.
 */
function barColor(fraction: number): string {
  if (fraction >= 0.9) return theme.status.error;
  if (fraction >= 0.6) return theme.status.warning;
  return theme.ui.focus;
}

/**
 * Returns an icon for a conversation turn based on its kind.
 */
function turnIcon(turn: ContextWindowTurn): string {
  switch (turn.kind) {
    case 'tool_call':
      return '\u0192'; // ƒ
    case 'tool_result':
      return '\u2398'; // ⎘
    case 'media':
      return '\u25A3'; // ▣
    default:
      return ' ';
  }
}

/**
 * A row in the breakdown section showing a category with a visual bar.
 */
const BreakdownRow: React.FC<{
  label: string;
  tokens: number;
  total: number;
  detail?: string;
}> = ({ label, tokens, total, detail }) => {
  const fraction = total > 0 ? tokens / total : 0;
  const pct = (fraction * 100).toFixed(0);

  return (
    <Box flexDirection="row">
      <Box width={LABEL_WIDTH}>
        <Text bold color={theme.text.link}>
          {label}
        </Text>
      </Box>
      <Box width={BAR_WIDTH + 1}>
        <Text color={barColor(fraction)}>{renderBar(fraction, BAR_WIDTH)}</Text>
      </Box>
      <Box width={PCT_WIDTH} justifyContent="flex-end">
        <Text color={theme.text.secondary}>{pct}%</Text>
      </Box>
      <Box width={TOKEN_WIDTH} justifyContent="flex-end">
        <Text color={theme.text.primary}>{fmtNum(tokens)}</Text>
      </Box>
      {detail && (
        <Box marginLeft={1}>
          <Text color={theme.text.secondary}>{detail}</Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * A single conversation turn row.
 */
const TurnRow: React.FC<{
  turn: ContextWindowTurn;
}> = ({ turn }) => {
  const icon = turnIcon(turn);
  const roleColor = turn.role === 'user' ? theme.ui.focus : theme.text.accent;

  return (
    <Box flexDirection="row">
      <Box width={5} justifyContent="flex-end">
        <Text color={theme.text.secondary}>{turn.index}</Text>
      </Box>
      <Box width={2}>
        <Text color={theme.text.secondary}>{icon}</Text>
      </Box>
      <Box width={7}>
        <Text color={roleColor}>{turn.role}</Text>
      </Box>
      <Box width={TOKEN_WIDTH} justifyContent="flex-end">
        <Text color={theme.text.primary}>{fmtNum(turn.tokens)}</Text>
      </Box>
      <Box marginLeft={2} flexShrink={1}>
        <Text color={theme.text.secondary} wrap="truncate">
          {turn.preview}
        </Text>
      </Box>
    </Box>
  );
};

export const ContextWindowDisplay: React.FC<{ data: ContextWindowData }> = ({
  data,
}) => {
  const usageFraction =
    data.tokenLimit > 0 ? data.tokensUsed / data.tokenLimit : 0;
  const usagePct = (usageFraction * 100).toFixed(1);

  const maxTurnsToShow = 30;
  const turnsToShow = data.turns.slice(0, maxTurnsToShow);
  const hiddenTurns = data.turns.length - turnsToShow.length;

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      marginY={1}
      width={88}
    >
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color={theme.text.accent}>
          Context Window
        </Text>
      </Box>

      {/* Model and overall usage */}
      <Box flexDirection="row">
        <Text color={theme.text.secondary}>Model: </Text>
        <Text color={theme.text.primary}>{data.model}</Text>
      </Box>

      {/* Overall progress bar */}
      <Box flexDirection="row">
        <Text color={barColor(usageFraction)}>
          {renderBar(usageFraction, BAR_WIDTH)}
        </Text>
        <Text color={theme.text.secondary}>
          {' '}
          {usagePct}% of {fmtNum(data.tokenLimit)}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          {fmtNum(data.tokensUsed)} tokens used
        </Text>
      </Box>

      {/* Divider */}
      <Box
        borderStyle="single"
        borderBottom={true}
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
        width="100%"
        marginBottom={1}
      />

      {/* Breakdown header */}
      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          Breakdown
        </Text>
      </Box>

      {/* Category bars */}
      <BreakdownRow
        label="System Prompt"
        tokens={data.systemPromptTokens}
        total={data.tokensUsed}
      />
      <BreakdownRow
        label="Tool Declarations"
        tokens={data.toolDeclarationTokens}
        total={data.tokensUsed}
        detail={`${data.toolCount} tools`}
      />
      <BreakdownRow
        label="Conversation"
        tokens={data.conversationTokens}
        total={data.tokensUsed}
        detail={`${data.turns.length} turns`}
      />

      {/* Conversation turns */}
      {data.turns.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {/* Divider */}
          <Box
            borderStyle="single"
            borderBottom={true}
            borderTop={false}
            borderLeft={false}
            borderRight={false}
            borderColor={theme.border.default}
            width="100%"
            marginBottom={1}
          />

          <Box>
            <Text bold color={theme.text.primary}>
              Conversation History
            </Text>
          </Box>

          {/* Column header */}
          <Box flexDirection="row">
            <Box width={5} justifyContent="flex-end">
              <Text color={theme.text.secondary}>#</Text>
            </Box>
            <Box width={2}>
              <Text> </Text>
            </Box>
            <Box width={7}>
              <Text color={theme.text.secondary}>Role</Text>
            </Box>
            <Box width={TOKEN_WIDTH} justifyContent="flex-end">
              <Text color={theme.text.secondary}>Tokens</Text>
            </Box>
            <Box marginLeft={2}>
              <Text color={theme.text.secondary}>Content</Text>
            </Box>
          </Box>

          {turnsToShow.map((turn) => (
            <TurnRow key={turn.index} turn={turn} />
          ))}

          {hiddenTurns > 0 && (
            <Box marginLeft={5}>
              <Text color={theme.text.secondary}>
                ... and {hiddenTurns} more turns
              </Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};
