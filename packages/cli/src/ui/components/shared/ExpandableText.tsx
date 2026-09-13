/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { theme } from '../../semantic-colors.js';
import { cpLen, cpSlice, toCodePoints } from '../../utils/textUtils.js';

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

/**
 * Converts a UTF-16 code-unit index (e.g. one produced by String.indexOf)
 * into a code-point index, stepping back so the boundary never falls inside
 * a surrogate pair.
 */
const toCodePointIndex = (str: string, utf16Index: number): number => {
  const index =
    utf16Index > 0 &&
    utf16Index < str.length &&
    str.charCodeAt(utf16Index - 1) >= 0xd800 &&
    str.charCodeAt(utf16Index - 1) <= 0xdbff &&
    str.charCodeAt(utf16Index) >= 0xdc00 &&
    str.charCodeAt(utf16Index) <= 0xdfff
      ? utf16Index - 1
      : utf16Index;
  return toCodePoints(str.slice(0, index)).length;
};

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

        // 2. Truncate by code points so a surrogate pair is never split
        if (cpLen(truncated) > maxWidth) {
          truncated = cpSlice(truncated, 0, maxWidth) + '...';
        } else if (hasMoreLines) {
          truncated += '...';
        }
        display = truncated;
      } else if (cpLen(label) > maxWidth) {
        display = cpSlice(label, 0, maxWidth) + '...';
      }
    }

    return (
      <Text wrap="wrap" color={textColor}>
        {display}
      </Text>
    );
  }

  // All indexes below are code-point based so truncation never lands inside
  // a surrogate pair (matchedIndex itself is a UTF-16 index from indexOf).
  const totalCp = cpLen(label);
  const matchStartCp = toCodePointIndex(label, matchedIndex);
  const matchLengthCp = cpLen(userInput);
  let before = '';
  let match = '';
  let after = '';

  // Case 1: Show the full string if it's expanded or already fits
  if (isExpanded || totalCp <= maxWidth) {
    before = cpSlice(label, 0, matchStartCp);
    match = cpSlice(label, matchStartCp, matchStartCp + matchLengthCp);
    after = cpSlice(label, matchStartCp + matchLengthCp);
  }
  // Case 2: The match itself is too long, so we only show a truncated portion of the match
  else if (matchLengthCp >= maxWidth) {
    match = cpSlice(label, matchStartCp, matchStartCp + maxWidth - 1) + '...';
  }
  // Case 3: Truncate the string to create a window around the match
  else {
    const contextSpace = maxWidth - matchLengthCp;
    const beforeSpace = Math.floor(contextSpace / 2);
    const afterSpace = Math.ceil(contextSpace / 2);

    let start = matchStartCp - beforeSpace;
    let end = matchStartCp + matchLengthCp + afterSpace;

    if (start < 0) {
      end += -start; // Slide window right
      start = 0;
    }
    if (end > totalCp) {
      start -= end - totalCp; // Slide window left
      end = totalCp;
    }
    start = Math.max(0, start);

    const finalMatchIndex = matchStartCp - start;
    const slicedLabel = cpSlice(label, start, end);

    before = cpSlice(slicedLabel, 0, finalMatchIndex);
    match = cpSlice(
      slicedLabel,
      finalMatchIndex,
      finalMatchIndex + matchLengthCp,
    );
    after = cpSlice(slicedLabel, finalMatchIndex + matchLengthCp);

    if (start > 0) {
      before = cpLen(before) >= 3 ? '...' + cpSlice(before, 3) : '...';
    }
    if (end < totalCp) {
      after =
        cpLen(after) >= 3 ? cpSlice(after, 0, cpLen(after) - 3) + '...' : '...';
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
