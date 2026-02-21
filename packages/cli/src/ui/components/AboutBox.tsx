/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { getDisplayString } from '@google/gemini-cli-core';

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
  const settings = useSettings();
  const showUserIdentity = settings.merged.ui.showUserIdentity;

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
          About Gemini CLI
        </Text>
      </Box>
      <Box flexDirection="row">
        <Box width="35%">
          <Text bold color={theme.text.link}>
            CLI Version
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
              Git Commit
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
            Model
          </Text>
        </Box>
        <Box>
          <Text color={theme.text.primary}>
            {getDisplayString(modelVersion)}
          </Text>
        </Box>
      </Box>
      <Box flexDirection="row">
        <Box width="35%">
          <Text bold color={theme.text.link}>
            Sandbox
          </Text>
        </Box>
        <Box>
          <Text color={theme.text.primary}>{sandboxEnv}</Text>
        </Box>
      </Box>
      <Box flexDirection="row">
        <Box width="35%">
          <Text bold color={theme.text.link}>
            OS
          </Text>
        </Box>
        <Box>
          <Text color={theme.text.primary}>{osVersion}</Text>
        </Box>
      </Box>
      {showUserIdentity && (
        <Box flexDirection="row">
          <Box width="35%">
            <Text bold color={theme.text.link}>
              Auth Method
            </Text>
          </Box>
          <Box>
            <Text color={theme.text.primary}>
              {selectedAuthType.startsWith('oauth')
                ? userEmail
                  ? `Logged in with Google (${userEmail})`
                  : 'Logged in with Google'
                : selectedAuthType}
            </Text>
          </Box>
        </Box>
      )}
      {showUserIdentity && tier && (
        <Box flexDirection="row">
          <Box width="35%">
            <Text bold color={theme.text.link}>
              Tier
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
              GCP Project
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
              IDE Client
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
