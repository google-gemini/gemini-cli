/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme as semanticTheme } from '../semantic-colors.js';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';

interface AboutBoxProps {
  cliVersion: string;
  osVersion: string;
  sandboxEnv: string;
  modelVersion: string;
  selectedAuthType: string;
  gcpProject: string;
  ideClient: string;
}

export const AboutBox: React.FC<AboutBoxProps> = ({
  cliVersion,
  osVersion,
  sandboxEnv,
  modelVersion,
  selectedAuthType,
  gcpProject,
  ideClient,
}) => (
  <Box
    borderStyle="round"
    borderColor={semanticTheme.border.default}
    flexDirection="column"
    padding={1}
    marginY={1}
    width="100%"
  >
    <Box marginBottom={1}>
      <Text bold color={semanticTheme.text.accent}>
        About Gemini CLI
      </Text>
    </Box>
    <Box flexDirection="row">
      <Box width="35%">
        <Text bold color={semanticTheme.text.link}>
          CLI Version
        </Text>
      </Box>
      <Box>
        <Text color={semanticTheme.text.primary}>{cliVersion}</Text>
      </Box>
    </Box>
    {GIT_COMMIT_INFO && !['N/A'].includes(GIT_COMMIT_INFO) && (
      <Box flexDirection="row">
        <Box width="35%">
          <Text bold color={semanticTheme.text.link}>
            Git Commit
          </Text>
        </Box>
        <Box>
          <Text color={semanticTheme.text.primary}>{GIT_COMMIT_INFO}</Text>
        </Box>
      </Box>
    )}
    <Box flexDirection="row">
      <Box width="35%">
        <Text bold color={semanticTheme.text.link}>
          Model
        </Text>
      </Box>
      <Box>
        <Text color={semanticTheme.text.primary}>{modelVersion}</Text>
      </Box>
    </Box>
    <Box flexDirection="row">
      <Box width="35%">
        <Text bold color={semanticTheme.text.link}>
          Sandbox
        </Text>
      </Box>
      <Box>
        <Text color={semanticTheme.text.primary}>{sandboxEnv}</Text>
      </Box>
    </Box>
    <Box flexDirection="row">
      <Box width="35%">
        <Text bold color={semanticTheme.text.link}>
          OS
        </Text>
      </Box>
      <Box>
        <Text color={semanticTheme.text.primary}>{osVersion}</Text>
      </Box>
    </Box>
    <Box flexDirection="row">
      <Box width="35%">
        <Text bold color={semanticTheme.text.link}>
          Auth Method
        </Text>
      </Box>
      <Box>
        <Text color={semanticTheme.text.primary}>
          {selectedAuthType.startsWith('oauth') ? 'OAuth' : selectedAuthType}
        </Text>
      </Box>
    </Box>
    {gcpProject && (
      <Box flexDirection="row">
        <Box width="35%">
          <Text bold color={semanticTheme.text.link}>
            GCP Project
          </Text>
        </Box>
        <Box>
          <Text color={semanticTheme.text.primary}>{gcpProject}</Text>
        </Box>
      </Box>
    )}
    {ideClient && (
      <Box flexDirection="row">
        <Box width="35%">
          <Text bold color={semanticTheme.text.link}>
            IDE Client
          </Text>
        </Box>
        <Box>
          <Text color={semanticTheme.text.primary}>{ideClient}</Text>
        </Box>
      </Box>
    )}
  </Box>
);
