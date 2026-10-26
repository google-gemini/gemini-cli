/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { theme } from '../../semantic-colors.js';

export const MAX_WIDTH = 150;

export interface ExpandableTextProps {
  label: string;
  matchedIndex?: number;
  userInput?: string;
  textColor?: string;
  isExpanded?: boolean;
  maxWidth?: number;
  maxLines?: number;
}

const _ExpandableText: React.FC<ExpandableTextProps> = ({
  label,
  matchedIndex,
  userInput = '',
  textColor = theme.text.primary,
  isExpanded = false,
  maxWidth = MAX_WIDTH,
  maxLines,
}) => {
  const labelCharacters = Array.from(label);
  const hasMatch =
    matchedIndex !== undefined &&
    matchedIndex >= 0 &&
    matchedIndex < label.length &&
    userInput.length > 0;

  // Render the plain label if there's no match
  if (!hasMatch) {
    let display = label;

    if (!isExpanded) {
      if (maxLines !== undefined) {
        const lines = label.split('\n');
        // 1. Truncate by logical lines
        let truncated = lines.slice(0, maxLines).join('\n');
        const hasMoreLines = lines.length > maxLines;
        const truncatedCharacters = Array.from(truncated);

        // 2. Truncate by characters (visual approximation) to prevent massive wrapping
        if (truncatedCharacters.length > maxWidth) {
          truncated = truncatedCharacters.slice(0, maxWidth).join('') + '...';
        } else if (hasMoreLines) {
          truncated += '...';
        }
        display = truncated;
      } else if (labelCharacters.length > maxWidth) {
        display = labelCharacters.slice(0, maxWidth).join('') + '...';
      }
    }

    return (
      <Text wrap="wrap" color={textColor}>
        {display}
      </Text>
    );
  }

  const matchCharactersLength = Array.from(userInput).length;
  let matchedCharacterIndex = 0;
  let matchedUtf16Index = 0;
  while (
    matchedCharacterIndex < labelCharacters.length &&
    matchedUtf16Index < matchedIndex
  ) {
    matchedUtf16Index += labelCharacters[matchedCharacterIndex].length;
    matchedCharacterIndex += 1;
  }
  let before = '';
  let match = '';
  let after = '';

  // Case 1: Show the full string if it's expanded or already fits
  if (isExpanded || labelCharacters.length <= maxWidth) {
    before = labelCharacters.slice(0, matchedCharacterIndex).join('');
    match = labelCharacters
      .slice(
        matchedCharacterIndex,
        matchedCharacterIndex + matchCharactersLength,
      )
      .join('');
    after = labelCharacters
      .slice(matchedCharacterIndex + matchCharactersLength)
      .join('');
  }
  // Case 2: The match itself is too long, so we only show a truncated portion of the match
  else if (matchCharactersLength >= maxWidth) {
    match =
      labelCharacters
        .slice(matchedCharacterIndex, matchedCharacterIndex + maxWidth - 1)
        .join('') + '...';
  }
  // Case 3: Truncate the string to create a window around the match
  else {
    const contextSpace = maxWidth - matchCharactersLength;
    const beforeSpace = Math.floor(contextSpace / 2);
    const afterSpace = Math.ceil(contextSpace / 2);

    let start = matchedCharacterIndex - beforeSpace;
    let end = matchedCharacterIndex + matchCharactersLength + afterSpace;

    if (start < 0) {
      end += -start; // Slide window right
      start = 0;
    }
    if (end > labelCharacters.length) {
      start -= end - labelCharacters.length; // Slide window left
      end = labelCharacters.length;
    }
    start = Math.max(0, start);

    const finalMatchIndex = matchedCharacterIndex - start;
    const slicedLabel = labelCharacters.slice(start, end);

    before = slicedLabel.slice(0, finalMatchIndex).join('');
    match = slicedLabel
      .slice(finalMatchIndex, finalMatchIndex + matchCharactersLength)
      .join('');
    after = slicedLabel.slice(finalMatchIndex + matchCharactersLength).join('');

    if (start > 0) {
      const beforeCharacters = Array.from(before);
      before =
        beforeCharacters.length >= 3
          ? '...' + beforeCharacters.slice(3).join('')
          : '...';
    }
    if (end < labelCharacters.length) {
      const afterCharacters = Array.from(after);
      after =
        afterCharacters.length >= 3
          ? afterCharacters.slice(0, -3).join('') + '...'
          : '...';
    }
  }

  return (
    <Text color={textColor} wrap="wrap">
      {before}
      {match
        ? match.split(/(\s+)/).map((part, index) => (
            <Text key={`match-${index}`} inverse color={textColor}>
              {part}
            </Text>
          ))
        : null}
      {after}
    </Text>
  );
};

export const ExpandableText = React.memo(_ExpandableText);
