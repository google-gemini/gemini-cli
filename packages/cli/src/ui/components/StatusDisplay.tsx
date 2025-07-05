/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { Colors } from '../colors.js';
import { StatusInfo } from '../hooks/useStatusCheck.js';
import { ApprovalMode } from '@google/gemini-cli-core';
import { formatMemoryUsage } from '../utils/formatters.js';

interface StatusDisplayProps {
  statusInfo: StatusInfo;
}

const LABEL_WIDTH = 22;

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Box marginTop={1}>
    <Text bold color={Colors.LightBlue}>
      {children}
    </Text>
  </Box>
);

const StatusRow = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <Box>
    <Box width={LABEL_WIDTH}>
      <Text>- {label}:</Text>
    </Box>
    <Box flexGrow={1}>
      <Text>{children}</Text>
    </Box>
  </Box>
);

/**
 * A pure UI component to display detailed CLI status information.
 * The order of sections is optimized for troubleshooting.
 */
export const StatusDisplay = ({ statusInfo }: StatusDisplayProps) => {
  const {
    cliVersion,
    osPlatform,
    model,
    connectivity,
    error,
    projectRoot,
    targetDirectory,
    settingsFiles,
    contextFiles,
    userMemorySize,
    mcpServerCount,
    authType,
    debugMode,
    approvalMode,
    checkpointing,
  } = statusInfo;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Box>
        <Text bold color={Colors.AccentPurple}>
          Gemini CLI Status
        </Text>
      </Box>

      <SectionTitle>Connectivity</SectionTitle>
      <StatusRow label="API Status">
        {connectivity === 'pending' && (
          <Text>
            <Spinner /> Testing...
          </Text>
        )}
        {connectivity === 'success' && (
          <Text color={Colors.AccentGreen}>✅ Reachable</Text>
        )}
        {connectivity === 'error' && (
          <Text color={Colors.AccentRed}>❌ Unreachable</Text>
        )}
      </StatusRow>
      {connectivity === 'error' && (
        <StatusRow label="Error Details">
          <Text color={Colors.AccentRed}>{error}</Text>
        </StatusRow>
      )}

      <SectionTitle>Active Configuration</SectionTitle>
      <StatusRow label="Authentication">{authType}</StatusRow>
      <StatusRow label="Model">{model}</StatusRow>
      <StatusRow label="Project Root">{projectRoot}</StatusRow>
      <StatusRow label="Target Directory">{targetDirectory}</StatusRow>

      <SectionTitle>Context & Memory</SectionTitle>
      <StatusRow label="Context Files">
        {contextFiles.length > 0 ? contextFiles.join(', ') : 'None'}
      </StatusRow>
      <StatusRow label="User Memory Size">
        {formatMemoryUsage(userMemorySize)}
      </StatusRow>
      <StatusRow label="MCP Servers">{mcpServerCount}</StatusRow>

      <SectionTitle>Key Settings</SectionTitle>
      <StatusRow label="Debug Mode">
        {debugMode ? (
          <Text color={Colors.AccentYellow}>Enabled</Text>
        ) : (
          'Disabled'
        )}
      </StatusRow>
      <StatusRow label="Tool Approval">
        {approvalMode === ApprovalMode.YOLO ? (
          <Text color={Colors.AccentRed}>Auto-Accept (YOLO)</Text>
        ) : approvalMode === ApprovalMode.AUTO_EDIT ? (
          <Text color={Colors.AccentYellow}>Auto-Edit</Text>
        ) : (
          'Manual'
        )}
      </StatusRow>
      <StatusRow label="Checkpointing">
        {checkpointing ? (
          <Text color={Colors.AccentGreen}>Enabled</Text>
        ) : (
          'Disabled'
        )}
      </StatusRow>

      <SectionTitle>General Info</SectionTitle>
      <StatusRow label="CLI Version">{cliVersion}</StatusRow>
      <StatusRow label="Operating System">{osPlatform}</StatusRow>
      <StatusRow label="Settings Files">
        {settingsFiles.length > 0 ? settingsFiles.join(', ') : 'None loaded'}
      </StatusRow>
    </Box>
  );
};
