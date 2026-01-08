/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';

interface WhoamiBoxProps {
  selectedAuthType: string;
  userEmail?: string;
}

export const WhoamiBox: React.FC<WhoamiBoxProps> = ({
  selectedAuthType,
  userEmail,
}) => (
  <Box
    borderStyle="round"
    borderColor={theme.border.default}
    flexDirection="column"
    padding={1}
    marginY={1}
    width="100%"
  >
    <Box marginBottom={1}>
      <Text bold color={theme.text.accent}>
        Current Identity
      </Text>
    </Box>
    <Box flexDirection="row">
      <Box width="35%">
        <Text bold color={theme.text.link}>
          Auth Method
        </Text>
      </Box>
      <Box>
        <Text color={theme.text.primary}>
          {selectedAuthType.startsWith('oauth') ? 'OAuth' : selectedAuthType}
        </Text>
      </Box>
    </Box>
    {userEmail && (
      <Box flexDirection="row">
        <Box width="35%">
          <Text bold color={theme.text.link}>
            User Email
          </Text>
        </Box>
        <Box>
          <Text color={theme.text.primary}>{userEmail}</Text>
        </Box>
      </Box>
    )}
  </Box>
);
