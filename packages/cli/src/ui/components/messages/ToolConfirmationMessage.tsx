/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState, useMemo } from 'react';
import { Box, Text } from 'ink';
import { DiffRenderer } from './DiffRenderer.js';
import { RenderInline } from '../../utils/InlineMarkdownRenderer.js';
import type {
  ToolCallConfirmationDetails,
  Config,
} from '@google/gemini-cli-core';
import { IdeClient, ToolConfirmationOutcome } from '@google/gemini-cli-core';
import type { RadioSelectItem } from '../shared/RadioButtonSelect.js';
import { RadioButtonSelect } from '../shared/RadioButtonSelect.js';
import { MaxSizedBox } from '../shared/MaxSizedBox.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { theme } from '../../semantic-colors.js';
import { useAlternateBuffer } from '../../hooks/useAlternateBuffer.js';
import { useSettings } from '../../contexts/SettingsContext.js';

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

  const isAlternateBuffer = useAlternateBuffer();
  const settings = useSettings();
  const allowPermanentApproval =
    settings.merged.security?.enablePermanentToolApproval ?? false;

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
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
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
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    onConfirm(outcome);
  };

  const isTrustedFolder = config.isTrustedFolder();

  useKeypress(
    (key) => {
      if (!isFocused) return;
      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        handleConfirm(ToolConfirmationOutcome.Cancel);
      }
    },
    { isActive: isFocused },
  );

  const handleSelect = (item: ToolConfirmationOutcome) => handleConfirm(item);

  const { question, bodyContent, options } = useMemo(() => {
    let bodyContent: React.ReactNode | null = null;
    let question = '';
    const options: Array<RadioSelectItem<ToolConfirmationOutcome>> = [];

    if (confirmationDetails.type === 'edit') {
      if (!confirmationDetails.isModifying) {
        question = `Apply this change?`;
        options.push({
          label: 'Allow once',
          value: ToolConfirmationOutcome.ProceedOnce,
          key: 'Allow once',
        });
        if (isTrustedFolder) {
          options.push({
            label: 'Allow for this session',
            value: ToolConfirmationOutcome.ProceedAlways,
            key: 'Allow for this session',
          });
          if (allowPermanentApproval) {
            options.push({
              label: 'Allow for all future sessions',
              value: ToolConfirmationOutcome.ProceedAlwaysAndSave,
              key: 'Allow for all future sessions',
            });
          }
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
      }
    } else if (confirmationDetails.type === 'exec') {
      const executionProps = confirmationDetails;

      question = `Allow execution of: '${executionProps.rootCommand}'?`;
      options.push({
        label: 'Allow once',
        value: ToolConfirmationOutcome.ProceedOnce,
        key: 'Allow once',
      });
      if (isTrustedFolder) {
        options.push({
          label: `Allow for this session`,
          value: ToolConfirmationOutcome.ProceedAlways,
          key: `Allow for this session`,
        });
        if (allowPermanentApproval) {
          options.push({
            label: `Allow for all future sessions`,
            value: ToolConfirmationOutcome.ProceedAlwaysAndSave,
            key: `Allow for all future sessions`,
          });
        }
      }
      options.push({
        label: 'No, suggest changes (esc)',
        value: ToolConfirmationOutcome.Cancel,
        key: 'No, suggest changes (esc)',
      });
    } else if (confirmationDetails.type === 'info') {
      question = `Do you want to proceed?`;
      options.push({
        label: 'Allow once',
        value: ToolConfirmationOutcome.ProceedOnce,
        key: 'Allow once',
      });
      if (isTrustedFolder) {
        options.push({
          label: 'Allow for this session',
          value: ToolConfirmationOutcome.ProceedAlways,
          key: 'Allow for this session',
        });
        if (allowPermanentApproval) {
          options.push({
            label: 'Allow for all future sessions',
            value: ToolConfirmationOutcome.ProceedAlwaysAndSave,
            key: 'Allow for all future sessions',
          });
        }
      }
      options.push({
        label: 'No, suggest changes (esc)',
        value: ToolConfirmationOutcome.Cancel,
        key: 'No, suggest changes (esc)',
      });
    } else {
      // mcp tool confirmation
      const mcpProps = confirmationDetails;
      question = `Allow execution of MCP tool "${mcpProps.toolName}" from server "${mcpProps.serverName}"?`;
      options.push({
        label: 'Allow once',
        value: ToolConfirmationOutcome.ProceedOnce,
        key: 'Allow once',
      });
      if (isTrustedFolder) {
        options.push({
          label: 'Allow tool for this session',
          value: ToolConfirmationOutcome.ProceedAlwaysTool,
          key: 'Allow tool for this session',
        });
        options.push({
          label: 'Allow all server tools for this session',
          value: ToolConfirmationOutcome.ProceedAlwaysServer,
          key: 'Allow all server tools for this session',
        });
        if (allowPermanentApproval) {
          options.push({
            label: 'Allow tool for all future sessions',
            value: ToolConfirmationOutcome.ProceedAlwaysAndSave,
            key: 'Allow tool for all future sessions',
          });
        }
      }
      options.push({
        label: 'No, suggest changes (esc)',
        value: ToolConfirmationOutcome.Cancel,
        key: 'No, suggest changes (esc)',
      });
    }

    function availableBodyContentHeight() {
      if (options.length === 0) {
        // Should not happen if we populated options correctly above for all types
        // except when isModifying is true, but in that case we don't call this because we don't enter the if block for it.
        return undefined;
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
      if (!confirmationDetails.isModifying) {
        bodyContent = (
          <DiffRenderer
            diffContent={confirmationDetails.fileDiff}
            filename={confirmationDetails.fileName}
            availableTerminalHeight={availableBodyContentHeight()}
            terminalWidth={terminalWidth}
          />
        );
      }
    } else if (confirmationDetails.type === 'exec') {
      const executionProps = confirmationDetails;
      let bodyContentHeight = availableBodyContentHeight();
      if (bodyContentHeight !== undefined) {
        bodyContentHeight -= 2; // Account for padding;
      }

      const commandBox = (
        <Box>
          <Text color={theme.text.link}>{executionProps.command}</Text>
        </Box>
      );

      bodyContent = isAlternateBuffer ? (
        commandBox
      ) : (
        <MaxSizedBox
          maxHeight={bodyContentHeight}
          maxWidth={Math.max(terminalWidth, 1)}
        >
          {commandBox}
        </MaxSizedBox>
      );
    } else if (confirmationDetails.type === 'info') {
      const infoProps = confirmationDetails;
      const displayUrls =
        infoProps.urls &&
        !(
          infoProps.urls.length === 1 && infoProps.urls[0] === infoProps.prompt
        );

      bodyContent = (
        <Box flexDirection="column">
          <Text color={theme.text.link}>
            <RenderInline
              text={infoProps.prompt}
              defaultColor={theme.text.link}
            />
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
      const mcpProps = confirmationDetails;

      bodyContent = (
        <Box flexDirection="column">
          <Text color={theme.text.link}>MCP Server: {mcpProps.serverName}</Text>
          <Text color={theme.text.link}>Tool: {mcpProps.toolName}</Text>
        </Box>
      );
    }

    return { question, bodyContent, options };
  }, [
    confirmationDetails,
    isTrustedFolder,
    config,
    isDiffingEnabled,
    availableTerminalHeight,
    terminalWidth,
    isAlternateBuffer,
    allowPermanentApproval,
  ]);

  if (confirmationDetails.type === 'edit') {
    if (confirmationDetails.isModifying) {
      return (
        <Box
          width={terminalWidth}
          borderStyle="round"
          borderColor={theme.border.default}
          justifyContent="space-around"
          paddingTop={1}
          paddingBottom={1}
          overflow="hidden"
        >
          <Text color={theme.text.primary}>Modify in progress: </Text>
          <Text color={theme.status.success}>
            Save and close external editor to continue
          </Text>
        </Box>
      );
    }
  }

  return (
    <Box flexDirection="column" paddingTop={0} paddingBottom={1}>
      {/* Body Content (Diff Renderer or Command Info) */}
      {/* No separate context display here anymore for edits */}
      <Box flexGrow={1} flexShrink={1} overflow="hidden" marginBottom={1}>
        {bodyContent}
      </Box>

      {/* System Message */}
      {confirmationDetails.systemMessage && (
        <Box marginBottom={1} flexShrink={0}>
          <Text color={theme.status.warning}>
            [System] {confirmationDetails.systemMessage}
          </Text>
        </Box>
      )}

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
