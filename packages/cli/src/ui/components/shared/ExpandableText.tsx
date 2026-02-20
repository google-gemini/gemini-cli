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

        // 2. Truncate by characters (visual approximation) to prevent massive wrapping
        if (truncated.length > maxWidth) {
          truncated = truncated.slice(0, maxWidth) + '...';
        } else if (hasMoreLines) {
          truncated += '...';
        }
        display = truncated;
      } else if (label.length > maxWidth) {
        display = label.slice(0, maxWidth) + '...';
      }
    }

    return (
      <Text wrap="wrap" color={textColor}>
        {display}
      </Text>
    );
  }

  const matchLength = userInput.length;
  let before = '';
  let match = '';
  let after = '';

  // Case 1: Show the full string if it's expanded or already fits
  if (isExpanded || label.length <= maxWidth) {
    before = label.slice(0, matchedIndex);
    match = label.slice(matchedIndex, matchedIndex + matchLength);
    after = label.slice(matchedIndex + matchLength);
  }
  // Case 2: The match itself is too long, so we only show a truncated portion of the match
  else if (matchLength >= maxWidth) {
    match = label.slice(matchedIndex, matchedIndex + maxWidth - 1) + '...';
  }
  // Case 3: Truncate the string to create a window around the match
  else {
    const contextSpace = maxWidth - matchLength;
    const beforeSpace = Math.floor(contextSpace / 2);
    const afterSpace = Math.ceil(contextSpace / 2);

    let start = matchedIndex - beforeSpace;
    let end = matchedIndex + matchLength + afterSpace;

    if (start < 0) {
      end += -start; // Slide window right
      start = 0;
    }
    if (end > label.length) {
      start -= end - label.length; // Slide window left
      end = label.length;
    }
    start = Math.max(0, start);

    const finalMatchIndex = matchedIndex - start;
    const slicedLabel = label.slice(start, end);

    before = slicedLabel.slice(0, finalMatchIndex);
    match = slicedLabel.slice(finalMatchIndex, finalMatchIndex + matchLength);
    after = slicedLabel.slice(finalMatchIndex + matchLength);

    if (start > 0) {
      before = before.length >= 3 ? '...' + before.slice(3) : '...';
    }
    if (end < label.length) {
      after = after.length >= 3 ? after.slice(0, -3) + '...' : '...';
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
