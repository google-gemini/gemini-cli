/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { PrepareLabel } from './PrepareLabel.js';
import { CommandKind } from '../commands/types.js';
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
              {(() => {
                const isSlashCommand = userInput.startsWith('/');
                return (
                  <>
                    {isSlashCommand ? (
                      <Box flexShrink={0} paddingRight={2}>
                        {labelElement}
                        {suggestion.commandKind === CommandKind.MCP_PROMPT && (
                          <Text color={Colors.Gray}> [MCP]</Text>
                        )}
                      </Box>
                    ) : (
                      labelElement
                    )}
                    {suggestion.description && (
                      <Box
                        flexGrow={1}
                        paddingLeft={isSlashCommand ? undefined : 1}
                      >
                        <Text color={textColor} wrap="truncate">
                          {suggestion.description}
                        </Text>
                      </Box>
                    )}
                  </>
                );
              })()}
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
