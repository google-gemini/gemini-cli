/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text } from 'ink';
import { Colors } from '../colors.js';

const MAX_WIDTH = 150; // Maximum width for the text that is shown

export interface PrepareLabelProps {
  label: string;
  matchedIndex?: number;
  userInput: string;
  textColor: string;
  highlightColor?: string;
  isExpanded?: boolean;
}

const _PrepareLabel: React.FC<PrepareLabelProps> = ({
  label,
  matchedIndex,
  userInput,
  textColor,
  highlightColor = Colors.AccentYellow,
  isExpanded = false,
}) => {
  if (
    matchedIndex === undefined ||
    matchedIndex < 0 ||
    matchedIndex >= label.length ||
    userInput.length === 0
  ) {
    if (isExpanded) {
      return <Text color={textColor}>{label}</Text>;
    } else {
      const truncatedLabel =
        label.length > MAX_WIDTH ? label.slice(0, MAX_WIDTH) + '...' : label;
      return <Text color={textColor}>{truncatedLabel}</Text>;
    }
  }

  const matchLength = userInput.length;

  if (isExpanded) {
    const start = label.slice(0, matchedIndex);
    const match = label.slice(matchedIndex, matchedIndex + matchLength);
    const end = label.slice(matchedIndex + matchLength);

    return (
      <Text color={textColor}>
        {start}
        <Text color="black" bold backgroundColor={highlightColor}>
          {match}
        </Text>
        {end}
      </Text>
    );
  }

  const availableSpace = MAX_WIDTH - matchLength;
  const halfSpace = Math.floor(availableSpace / 2);
  let startPos = Math.max(0, matchedIndex - halfSpace);
  let endPos = Math.min(label.length, matchedIndex + matchLength + halfSpace);
  if (endPos - startPos < MAX_WIDTH && startPos > 0) {
    startPos = Math.max(0, endPos - MAX_WIDTH);
  }

  if (endPos - startPos < MAX_WIDTH && endPos < label.length) {
    endPos = Math.min(label.length, startPos + MAX_WIDTH);
  }

  const start = label.slice(startPos, matchedIndex);
  const match = label.slice(matchedIndex, matchedIndex + matchLength);
  const end = label.slice(matchedIndex + matchLength, endPos);

  return (
    <Text color={textColor}>
      {start}
      <Text color="black" bold backgroundColor={highlightColor}>
        {match}
      </Text>
      {end}
    </Text>
  );
};

export const PrepareLabel = React.memo(_PrepareLabel);
