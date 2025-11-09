/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { theme } from '../semantic-colors.js';

interface WelcomeMessageProps {
  userName: string;
  userEmail: string;
  userTierName: string;
}

export const WelcomeMessage: React.FC<WelcomeMessageProps> = ({
  userName,
  userEmail,
  userTierName,
}) => (
  <Box
    borderStyle="round"
    borderColor={theme.border.default}
    flexDirection="column"
    padding={1}
    marginY={1}
    width="100%"
  >
    <Text>
      Welcome{' '}
      {theme.ui.gradient && theme.ui.gradient.length > 0 ? (
        <Gradient colors={theme.ui.gradient}>
          <Text bold>{userName}</Text>{' '}
        </Gradient>
      ) : (
        <Text bold>{userName}</Text>
      )}
      (<Text>{userEmail}</Text>)!
    </Text>
    <Text>
      You are signed in using your{' '}
      <Text bold color={theme.text.accent}>
        {userTierName}
      </Text>{' '}
      license.
    </Text>
  </Box>
);
