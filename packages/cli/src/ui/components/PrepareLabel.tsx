/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { Colors } from '../colors.js';

interface PrepareLabelProps {
  label: string;
  matchedIndex?: number;
  userInput: string;
  textColor: string;
  highlightColor?: string;
}

export const PrepareLabel: React.FC<PrepareLabelProps> = ({
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
    return <Text color={textColor}>{label}</Text>;
  }

  const start = label.slice(0, matchedIndex);
  const match = label.slice(matchedIndex, matchedIndex + userInput.length);
  const end = label.slice(matchedIndex + userInput.length);

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
