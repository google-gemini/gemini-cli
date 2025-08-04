/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { Colors } from '../colors.js';

const MAX_WIDTH = 150; // Maximum width for the text that is shown

export interface PrepareLabelProps {
  label: string;
  matchedIndex?: number;
  userInput: string;
  textColor: string;
  highlightColor?: string;
}

const _PrepareLabel: React.FC<PrepareLabelProps> = ({
  label,
  matchedIndex,
  userInput,
  textColor,
  highlightColor = Colors.AccentYellow,
}) => {
  if (
    matchedIndex === undefined ||
    matchedIndex < 0 ||
    matchedIndex >= label.length ||
    userInput.length === 0
  ) {
    const truncatedLabel =
      label.length > MAX_WIDTH ? label.slice(0, MAX_WIDTH) + '...' : label;
    return <Text color={textColor}>{truncatedLabel}</Text>;
  }

  const matchLength = userInput.length;
  const start = label.slice(
    Math.max(0, matchedIndex - 60 - matchLength),
    matchedIndex,
  );
  const match = label.slice(matchedIndex, matchedIndex + matchLength);
  const end = label.slice(
    matchedIndex + matchLength,
    Math.min(label.length, matchedIndex + matchLength + 60),
  );

  return (
    <Text>
      <Text color={textColor}>{start}</Text>
      <Text color="black" bold backgroundColor={highlightColor}>
        {match}
      </Text>
      <Text color={textColor}>{end}</Text>
    </Text>
  );
};

export const PrepareLabel = React.memo(_PrepareLabel);
