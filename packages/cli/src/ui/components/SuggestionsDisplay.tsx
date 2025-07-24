/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
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

        // Helper to render label with matched part highlighted
        const renderLabel = () => {
          if (
            suggestion.matchedIndex !== undefined &&
            suggestion.matchedIndex >= 0 &&
            userInput.length > 0
          ) {
            const start = suggestion.label.slice(0, suggestion.matchedIndex);
            const match = suggestion.label.slice(
              suggestion.matchedIndex,
              suggestion.matchedIndex + userInput.length,
            );
            const end = suggestion.label.slice(
              suggestion.matchedIndex + userInput.length,
            );
            return (
              <Text>
                <Text color={textColor}>{start}</Text>
                <Text color="black" bold backgroundColor={Colors.AccentYellow}>
                  {match}
                </Text>
                <Text color={textColor}>{end}</Text>
              </Text>
            );
          }
          return <Text color={textColor}>{suggestion.label}</Text>;
        };
        return (
          <Box key={`${suggestion.value}-${originalIndex}`} width={width}>
            <Box flexDirection="row">
              {userInput.startsWith('/') ? (
                // only use box model for (/) command mode
                <Box width={20} flexShrink={0}>
                  {renderLabel()}
                </Box>
              ) : (
                // use regular text for other modes (@ context)
                renderLabel()
              )}
              {suggestion.description ? (
                <Box flexGrow={1}>
                  <Text color={textColor} wrap="wrap">
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
