/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import { theme } from '../semantic-colors.js';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';

interface AboutBoxProps {
  cliVersion: string;
  osVersion: string;
  sandboxEnv: string;
  modelVersion: string;
  selectedAuthType: string;
  gcpProject: string;
  ideClient: string;
  userEmail?: string;
  tier?: string;
}

export const AboutBox: React.FC<AboutBoxProps> = ({
  cliVersion,
  osVersion,
  sandboxEnv,
  modelVersion,
  selectedAuthType,
  gcpProject,
  ideClient,
  userEmail,
  tier,
}) => {
  const { t } = useTranslation('ui');
  return (
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
          {t('about.title')}
        </Text>
      </Box>
      <Box flexDirection="row">
        <Box width="35%">
          <Text bold color={theme.text.link}>
            {t('about.cliVersion')}
          </Text>
        </Box>
        <Box>
          <Text color={theme.text.primary}>{cliVersion}</Text>
        </Box>
      </Box>
      {GIT_COMMIT_INFO && !['N/A'].includes(GIT_COMMIT_INFO) && (
        <Box flexDirection="row">
          <Box width="35%">
            <Text bold color={theme.text.link}>
              {t('about.gitCommit')}
            </Text>
          </Box>
          <Box>
            <Text color={theme.text.primary}>{GIT_COMMIT_INFO}</Text>
          </Box>
        </Box>
      )}
      <Box flexDirection="row">
        <Box width="35%">
          <Text bold color={theme.text.link}>
            {t('about.model')}
          </Text>
        </Box>
        <Box>
          <Text color={theme.text.primary}>{modelVersion}</Text>
        </Box>
      </Box>
      <Box flexDirection="row">
        <Box width="35%">
          <Text bold color={theme.text.link}>
            {t('about.sandbox')}
          </Text>
        </Box>
        <Box>
          <Text color={theme.text.primary}>{sandboxEnv}</Text>
        </Box>
      </Box>
      <Box flexDirection="row">
        <Box width="35%">
          <Text bold color={theme.text.link}>
            {t('about.os')}
          </Text>
        </Box>
        <Box>
          <Text color={theme.text.primary}>{osVersion}</Text>
        </Box>
      </Box>
      <Box flexDirection="row">
        <Box width="35%">
          <Text bold color={theme.text.link}>
            {t('about.authMethod')}
          </Text>
        </Box>
        <Box>
          <Text color={theme.text.primary}>
            {selectedAuthType.startsWith('oauth')
              ? userEmail
                ? t('about.loggedInWithGoogleEmail', { email: userEmail })
                : t('about.loggedInWithGoogle')
              : selectedAuthType}
          </Text>
        </Box>
      </Box>
      {tier && (
        <Box flexDirection="row">
          <Box width="35%">
            <Text bold color={theme.text.link}>
              {t('about.tier')}
            </Text>
          </Box>
          <Box>
            <Text color={theme.text.primary}>{tier}</Text>
          </Box>
        </Box>
      )}
      {gcpProject && (
        <Box flexDirection="row">
          <Box width="35%">
            <Text bold color={theme.text.link}>
              {t('about.gcpProject')}
            </Text>
          </Box>
          <Box>
            <Text color={theme.text.primary}>{gcpProject}</Text>
          </Box>
        </Box>
      )}
      {ideClient && (
        <Box flexDirection="row">
          <Box width="35%">
            <Text bold color={theme.text.link}>
              {t('about.ideClient')}
            </Text>
          </Box>
          <Box>
            <Text color={theme.text.primary}>{ideClient}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
