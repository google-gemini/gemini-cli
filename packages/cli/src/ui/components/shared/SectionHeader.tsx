/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';

export const SectionHeader: React.FC<{ title: string; subtitle?: string }> = ({
  title,
  subtitle,
}) => (
  <Box width="100%" flexDirection="column" overflow="hidden">
    <Box
      width="100%"
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor={theme.text.secondary}
    />
    <Box flexDirection="row">
      <Text color={theme.text.primary} bold wrap="truncate-end">
        {title}
      </Text>
      {subtitle && (
        <Text color={theme.text.secondary} wrap="truncate-end">
          {subtitle}
        </Text>
      )}
    </Box>
  </Box>
);
