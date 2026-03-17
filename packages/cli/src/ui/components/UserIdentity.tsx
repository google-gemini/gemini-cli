/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import {
  UserAccountManager,
  AuthType,
  type AgentLoopContext,
} from '@google/gemini-cli-core';
import { isUltraTier } from '../../utils/tierUtils.js';

interface UserIdentityProps {
  context: AgentLoopContext;
}

export const UserIdentity: React.FC<UserIdentityProps> = ({ context }) => {
  const authType = context.config.getContentGeneratorConfig()?.authType;
  const email = useMemo(() => {
    if (authType) {
      const userAccountManager = new UserAccountManager();
      return userAccountManager.getCachedGoogleAccount() ?? undefined;
    }
    return undefined;
  }, [authType]);

  const tierName = useMemo(
    () => (authType ? context.config.getUserTierName() : undefined),
    [context, authType],
  );

  const isUltra = useMemo(() => isUltraTier(tierName), [tierName]);

  if (!authType) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {/* User Email /auth */}
      <Box>
        <Text color={theme.text.primary} wrap="truncate-end">
          {authType === AuthType.LOGIN_WITH_GOOGLE ? (
            <Text>
              <Text bold>Signed in with Google{email ? ':' : ''}</Text>
              {email ? ` ${email}` : ''}
            </Text>
          ) : (
            `Authenticated with ${authType}`
          )}
        </Text>
        <Text color={theme.text.secondary}> /auth</Text>
      </Box>

      {/* Tier Name /upgrade */}
      {tierName && (
        <Box>
          <Text color={theme.text.primary} wrap="truncate-end">
            <Text bold>Plan:</Text> {tierName}
          </Text>
          {!isUltra && <Text color={theme.text.secondary}> /upgrade</Text>}
        </Box>
      )}
    </Box>
  );
};
