/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n/index.js';
import { DiffRenderer } from './DiffRenderer.js';
import { Colors } from '../../colors.js';
import { RenderInline } from '../../utils/InlineMarkdownRenderer.js';
import {
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolExecuteConfirmationDetails,
  ToolMcpConfirmationDetails,
  Config,
} from '@google/gemini-cli-core';
import {
  RadioButtonSelect,
  RadioSelectItem,
} from '../shared/RadioButtonSelect.js';
import { MaxSizedBox } from '../shared/MaxSizedBox.js';
import { useKeypress } from '../../hooks/useKeypress.js';

export interface ToolConfirmationMessageProps {
  confirmationDetails: ToolCallConfirmationDetails;
  config?: Config;
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
  const { t } = useTranslation('ui');
  const { onConfirm } = confirmationDetails;
  const childWidth = terminalWidth - 2; // 2 for padding

  const handleConfirm = async (outcome: ToolConfirmationOutcome) => {
    if (confirmationDetails.type === 'edit') {
      const ideClient = config?.getIdeClient();
      if (config?.getIdeMode()) {
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
          minWidth="90%"
          borderStyle="round"
          borderColor={Colors.Gray}
          justifyContent="space-around"
          padding={1}
          overflow="hidden"
        >
          <Text>{i18n.t('ui:tools.modifyInProgress')}</Text>
          <Text color={Colors.AccentGreen}>
            Save and close external editor to continue
          </Text>
        </Box>
      );
    }

    question = `Apply this change?`;
    options.push(
      {
        label: t('confirmations.yesAllowOnce'),
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: t('confirmations.yesAllowAlways'),
        value: ToolConfirmationOutcome.ProceedAlways,
      },
    );
    if (config?.getIdeMode()) {
      options.push({
        label: t('confirmations.noEsc'),
        value: ToolConfirmationOutcome.Cancel,
      });
    } else {
      options.push({
        label: t('confirmations.modifyWithExternalEditor'),
        value: ToolConfirmationOutcome.ModifyWithEditor,
      });
      options.push({
        label: t('confirmations.noSuggestChanges'),
        value: ToolConfirmationOutcome.Cancel,
      });
    }

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
    options.push(
      {
        label: t('confirmations.yesAllowOnce'),
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: t('confirmations.yesAllowAlwaysEllipsis'),
        value: ToolConfirmationOutcome.ProceedAlways,
      },
      {
        label: t('confirmations.noSuggestChanges'),
        value: ToolConfirmationOutcome.Cancel,
      },
    );

    let bodyContentHeight = availableBodyContentHeight();
    if (bodyContentHeight !== undefined) {
      bodyContentHeight -= 2; // Account for padding;
    }
    bodyContent = (
      <Box flexDirection="column">
        <Box paddingX={1} marginLeft={1}>
          <MaxSizedBox
            maxHeight={bodyContentHeight}
            maxWidth={Math.max(childWidth - 4, 1)}
          >
            <Box>
              <Text color={Colors.AccentCyan}>{executionProps.command}</Text>
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
    options.push(
      {
        label: t('confirmations.yesAllowOnce'),
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: t('confirmations.yesAllowAlways'),
        value: ToolConfirmationOutcome.ProceedAlways,
      },
      {
        label: t('confirmations.noSuggestChanges'),
        value: ToolConfirmationOutcome.Cancel,
      },
    );

    bodyContent = (
      <Box flexDirection="column" paddingX={1} marginLeft={1}>
        <Text color={Colors.AccentCyan}>
          <RenderInline text={infoProps.prompt} />
        </Text>
        {displayUrls && infoProps.urls && infoProps.urls.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text>URLs to fetch:</Text>
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
        <Text color={Colors.AccentCyan}>
          {i18n.t('ui:tools.mcpServer', { serverName: mcpProps.serverName })}
        </Text>
        <Text color={Colors.AccentCyan}>
          {i18n.t('ui:tools.tool', { toolName: mcpProps.toolName })}
        </Text>
      </Box>
    );

    question = `Allow execution of MCP tool "${mcpProps.toolName}" from server "${mcpProps.serverName}"?`;
    options.push(
      {
        label: t('confirmations.yesAllowOnce'),
        value: ToolConfirmationOutcome.ProceedOnce,
      },
      {
        label: t('confirmations.yesAllowToolFromServer', {
          toolName: mcpProps.toolName,
          serverName: mcpProps.serverName,
        }),
        value: ToolConfirmationOutcome.ProceedAlwaysTool, // Cast until types are updated
      },
      {
        label: t('confirmations.yesAllowAllToolsFromServer', {
          serverName: mcpProps.serverName,
        }),
        value: ToolConfirmationOutcome.ProceedAlwaysServer,
      },
      {
        label: t('confirmations.noSuggestChanges'),
        value: ToolConfirmationOutcome.Cancel,
      },
    );
  }

  return (
    <Box flexDirection="column" padding={1} width={childWidth}>
      {/* Body Content (Diff Renderer or Command Info) */}
      {/* No separate context display here anymore for edits */}
      <Box flexGrow={1} flexShrink={1} overflow="hidden" marginBottom={1}>
        {bodyContent}
      </Box>

      {/* Confirmation Question */}
      <Box marginBottom={1} flexShrink={0}>
        <Text wrap="truncate">{question}</Text>
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
