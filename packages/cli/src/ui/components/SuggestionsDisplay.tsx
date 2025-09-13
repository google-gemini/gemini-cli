/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { PrepareLabel, MAX_WIDTH } from './PrepareLabel.js';
import { CommandKind } from '../commands/types.js';
import { Colors } from '../colors.js';
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
  matchedIndex?: number;
  commandKind?: CommandKind;
}
interface SuggestionsDisplayProps {
  suggestions: Suggestion[];
  activeIndex: number;
  isLoading: boolean;
  width: number;
  scrollOffset: number;
  userInput: string;
  expandedIndex?: number;
}

export const MAX_SUGGESTIONS_TO_SHOW = 8;
export { MAX_WIDTH };

export function SuggestionsDisplay({
  suggestions,
  activeIndex,
  isLoading,
  width,
  scrollOffset,
  userInput,
  expandedIndex,
}: SuggestionsDisplayProps) {
  if (isLoading) {
    return (
      <Box paddingX={1} width={width}>
        <Text color="gray">Loading suggestions...</Text>
      </Box>
    );
  }

  if (suggestions.length === 0) {
    return null; // Don't render anything if there are no suggestions
  }

  // Calculate the visible slice based on scrollOffset
  const startIndex = scrollOffset;
  const endIndex = Math.min(
    scrollOffset + MAX_SUGGESTIONS_TO_SHOW,
    suggestions.length,
  );
  const visibleSuggestions = suggestions.slice(startIndex, endIndex);

  const getFullLabel = (s: Suggestion) =>
    s.label + (s.commandKind === CommandKind.MCP_PROMPT ? ' [MCP]' : '');

  const maxLabelLength = Math.max(
    ...suggestions.map((s) => getFullLabel(s).length),
  );
  const commandColumnWidth = Math.min(maxLabelLength, Math.floor(width * 0.5));

  return (
    <Box flexDirection="column" paddingX={1} width={width}>
      {scrollOffset > 0 && <Text color={theme.text.primary}>▲</Text>}

      {visibleSuggestions.map((suggestion, index) => {
        const originalIndex = startIndex + index;
        const isActive = originalIndex === activeIndex;
        const isExpanded = originalIndex === expandedIndex;
        const textColor = isActive ? theme.text.accent : theme.text.secondary;
        const isLong = suggestion.value.length >= MAX_WIDTH;
        const labelElement = (
          <PrepareLabel
            label={suggestion.value}
            matchedIndex={suggestion.matchedIndex}
            userInput={userInput}
            textColor={textColor}
            isExpanded={isExpanded}
          />
        );

        return (
          <Box key={`${suggestion.value}-${originalIndex}`} flexDirection="row">
            <Box width={commandColumnWidth} flexShrink={0}>
              <Box>
                {labelElement}
                {suggestion.commandKind === CommandKind.MCP_PROMPT && (
                  <Text color={textColor}> [MCP]</Text>
                )}
              </Box>
            </Box>

            {suggestion.description && (
              <Box flexGrow={1} paddingLeft={3}>
                <Text color={textColor} wrap="truncate">
                  {suggestion.description}
                </Text>
              </Box>
            )}
            {isActive && isLong && (
              <Box>
                <Text color={Colors.Gray}>{isExpanded ? ' ← ' : ' → '}</Text>
              </Box>
            )}
          </Box>
        );
      })}
      {endIndex < suggestions.length && <Text color="gray">▼</Text>}
      {suggestions.length > MAX_SUGGESTIONS_TO_SHOW && (
        <Text color="gray">
          ({activeIndex + 1}/{suggestions.length})
        </Text>
      )}
    </Box>
  );
}
