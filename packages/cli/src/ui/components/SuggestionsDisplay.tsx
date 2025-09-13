/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { PrepareLabel } from './PrepareLabel.js';
import { CommandKind } from '../commands/types.js';
import { CompletionMode } from '../hooks/useCommandCompletion.js';
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
  completionMode: CompletionMode;
}

export const MAX_SUGGESTIONS_TO_SHOW = 8;
const SUGGESTION_LABEL_WIDTH_RATIO = 0.8;

// Utility to truncate long text with ellipsis for better UI polish
function truncateWithEllipsis(text: string, maxLength: number): string {
  // Ensure text is a string before operating on it.
  if (typeof text !== 'string' || !text) {
    return '';
  }
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

export function SuggestionsDisplay({
  suggestions,
  activeIndex,
  isLoading,
  width,
  scrollOffset,
  userInput,
  completionMode,
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

  const isSlashCommandMode = completionMode === CompletionMode.SLASH;
  let commandNameWidth = 0;

  if (isSlashCommandMode) {
    const maxLabelLength = visibleSuggestions.length
      ? Math.max(...visibleSuggestions.map((s) => s.label.length))
      : 0;

    const maxAllowedWidth = Math.floor(width * 0.35);
    commandNameWidth = Math.max(
      15,
      Math.min(maxLabelLength + 2, maxAllowedWidth),
    );
  }
  return (
    <Box flexDirection="column" paddingX={1} width={width}>
      {scrollOffset > 0 && <Text color={Colors.Foreground}>▲</Text>}

      {visibleSuggestions.map((suggestion, index) => {
        const originalIndex = startIndex + index;
        const isActive = originalIndex === activeIndex;
            const textColor = isActive ? Colors.AccentPurple : Colors.Gray;

        // For file path completions, truncate very long paths to prevent overflow
        const displayLabel =
          completionMode === CompletionMode.AT
            ? truncateWithEllipsis(
                suggestion.label,
                Math.floor(width * SUGGESTION_LABEL_WIDTH_RATIO),
              )
            : suggestion.label;
        const labelElement = (
          <PrepareLabel
            label={displayLabel}
            matchedIndex={suggestion.matchedIndex}
            userInput={userInput}
            textColor={textColor}
          />
        );

        return (
          <Box key={`${suggestion.value}-${originalIndex}`} width={width}>
            <Box flexDirection="row">
              {isSlashCommandMode ? (
                <>
                  <Box width={commandNameWidth} flexShrink={0}>
                    {labelElement}
                    {suggestion.commandKind === CommandKind.MCP_PROMPT && (
                      <Text color={Colors.Gray}> [MCP]</Text>
                    )}
                  </Box>
                  {suggestion.description && (
                    <Box flexGrow={1} marginLeft={1}>
                      <Text color={textColor} wrap="wrap">
                        {suggestion.description}
                      </Text>
                    </Box>
                  )}
                </>
              ) : (
                <>
                  {labelElement}
                  {suggestion.description && (
                    <Box flexGrow={1} marginLeft={1}>
                      <Text color={textColor} wrap="wrap">
                        {suggestion.description}
                      </Text>
                    </Box>
                  )}
                </>
              )}
            </Box>
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
