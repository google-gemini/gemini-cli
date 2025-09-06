/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { theme as semanticTheme } from '../semantic-colors.js';
import { PrepareLabel } from './PrepareLabel.js';
import { isSlashCommand } from '../utils/commandUtils.js';
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
        <Text color={semanticTheme.text.secondary}>Loading suggestions...</Text>
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

  const isSlashCommandMode = isSlashCommand(userInput);
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
      {scrollOffset > 0 && <Text color={semanticTheme.text.primary}>▲</Text>}

      {visibleSuggestions.map((suggestion, index) => {
        const originalIndex = startIndex + index;
        const isActive = originalIndex === activeIndex;
        const textColor = isActive
          ? semanticTheme.text.accent
          : semanticTheme.text.secondary;
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
            </Box>
          </Box>
        );
      })}
      {endIndex < suggestions.length && (
        <Text color={semanticTheme.text.secondary}>▼</Text>
      )}
      {suggestions.length > MAX_SUGGESTIONS_TO_SHOW && (
        <Text color={semanticTheme.text.secondary}>
          ({activeIndex + 1}/{suggestions.length})
        </Text>
      )}
    </Box>
  );
}
