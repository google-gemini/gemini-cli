/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';

interface SuggestionsDisplayProps {
  suggestions: string[];
  activeIndex: number;
  isLoading: boolean;
  width: number;
  scrollOffset: number;
}

export const MAX_SUGGESTIONS_TO_SHOW = 8;

export function SuggestionsDisplay({
  suggestions,
  activeIndex,
  isLoading,
  width,
  scrollOffset,
}: SuggestionsDisplayProps) {
  if (isLoading) {
    return (
      <Box borderStyle="round" paddingX={1} width={width}>
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
    <Box
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
      width={width} // Use the passed width
    >
      {scrollOffset > 0 && <Text color="gray">▲</Text>}

      {visibleSuggestions.map((suggestion, index) => {
        const originalIndex = startIndex + index;
        const isActive = originalIndex === activeIndex;
        return (
          <Text
            key={`${suggestion}-${originalIndex}`}
            color={isActive ? 'black' : 'white'}
            backgroundColor={isActive ? 'blue' : undefined}
          >
            {suggestion}
          </Text>
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
