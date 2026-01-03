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
  title: string,
  body: string,
  isWarning: boolean,
  subsequentLineColor: string,
): ReactNode {
  // Unescape newlines
  const formattedTitle = title.replace(/\\n/g, '\n');
  const formattedBody = body.replace(/\\n/g, '\n');

  if (isWarning) {
    return (
      <Text color={theme.status.warning}>
        {formattedTitle}
        {formattedBody ? '\n' + formattedBody : ''}
      </Text>
    );
  }

  return (
    <>
      <ThemedGradient>
        <Text>{formattedTitle}</Text>
      </ThemedGradient>
      {formattedBody ? (
        <Text color={subsequentLineColor}>{formattedBody}</Text>
      ) : null}
    </>
  );
}

interface BannerProps {
  title: string;
  body: string;
  isWarning: boolean;
  width: number;
}

export const Banner = ({ title, body, isWarning, width }: BannerProps) => {
  const subsequentLineColor = theme.text.primary;

  const formattedBannerContent = getFormattedBannerContent(
    title,
    body,
    isWarning,
    subsequentLineColor,
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isWarning ? theme.status.warning : theme.border.default}
      width={width}
      paddingLeft={1}
      paddingRight={1}
    >
      {formattedBannerContent}
    </Box>
  );
};
