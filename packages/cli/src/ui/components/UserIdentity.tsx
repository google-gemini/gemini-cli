/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import {
  type Config,
  UserAccountManager,
  AuthType,
} from '@google/gemini-cli-core';

interface UserIdentityProps {
  config: Config;
}

export const UserIdentity: React.FC<UserIdentityProps> = ({ config }) => {
  const authType = config.getContentGeneratorConfig()?.authType;
  if (!authType) {
    return null;
  }

  const userAccountManager = new UserAccountManager();
  const email = userAccountManager.getCachedGoogleAccount();
  const tierName = config.getUserTierName();

  return (
    <Box marginY={1} flexDirection="column">
      <Box>
        <Text color={theme.text.primary}>
          {authType === AuthType.LOGIN_WITH_GOOGLE ? (
            <Text>
              <Text bold>Logged in with Google{email ? ':' : ''}</Text>
              {email ? ` ${email}` : ''}
            </Text>
          ) : (
            `Authenticated with ${authType}`
          )}
        </Text>
        <Text color={theme.text.secondary}> /auth</Text>
      </Box>
      {tierName && (
        <Text color={theme.text.primary}>
          <Text bold>Plan:</Text> {tierName}
        </Text>
      )}
    </Box>
  );
};
