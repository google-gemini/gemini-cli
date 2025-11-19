/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { ThemedGradient } from './ThemedGradient.js';
import { theme } from '../semantic-colors.js';
import type { ReactNode } from 'react';

export function getFormattedBannerContent(
  rawText: string,
  isWarning: boolean,
  subsequentLineColor: string,
): ReactNode {
  if (isWarning) {
    return (
      <Text color={theme.status.warning}>{rawText.replace(/\\n/g, '\n')}</Text>
    );
  }

  const text = rawText.replace(/\\n/g, '\n');
  const lines = text.split('\n');

  return lines.map((line, index) => {
    if (index === 0) {
      return (
        <ThemedGradient key={index}>
          <Text>{line}</Text>
        </ThemedGradient>
      );
    }

    return (
      <Text key={index} color={subsequentLineColor}>
        {line}
      </Text>
    );
  });
}

interface BannerProps {
  bannerText: React.ReactNode;
  color: string;
  width: number;
}

export const Banner = ({ bannerText, color, width }: BannerProps) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor={color}
    width={width}
    paddingLeft={1}
    paddingRight={1}
  >
    {bannerText}
  </Box>
);
