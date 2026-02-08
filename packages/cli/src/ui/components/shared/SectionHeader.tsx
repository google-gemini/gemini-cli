/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../semantic-colors.js';

export const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <Box width="100%" flexDirection="row" overflow="hidden">
    <Text color={theme.text.secondary} wrap="truncate-end">
      {`── ${title}`}
    </Text>
    <Box
      flexGrow={1}
      flexShrink={0}
      minWidth={2}
      marginLeft={1}
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderColor={theme.text.secondary}
    />
  </Box>
);
