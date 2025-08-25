/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { PrepareLabel } from './PrepareLabel.js';
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
  matchedIndex?: number;
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
export const MAX_SUGGESTION_WIDTH = 150; // Maximum width for the suggestion text

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

  const isSlashCommandMode = userInput.startsWith('/');
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
        const isExpanded = originalIndex === expandedIndex;
        const textColor = isActive ? Colors.AccentPurple : Colors.Gray;
        const isLong = suggestion.value.length >= MAX_SUGGESTION_WIDTH;
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
          <Box
            key={`${suggestion.value}-${originalIndex}`}
            flexDirection="column"
            width={width}
          >
            <Box flexDirection="row">
              {isSlashCommandMode ? (
                <>
                  <Box width={commandNameWidth} flexShrink={0}>
                    {labelElement}
                  </Box>
                  {suggestion.description ? (
                    <Box flexGrow={1} marginLeft={1}>
                      <Text color={textColor} wrap="wrap">
                        {suggestion.description}
                      </Text>
                    </Box>
                  ) : null}
                </>
              ) : (
                <>
                  {labelElement}
                  {suggestion.description ? (
                    <Box flexGrow={1} marginLeft={1}>
                      <Text color={textColor} wrap="wrap">
                        {suggestion.description}
                      </Text>
                    </Box>
                  ) : null}
                </>
              )}
              {isActive && isLong && (
                <Box marginLeft={1}>
                  <Text color={Colors.Gray}>{isExpanded ? ' ← ' : ' → '}</Text>
                </Box>
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
