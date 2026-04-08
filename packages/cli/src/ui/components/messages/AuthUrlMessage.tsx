/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';

interface AuthUrlMessageProps {
  heading: string;
  url: string;
  footerLines?: string[];
}

export const AuthUrlMessage: React.FC<AuthUrlMessageProps> = ({
  heading,
  url,
  footerLines = [],
}) => (
  <Box flexDirection="column" marginTop={1}>
    <Text wrap="wrap" color={theme.status.warning}>
      {heading}
    </Text>
    <Text>{''}</Text>
    <Text wrap="wrap" color={theme.text.primary}>
      {url}
    </Text>
    {footerLines.length > 0 && <Text>{''}</Text>}
    {footerLines.map((line, index) => (
      <Text wrap="wrap" key={index} color={theme.status.warning}>
        {line}
      </Text>
    ))}
  </Box>
);
