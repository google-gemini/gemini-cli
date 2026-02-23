/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo, useCallback } from 'react';
import { Box, Text } from 'ink';
import { DiffRenderer } from './DiffRenderer.js';
import { RenderInline } from '../../utils/InlineMarkdownRenderer.js';
import {
  type SerializableConfirmationDetails,
  type Config,
  type ToolConfirmationPayload,
  ToolConfirmationOutcome,
  hasRedirection,
  debugLogger,
} from '@google/gemini-cli-core';
import type { RadioSelectItem } from '../shared/RadioButtonSelect.js';
import { useToolActions } from '../../contexts/ToolActionsContext.js';
import { RadioButtonSelect } from '../shared/RadioButtonSelect.js';
import { MaxSizedBox, MINIMUM_MAX_HEIGHT } from '../shared/MaxSizedBox.js';
import {
  sanitizeForDisplay,
  stripUnsafeCharacters,
} from '../../utils/textUtils.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { theme } from '../../semantic-colors.js';
import { useSettings } from '../../contexts/SettingsContext.js';
import { keyMatchers, Command } from '../../keyMatchers.js';
import {
  REDIRECTION_WARNING_NOTE_LABEL,
  REDIRECTION_WARNING_NOTE_TEXT,
  REDIRECTION_WARNING_TIP_LABEL,
  REDIRECTION_WARNING_TIP_TEXT,
} from '../../textConstants.js';
import { AskUserDialog } from '../AskUserDialog.js';
import { ExitPlanModeDialog } from '../ExitPlanModeDialog.js';
import { WarningMessage } from './WarningMessage.js';
import {
  getDeceptiveUrlDetails,
  toUnicodeUrl,
  type DeceptiveUrlDetails,
} from '../../utils/urlSecurityUtils.js';

export interface ToolConfirmationMessageProps {
  callId: string;
  confirmationDetails: SerializableConfirmationDetails;
  config: Config;
  isFocused?: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

export const ToolConfirmationMessage: React.FC<
  ToolConfirmationMessageProps
> = ({
  callId,
  confirmationDetails,
  config,
  isFocused = true,
  availableTerminalHeight,
  terminalWidth,
}) => {
  const { confirm, isDiffingEnabled } = useToolActions();

  const settings = useSettings();
  const allowPermanentApproval =
    settings.merged.security.enablePermanentToolApproval;

  const handlesOwnUI =
    confirmationDetails.type === 'ask_user' ||
    confirmationDetails.type === 'exit_plan_mode';
  const isTrustedFolder = config.isTrustedFolder();

  const handleConfirm = useCallback(
    (outcome: ToolConfirmationOutcome, payload?: ToolConfirmationPayload) => {
      void confirm(callId, outcome, payload).catch((error: unknown) => {
        debugLogger.error(
          `Failed to handle tool confirmation for ${callId}:`,
          error,
        );
      });
    },
    [confirm, callId],
  );

  useKeypress(
    (key) => {
      if (!isFocused) return false;
      if (keyMatchers[Command.ESCAPE](key)) {
        handleConfirm(ToolConfirmationOutcome.Cancel);
        return true;
      }
      if (keyMatchers[Command.QUIT](key)) {
        // Return false to let ctrl-C bubble up to AppContainer for exit flow.
        // AppContainer will call cancelOngoingRequest which will cancel the tool.
        return false;
      }
      return false;
    },
    { isActive: isFocused },
  );

  const handleSelect = useCallback(
    (item: ToolConfirmationOutcome) => handleConfirm(item),
    [handleConfirm],
  );

  const deceptiveUrlWarnings = useMemo(() => {
    const urls: string[] = [];
    if (confirmationDetails.type === 'info' && confirmationDetails.urls) {
      urls.push(...confirmationDetails.urls);
    } else if (confirmationDetails.type === 'exec') {
      const commands =
        confirmationDetails.commands && confirmationDetails.commands.length > 0
          ? confirmationDetails.commands
          : [confirmationDetails.command];
      for (const cmd of commands) {
        const matches = cmd.match(/https?:\/\/[^\s"'`<>;&|()]+/g);
        if (matches) urls.push(...matches);
      }
    }

    const uniqueUrls = Array.from(new Set(urls));
    return uniqueUrls
      .map(getDeceptiveUrlDetails)
      .filter((d): d is DeceptiveUrlDetails => d !== null);
  }, [confirmationDetails]);

  const deceptiveUrlWarningText = useMemo(() => {
    if (deceptiveUrlWarnings.length === 0) return null;
    return `**Warning:** Deceptive URL(s) detected:\n\n${deceptiveUrlWarnings
      .map(
        (w) =>
          `   **Original:** ${w.originalUrl}\n   **Actual Host (Punycode):** ${w.punycodeUrl}`,
      )
      .join('\n\n')}`;
  }, [deceptiveUrlWarnings]);

  const getOptions = useCallback(() => {
    const options: Array<RadioSelectItem<ToolConfirmationOutcome>> = [];

    if (confirmationDetails.type === 'edit') {
      if (!confirmationDetails.isModifying) {
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
        // We hide "Modify with external editor" if IDE mode is active AND
        // the IDE is actually capable of showing a diff (connected).
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
    } else if (confirmationDetails.type === 'mcp') {
      // mcp tool confirmation
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
    return options;
  }, [
    confirmationDetails,
    isTrustedFolder,
    allowPermanentApproval,
    config,
    isDiffingEnabled,
  ]);

  const availableBodyContentHeight = useCallback(() => {
    if (availableTerminalHeight === undefined) {
      return undefined;
    }

    if (handlesOwnUI) {
      return availableTerminalHeight;
    }

    // Calculate the vertical space (in lines) consumed by UI elements
    // surrounding the main body content.
    const PADDING_OUTER_Y = 2; // Main container has `padding={1}` (top & bottom).
    const MARGIN_BODY_BOTTOM = 1; // margin on the body container.
    const HEIGHT_QUESTION = 1; // The question text is one line.
    const MARGIN_QUESTION_BOTTOM = 1; // Margin on the question container.

    const optionsCount = getOptions().length;

    const surroundingElementsHeight =
      PADDING_OUTER_Y +
      MARGIN_BODY_BOTTOM +
      HEIGHT_QUESTION +
      MARGIN_QUESTION_BOTTOM +
      optionsCount +
      1; // Reserve one line for 'ShowMoreLines' hint

    return Math.max(availableTerminalHeight - surroundingElementsHeight, 1);
  }, [availableTerminalHeight, getOptions, handlesOwnUI]);

  const { question, bodyContent, options, securityWarnings } = useMemo<{
    question: string;
    bodyContent: React.ReactNode;
    options: Array<RadioSelectItem<ToolConfirmationOutcome>>;
    securityWarnings: React.ReactNode;
  }>(() => {
    let bodyContent: React.ReactNode | null = null;
    let securityWarnings: React.ReactNode | null = null;
    let question = '';
    const options = getOptions();

    if (deceptiveUrlWarningText) {
      securityWarnings = <WarningMessage text={deceptiveUrlWarningText} />;
    }

    if (confirmationDetails.type === 'ask_user') {
      bodyContent = (
        <AskUserDialog
          questions={confirmationDetails.questions}
          onSubmit={(answers) => {
            handleConfirm(ToolConfirmationOutcome.ProceedOnce, { answers });
          }}
          onCancel={() => {
            handleConfirm(ToolConfirmationOutcome.Cancel);
          }}
          width={terminalWidth}
          availableHeight={availableBodyContentHeight()}
        />
      );
      return {
        question: '',
        bodyContent,
        options: [],
        securityWarnings: null,
      };
    }

    if (confirmationDetails.type === 'exit_plan_mode') {
      bodyContent = (
        <ExitPlanModeDialog
          planPath={confirmationDetails.planPath}
          onApprove={(approvalMode) => {
            handleConfirm(ToolConfirmationOutcome.ProceedOnce, {
              approved: true,
              approvalMode,
            });
          }}
          onFeedback={(feedback) => {
            handleConfirm(ToolConfirmationOutcome.ProceedOnce, {
              approved: false,
              feedback,
            });
          }}
          onCancel={() => {
            handleConfirm(ToolConfirmationOutcome.Cancel);
          }}
          width={terminalWidth}
          availableHeight={availableBodyContentHeight()}
        />
      );
      return { question: '', bodyContent, options: [], securityWarnings: null };
    }

    if (confirmationDetails.type === 'edit') {
      if (!confirmationDetails.isModifying) {
        question = `Apply this change?`;
      }
    } else if (confirmationDetails.type === 'exec') {
      const executionProps = confirmationDetails;

      if (executionProps.commands && executionProps.commands.length > 1) {
        question = `Allow execution of ${executionProps.commands.length} commands?`;
      } else {
        question = `Allow execution of: '${sanitizeForDisplay(executionProps.rootCommand)}'?`;
      }
    } else if (confirmationDetails.type === 'info') {
      question = `Do you want to proceed?`;
    } else if (confirmationDetails.type === 'mcp') {
      // mcp tool confirmation
      const mcpProps = confirmationDetails;
      question = `Allow execution of MCP tool "${sanitizeForDisplay(mcpProps.toolName)}" from server "${sanitizeForDisplay(mcpProps.serverName)}"?`;
    }

    if (confirmationDetails.type === 'edit') {
      if (!confirmationDetails.isModifying) {
        bodyContent = (
          <DiffRenderer
            diffContent={stripUnsafeCharacters(confirmationDetails.fileDiff)}
            filename={sanitizeForDisplay(confirmationDetails.fileName)}
            availableTerminalHeight={availableBodyContentHeight()}
            terminalWidth={terminalWidth}
          />
        );
      }
    } else if (confirmationDetails.type === 'exec') {
      const executionProps = confirmationDetails;

      const commandsToDisplay =
        executionProps.commands && executionProps.commands.length > 1
          ? executionProps.commands
          : [executionProps.command];
      const containsRedirection = commandsToDisplay.some((cmd) =>
        hasRedirection(cmd),
      );

      let bodyContentHeight = availableBodyContentHeight();
      let warnings: React.ReactNode = null;

      if (bodyContentHeight !== undefined) {
        bodyContentHeight -= 2; // Account for padding;
      }

      if (containsRedirection) {
        // Calculate lines needed for Note and Tip
        const safeWidth = Math.max(terminalWidth, 1);
        const noteLength =
          REDIRECTION_WARNING_NOTE_LABEL.length +
          REDIRECTION_WARNING_NOTE_TEXT.length;
        const tipLength =
          REDIRECTION_WARNING_TIP_LABEL.length +
          REDIRECTION_WARNING_TIP_TEXT.length;

        const noteLines = Math.ceil(noteLength / safeWidth);
        const tipLines = Math.ceil(tipLength / safeWidth);
        const spacerLines = 1;
        const warningHeight = noteLines + tipLines + spacerLines;

        if (bodyContentHeight !== undefined) {
          bodyContentHeight = Math.max(
            bodyContentHeight - warningHeight,
            MINIMUM_MAX_HEIGHT,
          );
        }

        warnings = (
          <>
            <Box height={1} />
            <Box>
              <Text color={theme.text.primary}>
                <Text bold>{REDIRECTION_WARNING_NOTE_LABEL}</Text>
                {REDIRECTION_WARNING_NOTE_TEXT}
              </Text>
            </Box>
            <Box>
              <Text color={theme.border.default}>
                <Text bold>{REDIRECTION_WARNING_TIP_LABEL}</Text>
                {REDIRECTION_WARNING_TIP_TEXT}
              </Text>
            </Box>
          </>
        );
      }

      bodyContent = (
        <Box flexDirection="column">
          <MaxSizedBox
            maxHeight={bodyContentHeight}
            maxWidth={Math.max(terminalWidth, 1)}
          >
            <Box flexDirection="column">
              {commandsToDisplay.map((cmd, idx) => (
                <Text key={idx} color={theme.text.link}>
                  {sanitizeForDisplay(cmd)}
                </Text>
              ))}
            </Box>
          </MaxSizedBox>
          {warnings}
        </Box>
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
              {infoProps.urls.map((urlString) => (
                <Text key={urlString}>
                  {' '}
                  - <RenderInline text={toUnicodeUrl(urlString)} />
                </Text>
              ))}
            </Box>
          )}
        </Box>
      );
    } else if (confirmationDetails.type === 'mcp') {
      // mcp tool confirmation
      const mcpProps = confirmationDetails;

      bodyContent = (
        <Box flexDirection="column">
          <Text color={theme.text.link}>
            MCP Server: {sanitizeForDisplay(mcpProps.serverName)}
          </Text>
          <Text color={theme.text.link}>
            Tool: {sanitizeForDisplay(mcpProps.toolName)}
          </Text>
        </Box>
      );
    }

    return { question, bodyContent, options, securityWarnings };
  }, [
    confirmationDetails,
    getOptions,
    availableBodyContentHeight,
    terminalWidth,
    handleConfirm,
    deceptiveUrlWarningText,
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
    <Box
      flexDirection="column"
      paddingTop={0}
      paddingBottom={handlesOwnUI ? 0 : 1}
    >
      {handlesOwnUI ? (
        bodyContent
      ) : (
        <>
          <Box flexGrow={1} flexShrink={1} overflow="hidden">
            <MaxSizedBox
              maxHeight={availableBodyContentHeight()}
              maxWidth={terminalWidth}
              overflowDirection="top"
            >
              {bodyContent}
            </MaxSizedBox>
          </Box>

          {securityWarnings && (
            <Box flexShrink={0} marginBottom={1}>
              {securityWarnings}
            </Box>
          )}

          <Box marginBottom={1} flexShrink={0}>
            <Text color={theme.text.primary}>{question}</Text>
          </Box>

          <Box flexShrink={0}>
            <RadioButtonSelect
              items={options}
              onSelect={handleSelect}
              isFocused={isFocused}
            />
          </Box>
        </>
      )}
    </Box>
  );
};
