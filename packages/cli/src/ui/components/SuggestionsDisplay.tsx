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
  // Always render the container with a minimum height to prevent layout jumps.
  // The content inside will only be visible when showSuggestions is true.
  return (
    <Box
      flexDirection="column"
      paddingX={1}
      width={width}
      minHeight={MAX_SUGGESTIONS_TO_SHOW + 2}
    >
      <>
        {isLoading ? (
          <Text color="gray">Loading suggestions...</Text>
        ) : (
          <>
            {scrollOffset > 0 && <Text color={Colors.Foreground}>▲</Text>}
            {suggestions
              .slice(scrollOffset, scrollOffset + MAX_SUGGESTIONS_TO_SHOW)
              .map((suggestion, index) => {
                const originalIndex = scrollOffset + index;
                const isActive = originalIndex === activeIndex;
                const textColor = isActive ? Colors.AccentPurple : Colors.Gray;

                return (
                  <Box
                    key={`${suggestion.value}-${originalIndex}`}
                    width={width}
                  >
                    <Box flexDirection="row">
                      {userInput.startsWith('/') ? (
                        <Box width={20} flexShrink={0}>
                          <Text color={textColor}>{suggestion.label}</Text>
                        </Box>
                      ) : (
                        <Text color={textColor}>{suggestion.label}</Text>
                      )}
                      {suggestion.description && (
                        <Box flexGrow={1}>
                          <Text color={textColor} wrap="truncate">
                            {suggestion.description}
                          </Text>
                        </Box>
                      )}
                    </Box>
                  </Box>
                );
              })}
            {scrollOffset + MAX_SUGGESTIONS_TO_SHOW < suggestions.length && (
              <Text color="gray">▼</Text>
            )}
            {suggestions.length > MAX_SUGGESTIONS_TO_SHOW && (
              <Text color="gray">
                ({activeIndex + 1}/{suggestions.length})
              </Text>
            )}
          </>
        )}
      </>
    </Box>
  );
}
