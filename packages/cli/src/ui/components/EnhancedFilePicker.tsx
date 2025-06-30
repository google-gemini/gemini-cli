/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { useFileContext } from '../contexts/FileContextContext.js';
import { Suggestion } from './SuggestionsDisplay.js';

export interface EnhancedFileSuggestion extends Suggestion {
  filepath: string;
  size: number;
  estimatedTokens: number;
  isInContext: boolean;
}

interface EnhancedFilePickerProps {
  suggestions: EnhancedFileSuggestion[];
  activeIndex: number;
  isLoading: boolean;
  width: number;
  scrollOffset: number;
  _userInput: string;
}

export const MAX_SUGGESTIONS_TO_SHOW = 8;

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format token count in human-readable format
 */
function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`;
  return `${(tokens / 1000000).toFixed(1)}M`;
}

export function EnhancedFilePicker({
  suggestions,
  activeIndex,
  isLoading,
  width,
  scrollOffset,
  _userInput,
}: EnhancedFilePickerProps) {
  const { actions } = useFileContext();

  if (isLoading) {
    return (
      <Box paddingX={1} width={width}>
        <Text color="gray">Loading files...</Text>
      </Box>
    );
  }

  if (suggestions.length === 0) {
    return null;
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
      {/* Header */}
      <Box marginBottom={1}>
        <Text color={Colors.AccentBlue} bold>
          📁 Available Files:
        </Text>
      </Box>

      {scrollOffset > 0 && <Text color={Colors.Foreground}>▲</Text>}

      {visibleSuggestions.map((suggestion, index) => {
        const originalIndex = startIndex + index;
        const isActive = originalIndex === activeIndex;
        const textColor = isActive ? Colors.AccentPurple : Colors.Gray;

        return (
          <Box key={`${suggestion.filepath}-${originalIndex}`} width={width}>
            <Box flexDirection="row" alignItems="center">
              {/* Status indicator */}
              <Box width={12} flexShrink={0}>
                {suggestion.isInContext ? (
                  <Text color={Colors.AccentGreen}>✓ [Added]</Text>
                ) : (
                  <Text color={Colors.Gray}> [Available]</Text>
                )}
              </Box>

              {/* File name */}
              <Box flexGrow={1} marginRight={2}>
                <Text color={textColor}>{suggestion.label}</Text>
              </Box>

              {/* File size and token info */}
              <Box width={20} flexShrink={0}>
                <Text color={Colors.Gray}>
                  {formatFileSize(suggestion.size)} (
                  {formatTokenCount(suggestion.estimatedTokens)} tokens)
                </Text>
              </Box>
            </Box>
          </Box>
        );
      })}

      {endIndex < suggestions.length && <Text color="gray">▼</Text>}

      {/* Context status */}
      <Box marginTop={1} borderStyle="single" paddingX={1}>
        <Text color={Colors.AccentBlue}>
          Context: {actions.getContextStatus().files} files,{' '}
          {formatTokenCount(actions.getContextStatus().tokens)} tokens (
          {actions.getContextStatus().percentage}% of limit)
        </Text>
      </Box>

      {suggestions.length > MAX_SUGGESTIONS_TO_SHOW && (
        <Text color="gray">
          ({activeIndex + 1}/{suggestions.length})
        </Text>
      )}
    </Box>
  );
}
