/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import {
  IDEConnectionStatus,
  IdeClient,
  ideContextStore,
  type File,
} from '@google/gemini-cli-core';
import path from 'node:path';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';

function formatFileList(openFiles: File[]): string {
  const basenameCounts = new Map<string, number>();
  for (const file of openFiles) {
    const basename = path.basename(file.path);
    basenameCounts.set(basename, (basenameCounts.get(basename) || 0) + 1);
  }

  const fileList = openFiles
    .map((file: File) => {
      const basename = path.basename(file.path);
      const isDuplicate = (basenameCounts.get(basename) || 0) > 1;
      const parentDir = path.basename(path.dirname(file.path));
      const displayName = isDuplicate
        ? `${basename} (/${parentDir})`
        : basename;

      return `  - ${displayName}${file.isActive ? ' (active)' : ''}`;
    })
    .join('\n');

  const infoMessage = `

(Note: The file list is limited to a number of recently accessed files within your workspace and only includes local files on disk)`;

  return `\n\nOpen files:\n${fileList}${infoMessage}`;
}

function getDetailedIdeStatus(
  ideClient: IdeClient,
  showFileList: boolean = false,
): {
  statusIcon: string;
  statusText: string;
  details: string;
  messageType: 'info' | 'error';
} {
  const connection = ideClient.getConnectionStatus();
  switch (connection.status) {
    case IDEConnectionStatus.Connected: {
      let details = `Connected to ${ideClient.getDetectedIdeDisplayName()}.`;
      if (showFileList) {
        const context = ideContextStore.get();
        const openFiles = context?.workspaceState?.openFiles;
        if (openFiles && openFiles.length > 0) {
          details += formatFileList(openFiles);
        }
      }
      return {
        statusIcon: '🟢',
        statusText: 'Connected',
        details,
        messageType: 'info',
      };
    }
    case IDEConnectionStatus.Connecting:
      return {
        statusIcon: '🟡',
        statusText: 'Connecting',
        details: 'Attempting to connect to IDE companion extension...',
        messageType: 'info',
      };
    default: {
      const details = connection?.details
        ? connection.details
        : `IDE companion extension is not connected.`;
      return {
        statusIcon: '🔴',
        statusText: 'Disconnected',
        details,
        messageType: 'error',
      };
    }
  }
}

interface IdeIntegrationDialogProps {
  onAction: (action: string) => void;
  onExit: () => void;
}

export function IdeIntegrationDialog({
  onAction,
  onExit,
}: IdeIntegrationDialogProps): React.JSX.Element {
  const [ideClient, setIdeClient] = useState<IdeClient | null>(null);

  useEffect(() => {
    IdeClient.getInstance().then(setIdeClient);
  }, []);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onExit();
      }
    },
    { isActive: true },
  );

  if (!ideClient) {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border.default}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Text>Loading...</Text>
      </Box>
    );
  }

  const { status } = ideClient.getConnectionStatus();
  const { statusIcon, statusText, details, messageType } = getDetailedIdeStatus(
    ideClient,
    false,
  );

  // Determine available actions based on status
  const availableActions: Array<{
    label: string;
    value: string;
    disabled?: boolean;
  }> = [];

  switch (status) {
    case IDEConnectionStatus.Connected:
      availableActions.push(
        { label: 'Status', value: 'status' },
        { label: 'Disable integration', value: 'disable' },
      );
      break;
    case IDEConnectionStatus.Connecting:
      availableActions.push({ label: 'Status', value: 'status' });
      break;
    default:
      // When disconnected, always show both enable and install options
      availableActions.push(
        { label: 'Status', value: 'status' },
        { label: 'Enable integration', value: 'enable' },
        { label: 'Install companion extension', value: 'install' },
      );
      break;
  }

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={theme.text.primary}>
        IDE Integration Management
      </Text>

      <Box marginTop={1} marginBottom={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text>
            <Text
              color={
                messageType === 'error'
                  ? theme.status.error
                  : theme.text.primary
              }
            >
              {statusIcon} {statusText}
            </Text>
          </Text>
        </Box>
        <Box>
          <Text color={theme.text.secondary}>
            {details.split('\n').map((line, index) => (
              <Text key={index}>
                {line}
                {index < details.split('\n').length - 1 ? '\n' : ''}
              </Text>
            ))}
          </Text>
        </Box>
      </Box>

      {availableActions.length > 0 && (
        <>
          <Box marginBottom={1}>
            <Text bold>Actions:</Text>
          </Box>

          <RadioButtonSelect
            items={availableActions}
            onSelect={onAction}
            isFocused={true}
          />
        </>
      )}

      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          {availableActions.length > 0
            ? '(Use Enter to select, Escape to exit)'
            : '(Press Escape to exit)'}
        </Text>
      </Box>
    </Box>
  );
}
