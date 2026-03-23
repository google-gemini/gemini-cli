/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import type { ContextWindowData } from '../types.js';

const BAR_WIDTH = 60;

/**
 * Color mapping for each context category.
 * Chosen for perceptual distinctness and color-blind accessibility:
 * blue, purple, yellow, cyan avoid the red-green confusion axis.
 */
const categoryColors = {
  get system() {
    return theme.text.link;
  }, // AccentBlue
  get memory() {
    return theme.status.warning;
  }, // AccentYellow
  get tools() {
    return theme.text.accent;
  }, // AccentPurple
  get conversation() {
    return theme.ui.symbol;
  }, // AccentCyan
  get free() {
    return theme.ui.dark;
  }, // DarkGray
  get marker() {
    return theme.text.primary;
  }, // Foreground
};

/** Format a token count compactly: 1,200 → "1.2k", 48,446 → "48k", 1,048,576 → "1,049k" */
function fmtCompact(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.floor(n).toString();
}

/** Format a number with thousands separators. */
function fmtNum(n: number): string {
  return Math.floor(n).toLocaleString();
}

/**
 * Builds the sub-bar annotation line, aligning the compress label with
 * the │ marker on the bar above. Prefers └ to the right of the marker;
 * falls back to ┘ on the left if the label would extend past the bar.
 */
function buildSubBarLine(
  data: ContextWindowData,
  total: number,
  markerPos: number,
): string {
  const leftLabel = ` used (${((data.tokensUsed / total) * 100).toFixed(0)}%)`;
  const pctText =
    'compress at ' + (data.compressionThreshold * 100).toFixed(0) + '%';
  const lineWidth = BAR_WIDTH + 2;

  // +1 for the ▐ border character
  const markerCol = markerPos + 1;

  // Try placing └ label to the RIGHT of the marker
  const rightLabel = '\u2514 ' + pctText;
  if (markerCol + rightLabel.length <= lineWidth) {
    const gap = Math.max(1, markerCol - leftLabel.length);
    return leftLabel + ' '.repeat(gap) + rightLabel;
  }

  // Fall back to placing ┘ label to the LEFT of the marker
  const leftArrow = pctText + ' \u2518';
  const arrowStart = markerCol - leftArrow.length + 1;
  const gap = Math.max(1, arrowStart - leftLabel.length);
  return leftLabel + ' '.repeat(gap) + leftArrow;
}

/**
 * Renders a segmented bar showing proportional usage by category,
 * with a compression threshold marker.
 */
const SegmentedBar: React.FC<{ data: ContextWindowData }> = ({ data }) => {
  const total = data.tokenLimit;
  if (total <= 0) return null;

  // Compute character counts for each segment
  const segments = [
    { tokens: data.systemPromptTokens, color: categoryColors.system },
    { tokens: data.memoryTokens, color: categoryColors.memory },
    { tokens: data.toolDeclarationTokens, color: categoryColors.tools },
    { tokens: data.conversationTokens, color: categoryColors.conversation },
  ];

  const usedChars = segments.map((s) => {
    const fraction = s.tokens / total;
    return Math.max(fraction > 0 ? 1 : 0, Math.round(fraction * BAR_WIDTH));
  });

  // Ensure we don't exceed BAR_WIDTH for the used portion
  let totalUsedChars = usedChars.reduce((a, b) => a + b, 0);
  while (totalUsedChars > BAR_WIDTH) {
    const maxIdx = usedChars.indexOf(Math.max(...usedChars));
    usedChars[maxIdx]--;
    totalUsedChars--;
  }

  const freeChars = BAR_WIDTH - totalUsedChars;

  // Compression threshold marker position
  const markerPos = Math.round(data.compressionThreshold * BAR_WIDTH);

  // Build the bar as an array of { char, color } entries
  const bar: Array<{ char: string; color: string }> = [];

  for (let i = 0; i < segments.length; i++) {
    for (let j = 0; j < usedChars[i]; j++) {
      bar.push({ char: '\u2588', color: segments[i].color }); // █
    }
  }

  for (let i = 0; i < freeChars; i++) {
    bar.push({ char: '\u2591', color: categoryColors.free }); // ░
  }

  // Insert compression marker (replace the character at that position)
  if (markerPos > 0 && markerPos < BAR_WIDTH) {
    bar[markerPos] = { char: '\u2502', color: categoryColors.marker }; // │
  }

  // Group consecutive characters with the same color for efficient rendering
  const groups: Array<{ text: string; color: string }> = [];
  for (const entry of bar) {
    const last = groups[groups.length - 1];
    if (last && last.color === entry.color) {
      last.text += entry.char;
    } else {
      groups.push({ text: entry.char, color: entry.color });
    }
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color={categoryColors.free}>{'\u2590'}</Text>
        {groups.map((g, i) => (
          <Text key={i} color={g.color}>
            {g.text}
          </Text>
        ))}
        <Text color={categoryColors.free}>{'\u258C'}</Text>
      </Box>

      {/* Sub-bar labels: position the ┘/└ to align with the │ marker */}
      <Box flexDirection="row" width={BAR_WIDTH + 2}>
        <Text color={theme.text.secondary}>
          {buildSubBarLine(data, total, markerPos)}
        </Text>
      </Box>
    </Box>
  );
};

/**
 * A single row in the breakdown table.
 */
const CategoryRow: React.FC<{
  label: string;
  tokens: number;
  pctOfLimit: number;
  color: string;
  detail?: string;
}> = ({ label, tokens, pctOfLimit, color, detail }) => (
  <Box flexDirection="row">
    <Box width={20}>
      <Text color={color}>{label}</Text>
    </Box>
    <Box width={12} justifyContent="flex-end">
      <Text>{fmtNum(tokens)}</Text>
    </Box>
    <Box width={8} justifyContent="flex-end">
      <Text color={theme.text.secondary}>{pctOfLimit.toFixed(1)}%</Text>
    </Box>
    {detail && (
      <Box marginLeft={3}>
        <Text color={theme.text.secondary}>{detail}</Text>
      </Box>
    )}
  </Box>
);

export const ContextWindowDisplay: React.FC<{ data: ContextWindowData }> = ({
  data,
}) => {
  const pctUsed = data.tokenLimit > 0 ? data.tokensUsed / data.tokenLimit : 0;
  const remaining = Math.max(0, data.tokenLimit - data.tokensUsed);

  const turnsEstimate =
    data.estimatedTurnsRemaining !== null
      ? ` \u00B7 \u2248 ${fmtNum(data.estimatedTurnsRemaining)} turns at current rate`
      : '';

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingTop={1}
      paddingX={2}
    >
      {/* Header */}
      <Box
        flexDirection="row"
        justifyContent="space-between"
        width={BAR_WIDTH + 2}
      >
        <Box flexDirection="row">
          <Text bold color={theme.text.accent}>
            Context
          </Text>
          <Text color={theme.text.secondary}>
            {' \u00B7 '}
            {data.model}
          </Text>
        </Box>
        <Text color={theme.text.secondary}>
          {fmtCompact(data.tokensUsed)} / {fmtCompact(data.tokenLimit)} tokens
        </Text>
      </Box>

      {/* Segmented bar */}
      <Box height={1} />
      <SegmentedBar data={data} />

      {/* Remaining headline */}
      <Box height={1} />
      <Box>
        <Text
          bold
          color={
            pctUsed >= 0.9
              ? theme.status.error
              : pctUsed >= 0.6
                ? theme.status.warning
                : theme.text.primary
          }
        >
          {fmtCompact(remaining)} tokens remaining
        </Text>
        <Text color={theme.text.secondary}>{turnsEstimate}</Text>
      </Box>

      {/* Breakdown table */}
      <Box height={1} />
      <Box flexDirection="column">
        <CategoryRow
          label="System prompt"
          tokens={data.systemPromptTokens}
          pctOfLimit={
            data.tokenLimit > 0
              ? (data.systemPromptTokens / data.tokenLimit) * 100
              : 0
          }
          color={categoryColors.system}
        />
        <CategoryRow
          label="Tool schemas"
          tokens={data.toolDeclarationTokens}
          pctOfLimit={
            data.tokenLimit > 0
              ? (data.toolDeclarationTokens / data.tokenLimit) * 100
              : 0
          }
          color={categoryColors.tools}
          detail={`${data.toolCount} tools`}
        />
        <CategoryRow
          label="Memory files"
          tokens={data.memoryTokens}
          pctOfLimit={
            data.tokenLimit > 0
              ? (data.memoryTokens / data.tokenLimit) * 100
              : 0
          }
          color={categoryColors.memory}
          detail={`${data.memoryFileCount} files`}
        />
        <CategoryRow
          label="Conversation"
          tokens={data.conversationTokens}
          pctOfLimit={
            data.tokenLimit > 0
              ? (data.conversationTokens / data.tokenLimit) * 100
              : 0
          }
          color={categoryColors.conversation}
          detail={`${data.turnCount} turns`}
        />
      </Box>
    </Box>
  );
};
