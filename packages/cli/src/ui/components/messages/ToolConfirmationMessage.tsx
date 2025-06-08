/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { DiffRenderer } from './DiffRenderer.js';
import { Colors } from '../../colors.js';
import {
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolExecuteConfirmationDetails,
  ToolMcpConfirmationDetails,
  checkHasEditor,
  Config,
} from '@gemini-cli/core';
import {
  RadioButtonSelect,
  RadioSelectItem,
} from '../shared/RadioButtonSelect.js';

export interface ToolConfirmationMessageProps {
  confirmationDetails: ToolCallConfirmationDetails;
  config?: Config;
}

export const ToolConfirmationMessage: React.FC<
  ToolConfirmationMessageProps
> = ({ confirmationDetails, config }) => {
  const { onConfirm } = confirmationDetails;

  useInput((_, key) => {
    if (key.escape) {
      onConfirm(ToolConfirmationOutcome.Cancel);
    }
  });

  const handleSelect = (item: ToolConfirmationOutcome) => onConfirm(item);

  let bodyContent: React.ReactNode | null = null; // Removed contextDisplay here
  let question: string;

  const options: Array<RadioSelectItem<ToolConfirmationOutcome>> = new Array<
    RadioSelectItem<ToolConfirmationOutcome>
  >();

  if (confirmationDetails.type === 'edit') {
    if (confirmationDetails.isModifying) {
      return (
        <Box
          minWidth="90%"
          borderStyle="round"
          borderColor={Colors.Gray}
          justifyContent="space-around"
          padding={1}
          overflow="hidden"
        >
          <Text>Modify in progress: </Text>
          <Text color={Colors.AccentGreen}>
            Save and close external editor to continue
          </Text>
        </Box>
      );
    }

    // Body content is now the DiffRenderer, passing filename to it
    // The bordered box is removed from here and handled within DiffRenderer
    bodyContent = (
      <DiffRenderer
        diffContent={confirmationDetails.fileDiff}
        filename={confirmationDetails.fileName}
      />
    );

    question = `Apply this change?`;
    options.push(
      {
        label: 'Yes, allow once',
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: 'Yes, allow always',
        value: ToolConfirmationOutcome.ProceedAlways,
      },
    );

    // Conditionally add editor options if editors are installed
    const notUsingSandbox = !process.env.SANDBOX;
    const externalEditorsEnabled =
      config?.getEnableModifyWithExternalEditors() ?? false;

    if (checkHasEditor('vscode') && notUsingSandbox && externalEditorsEnabled) {
      options.push({
        label: 'Modify with VS Code',
        value: ToolConfirmationOutcome.ModifyVSCode,
      });
    }

    if (checkHasEditor('vim') && externalEditorsEnabled) {
      options.push({
        label: 'Modify with vim',
        value: ToolConfirmationOutcome.ModifyVim,
      });
    }

    options.push({ label: 'No (esc)', value: ToolConfirmationOutcome.Cancel });
  } else if (confirmationDetails.type === 'exec') {
    const executionProps =
      confirmationDetails as ToolExecuteConfirmationDetails;

    bodyContent = (
      <Box flexDirection="column">
        <Box paddingX={1} marginLeft={1}>
          <Text color={Colors.AccentCyan}>{executionProps.command}</Text>
        </Box>
      </Box>
    );

    question = `Allow execution?`;
    options.push(
      {
        label: 'Yes, allow once',
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: `Yes, allow always "${executionProps.rootCommand} ..."`,
        value: ToolConfirmationOutcome.ProceedAlways,
      },
      { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel },
    );
  } else {
    // mcp tool confirmation
    const mcpProps = confirmationDetails as ToolMcpConfirmationDetails;

    bodyContent = (
      <Box flexDirection="column" paddingX={1} marginLeft={1}>
        <Text color={Colors.AccentCyan}>MCP Server: {mcpProps.serverName}</Text>
        <Text color={Colors.AccentCyan}>Tool: {mcpProps.toolName}</Text>
      </Box>
    );

    question = `Allow execution of MCP tool "${mcpProps.toolName}" from server "${mcpProps.serverName}"?`;
    options.push(
      {
        label: 'Yes, allow once',
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: `Yes, always allow tool "${mcpProps.toolName}" from server "${mcpProps.serverName}"`,
        value: ToolConfirmationOutcome.ProceedAlwaysTool, // Cast until types are updated
      },
      {
        label: `Yes, always allow all tools from server "${mcpProps.serverName}"`,
        value: ToolConfirmationOutcome.ProceedAlwaysServer,
      },
      { label: 'No (esc)', value: ToolConfirmationOutcome.Cancel },
    );
  }

  return (
    <Box flexDirection="column" padding={1} minWidth="90%">
      {/* Body Content (Diff Renderer or Command Info) */}
      {/* No separate context display here anymore for edits */}
      <Box flexGrow={1} flexShrink={1} overflow="hidden" marginBottom={1}>
        {bodyContent}
      </Box>

      {/* Confirmation Question */}
      <Box marginBottom={1} flexShrink={0}>
        <Text>{question}</Text>
      </Box>

      {/* Select Input for Options */}
      <Box flexShrink={0}>
        <RadioButtonSelect items={options} onSelect={handleSelect} />
      </Box>
    </Box>
  );
};
