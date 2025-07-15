/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../../colors.js';
import Link from 'ink-link';
import { InfoPart } from '../../types.js';

interface InfoMessageProps {
  parts: InfoPart[];
}

export const InfoMessage: React.FC<InfoMessageProps> = ({ parts }) => {
  const prefix = 'ℹ ';
  const prefixWidth = prefix.length;

  return (
    <Box flexDirection="row" marginTop={1}>
      <Box width={prefixWidth}>
        <Text color={Colors.AccentYellow}>{prefix}</Text>
      </Box>
      <Box flexGrow={1} flexWrap="wrap" flexDirection="row">
        <Text color={Colors.AccentYellow}>
          {parts.map((part, index) =>
            part.type === 'text' ? (
              <React.Fragment key={index}>{part.text}</React.Fragment>
            ) : (
              <Link key={index} url={part.value}>
                {part.value}
              </Link>
            ),
          )}
        </Text>
      </Box>
    </Box>
  );
};
