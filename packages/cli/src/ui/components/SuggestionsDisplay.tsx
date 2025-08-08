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
}

export const MAX_SUGGESTIONS_TO_SHOW = 8;

export function SuggestionsDisplay({
  suggestions,
  activeIndex,
  isLoading,
  width,
  scrollOffset,
  userInput,
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

  return (
    <Box flexDirection="column" paddingX={1} width={width}>
      {scrollOffset > 0 && <Text color={Colors.Foreground}>▲</Text>}

      {visibleSuggestions.map((suggestion, index) => {
        const originalIndex = startIndex + index;
        const isActive = originalIndex === activeIndex;
        const textColor = isActive ? Colors.AccentPurple : Colors.Gray;
        const labelElement = (
          <PrepareLabel
            label={suggestion.label}
            matchedIndex={suggestion.matchedIndex}
            userInput={userInput}
            textColor={textColor}
          />
        );

        return (
          <Box key={`${suggestion.value}-${originalIndex}`} width={width}>
            <Box flexDirection="row">
              {userInput.startsWith('/') ? (
                // only use box model for (/) command mode
                <Box width={20} flexShrink={0}>
                  {labelElement}
                </Box>
              ) : (
                labelElement
              )}
              {suggestion.description ? (
                <Box flexGrow={1}>
                  <Text color={textColor} wrap="truncate">
                    {suggestion.description}
                  </Text>
                </Box>
              ) : null}
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
