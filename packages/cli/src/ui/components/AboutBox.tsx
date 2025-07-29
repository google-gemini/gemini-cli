/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';

interface AboutBoxProps {
  cliVersion: string;
  osVersion: string;
  sandboxEnv: string;
  modelVersion: string;
  selectedAuthType: string;
  gcpProject: string;
}

export const AboutBox: React.FC<AboutBoxProps> = ({
  cliVersion,
  osVersion,
  sandboxEnv,
  modelVersion,
  selectedAuthType,
  gcpProject,
}) => (
  <Box
    borderStyle="round"
    borderColor={Colors.Gray}
    flexDirection="column"
    padding={1}
    marginY={1}
    width="100%"
  >
    <Box marginBottom={1}>
      <Text bold color={Colors.AccentPurple}>
        About Gemini CLI
      </Text>
    </Box>
    <Box flexDirection="row">
      <Box minWidth={15}>
        <Text bold color={Colors.LightBlue}>
          CLI Version
        </Text>
      </Box>
      <Box flexGrow={1}>
        <Text>{cliVersion}</Text>
      </Box>
    </Box>
    {GIT_COMMIT_INFO && !['N/A'].includes(GIT_COMMIT_INFO) && (
      <Box flexDirection="row">
        <Box minWidth={15}>
          <Text bold color={Colors.LightBlue}>
            Git Commit
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text>{GIT_COMMIT_INFO}</Text>
        </Box>
      </Box>
    )}
    <Box flexDirection="row">
      <Box minWidth={15}>
        <Text bold color={Colors.LightBlue}>
          Model
        </Text>
      </Box>
      <Box flexGrow={1}>
        <Text>{modelVersion}</Text>
      </Box>
    </Box>
    <Box flexDirection="row">
      <Box minWidth={15}>
        <Text bold color={Colors.LightBlue}>
          Sandbox
        </Text>
      </Box>
      <Box flexGrow={1}>
        <Text>{sandboxEnv}</Text>
      </Box>
    </Box>
    <Box flexDirection="row">
      <Box minWidth={15}>
        <Text bold color={Colors.LightBlue}>
          OS
        </Text>
      </Box>
      <Box flexGrow={1}>
        <Text>{osVersion}</Text>
      </Box>
    </Box>
    <Box flexDirection="row">
      <Box minWidth={15}>
        <Text bold color={Colors.LightBlue}>
          Auth Method
        </Text>
      </Box>
      <Box flexGrow={1}>
        <Text>
          {selectedAuthType.startsWith('oauth') ? 'OAuth' : selectedAuthType}
        </Text>
      </Box>
    </Box>
    {gcpProject && (
      <Box flexDirection="row">
        <Box minWidth={15}>
          <Text bold color={Colors.LightBlue}>
            GCP Project
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text>{gcpProject}</Text>
        </Box>
      </Box>
    )}
  </Box>
);
