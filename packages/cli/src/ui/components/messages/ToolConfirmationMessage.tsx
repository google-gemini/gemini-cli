/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { DiffRenderer } from './DiffRenderer.js';
import { RenderInline } from '../../utils/InlineMarkdownRenderer.js';
import type {
  ToolCallConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolMcpConfirmationDetails,
  Config,
} from '@google/gemini-cli-core';
import { IdeClient, ToolConfirmationOutcome } from '@google/gemini-cli-core';
import type { RadioSelectItem } from '../shared/RadioButtonSelect.js';
import { RadioButtonSelect } from '../shared/RadioButtonSelect.js';
import { MaxSizedBox } from '../shared/MaxSizedBox.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { theme } from '../../semantic-colors.js';

export interface ToolConfirmationMessageProps {
  confirmationDetails: ToolCallConfirmationDetails;
  config: Config;
  isFocused?: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

export const ToolConfirmationMessage: React.FC<
  ToolConfirmationMessageProps
> = ({
  confirmationDetails,
  config,
  isFocused = true,
  availableTerminalHeight,
  terminalWidth,
}) => {
  const { onConfirm } = confirmationDetails;
  const childWidth = terminalWidth - 2; // 2 for padding

  const [ideClient, setIdeClient] = useState<IdeClient | null>(null);
  const [isDiffingEnabled, setIsDiffingEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (config.getIdeMode()) {
      const getIdeClient = async () => {
        const client = await IdeClient.getInstance();
        if (isMounted) {
          setIdeClient(client);
          setIsDiffingEnabled(client?.isDiffingEnabled() ?? false);
        }
      };
      getIdeClient();
    }
    return () => {
      isMounted = false;
    };
  }, [config]);

  const handleConfirm = async (outcome: ToolConfirmationOutcome) => {
    if (confirmationDetails.type === 'edit') {
      if (config.getIdeMode() && isDiffingEnabled) {
        const cliOutcome =
          outcome === ToolConfirmationOutcome.Cancel ? 'rejected' : 'accepted';
        await ideClient?.resolveDiffFromCli(
          confirmationDetails.filePath,
          cliOutcome,
        );
      }
    }
    onConfirm(outcome);
  };

  const isTrustedFolder = config.isTrustedFolder();

  useKeypress(
    (key) => {
      if (!isFocused) return;
      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        handleConfirm(ToolConfirmationOutcome.Cancel);
      }
    },
    { isActive: isFocused },
  );

  const handleSelect = (item: ToolConfirmationOutcome) => handleConfirm(item);

  let bodyContent: React.ReactNode | null = null; // Removed contextDisplay here
  let question: string;

  const options: Array<RadioSelectItem<ToolConfirmationOutcome>> = new Array<
    RadioSelectItem<ToolConfirmationOutcome>
  >();

  // Body content is now the DiffRenderer, passing filename to it
  // The bordered box is removed from here and handled within DiffRenderer

  function availableBodyContentHeight() {
    if (options.length === 0) {
      // This should not happen in practice as options are always added before this is called.
      throw new Error('Options not provided for confirmation message');
    }

    if (availableTerminalHeight === undefined) {
      return undefined;
    }

    // Calculate the vertical space (in lines) consumed by UI elements
    // surrounding the main body content.
    const PADDING_OUTER_Y = 2; // Main container has `padding={1}` (top & bottom).
    const MARGIN_BODY_BOTTOM = 1; // margin on the body container.
    const HEIGHT_QUESTION = 1; // The question text is one line.
    const MARGIN_QUESTION_BOTTOM = 1; // Margin on the question container.
    const HEIGHT_OPTIONS = options.length; // Each option in the radio select takes one line.

    const surroundingElementsHeight =
      PADDING_OUTER_Y +
      MARGIN_BODY_BOTTOM +
      HEIGHT_QUESTION +
      MARGIN_QUESTION_BOTTOM +
      HEIGHT_OPTIONS;
    return Math.max(availableTerminalHeight - surroundingElementsHeight, 1);
  }

  if (confirmationDetails.type === 'edit') {
    if (confirmationDetails.isModifying) {
      return (
        <Box
          width={terminalWidth}
          borderStyle="round"
          borderColor={theme.border.default}
          justifyContent="space-around"
          padding={1}
          overflow="hidden"
        >
          <Text color={theme.text.primary}>Modify in progress: </Text>
          <Text color={theme.status.success}>
            Save and close external editor to continue
          </Text>
        </Box>
      );
    }

    question = `Apply this change?`;
    options.push({
      label: 'Yes, allow once',
      value: ToolConfirmationOutcome.ProceedOnce,
      key: 'Yes, allow once',
    });
    if (isTrustedFolder) {
      options.push({
        label: 'Yes, allow always',
        value: ToolConfirmationOutcome.ProceedAlways,
        key: 'Yes, allow always',
      });
    }
    if (!config.getIdeMode() || !isDiffingEnabled) {
      options.push({
        label: 'Modify with external editor',
        value: ToolConfirmationOutcome.ModifyWithEditor,
        key: 'Modify with external editor',
      });
    }

    options.push({
      label: 'No, suggest changes (esc)',
      value: ToolConfirmationOutcome.Cancel,
      key: 'No, suggest changes (esc)',
    });

    bodyContent = (
      <DiffRenderer
        diffContent={confirmationDetails.fileDiff}
        filename={confirmationDetails.fileName}
        availableTerminalHeight={availableBodyContentHeight()}
        terminalWidth={childWidth}
      />
    );
  } else if (confirmationDetails.type === 'exec') {
    const executionProps =
      confirmationDetails as ToolExecuteConfirmationDetails;

    question = `Allow execution of: '${executionProps.rootCommand}'?`;
    options.push({
      label: 'Yes, allow once',
      value: ToolConfirmationOutcome.ProceedOnce,
      key: 'Yes, allow once',
    });
    if (isTrustedFolder) {
      options.push({
        label: `Yes, allow always ...`,
        value: ToolConfirmationOutcome.ProceedAlways,
        key: `Yes, allow always ...`,
      });
    }
    options.push({
      label: 'No, suggest changes (esc)',
      value: ToolConfirmationOutcome.Cancel,
      key: 'No, suggest changes (esc)',
    });

    let bodyContentHeight = availableBodyContentHeight();
    if (bodyContentHeight !== undefined) {
      bodyContentHeight -= 2; // Account for padding;
    }
    bodyContent = (
      <Box flexDirection="column">
        <Box paddingX={1} marginLeft={1}>
          <MaxSizedBox
            maxHeight={bodyContentHeight}
            maxWidth={Math.max(childWidth, 1)}
          >
            <Box>
              <Text color={theme.text.link}>{executionProps.command}</Text>
            </Box>
          </MaxSizedBox>
        </Box>
      </Box>
    );
  } else if (confirmationDetails.type === 'info') {
    const infoProps = confirmationDetails;
    const displayUrls =
      infoProps.urls &&
      !(infoProps.urls.length === 1 && infoProps.urls[0] === infoProps.prompt);

    question = `Do you want to proceed?`;
    options.push({
      label: 'Yes, allow once',
      value: ToolConfirmationOutcome.ProceedOnce,
      key: 'Yes, allow once',
    });
    if (isTrustedFolder) {
      options.push({
        label: 'Yes, allow always',
        value: ToolConfirmationOutcome.ProceedAlways,
        key: 'Yes, allow always',
      });
    }
    options.push({
      label: 'No, suggest changes (esc)',
      value: ToolConfirmationOutcome.Cancel,
      key: 'No, suggest changes (esc)',
    });

    bodyContent = (
      <Box flexDirection="column" paddingLeft={1} marginLeft={1}>
        <Text color={theme.text.link}>
          <RenderInline text={infoProps.prompt} />
        </Text>
        {displayUrls && infoProps.urls && infoProps.urls.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text color={theme.text.primary}>URLs to fetch:</Text>
            {infoProps.urls.map((url) => (
              <Text key={url}>
                {' '}
                - <RenderInline text={url} />
              </Text>
            ))}
          </Box>
        )}
      </Box>
    );
  } else {
    // mcp tool confirmation
    const mcpProps = confirmationDetails as ToolMcpConfirmationDetails;

    bodyContent = (
      <Box flexDirection="column" paddingX={1} marginLeft={1}>
        <Text color={theme.text.link}>MCP Server: {mcpProps.serverName}</Text>
        <Text color={theme.text.link}>Tool: {mcpProps.toolName}</Text>
      </Box>
    );

    question = `Allow execution of MCP tool "${mcpProps.toolName}" from server "${mcpProps.serverName}"?`;
    options.push({
      label: 'Yes, allow once',
      value: ToolConfirmationOutcome.ProceedOnce,
      key: 'Yes, allow once',
    });
    if (isTrustedFolder) {
      options.push({
        label: `Yes, always allow tool "${mcpProps.toolName}" from server "${mcpProps.serverName}"`,
        value: ToolConfirmationOutcome.ProceedAlwaysTool, // Cast until types are updated
        key: `Yes, always allow tool "${mcpProps.toolName}" from server "${mcpProps.serverName}"`,
      });
      options.push({
        label: `Yes, always allow all tools from server "${mcpProps.serverName}"`,
        value: ToolConfirmationOutcome.ProceedAlwaysServer,
        key: `Yes, always allow all tools from server "${mcpProps.serverName}"`,
      });
    }
    options.push({
      label: 'No, suggest changes (esc)',
      value: ToolConfirmationOutcome.Cancel,
      key: 'No, suggest changes (esc)',
    });
  }

  return (
    <Box
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      paddingTop={0}
      paddingBottom={1}
      width={childWidth}
    >
      {/* Body Content (Diff Renderer or Command Info) */}
      {/* No separate context display here anymore for edits */}
      <Box
        flexGrow={1}
        flexShrink={1}
        overflow="hidden"
        marginBottom={1}
        borderStyle="round"
        borderLeft={false}
        borderRight={false}
        borderColor={theme.border.default}
        paddingLeft={1}
      >
        {bodyContent}
      </Box>

      {/* Confirmation Question */}
      <Box marginBottom={1} flexShrink={0}>
        <Text color={theme.text.primary}>{question}</Text>
      </Box>

      {/* Select Input for Options */}
      <Box flexShrink={0}>
        <RadioButtonSelect
          items={options}
          onSelect={handleSelect}
          isFocused={isFocused}
        />
      </Box>
    </Box>
  );
};
