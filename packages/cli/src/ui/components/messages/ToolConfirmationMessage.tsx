/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { Box, Text, ResizeObserver, type DOMElement } from 'ink';
import { DiffRenderer } from './DiffRenderer.js';
import { RenderInline } from '../../utils/InlineMarkdownRenderer.js';
import {
  type SerializableConfirmationDetails,
  type Config,
  type ToolConfirmationPayload,
  ToolConfirmationOutcome,
  type EditorType,
  ApprovalMode,
  hasRedirection,
  debugLogger,
} from '@google/gemini-cli-core';
import { useToolActions } from '../../contexts/ToolActionsContext.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from '../shared/RadioButtonSelect.js';
import { MaxSizedBox } from '../shared/MaxSizedBox.js';
import {
  sanitizeForDisplay,
  stripUnsafeCharacters,
} from '../../utils/textUtils.js';
import { useKeypress } from '../../hooks/useKeypress.js';
import { theme } from '../../semantic-colors.js';
import { themeManager } from '../../themes/theme-manager.js';
import { useSettings } from '../../contexts/SettingsContext.js';
import { Command } from '../../key/keyMatchers.js';
import { formatCommand } from '../../key/keybindingUtils.js';
import { AskUserDialog } from '../AskUserDialog.js';
import { ExitPlanModeDialog } from '../ExitPlanModeDialog.js';
import { WarningMessage } from './WarningMessage.js';
import { colorizeCode } from '../../utils/CodeColorizer.js';
import {
  getDeceptiveUrlDetails,
  toUnicodeUrl,
  type DeceptiveUrlDetails,
} from '../../utils/urlSecurityUtils.js';
import { useKeyMatchers } from '../../hooks/useKeyMatchers.js';
import { isShellTool } from './ToolShared.js';

export interface ToolConfirmationMessageProps {
  callId: string;
  confirmationDetails: SerializableConfirmationDetails;
  config: Config;
  getPreferredEditor: () => EditorType | undefined;
  isFocused?: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
  toolName: string;
}

export const ToolConfirmationMessage: React.FC<
  ToolConfirmationMessageProps
> = ({
  callId,
  confirmationDetails,
  config,
  getPreferredEditor,
  isFocused = true,
  availableTerminalHeight,
  terminalWidth,
  toolName,
}) => {
  const keyMatchers = useKeyMatchers();
  const { confirm, isDiffingEnabled } = useToolActions();
  const [mcpDetailsExpansionState, setMcpDetailsExpansionState] = useState<{
    callId: string;
    expanded: boolean;
  }>({
    callId,
    expanded: false,
  });
  const [isCancelling, setIsCancelling] = useState(false);
  const isMcpToolDetailsExpanded =
    mcpDetailsExpansionState.callId === callId
      ? mcpDetailsExpansionState.expanded
      : false;

  const [measuredSecurityWarningsHeight, setMeasuredSecurityWarningsHeight] =
    useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
    },
    [],
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

  const onSecurityWarningsRefChange = useCallback((node: DOMElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (node) {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const newHeight = Math.round(entry.contentRect.height);
          setMeasuredSecurityWarningsHeight((prev) =>
            newHeight !== prev ? newHeight : prev,
          );
        }
      });
      observer.observe(node);
      observerRef.current = observer;
    } else {
      setMeasuredSecurityWarningsHeight((prev) => (prev !== 0 ? 0 : prev));
    }
  }, []);

  const settings = useSettings();
  const activeTheme = themeManager.getActiveTheme();
  const allowPermanentApproval =
    settings.merged.security.enablePermanentToolApproval &&
    !config.getDisableAlwaysAllow();

  const handlesOwnUI =
    confirmationDetails.type === 'ask_user' ||
    confirmationDetails.type === 'exit_plan_mode';
  const isTrustedFolder =
    config.isTrustedFolder() && !config.getDisableAlwaysAllow();

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

  const mcpToolDetailsText = useMemo(() => {
    if (confirmationDetails.type !== 'mcp') {
      return null;
    }

    const detailsLines: string[] = [];
    const hasNonEmptyToolArgs =
      confirmationDetails.toolArgs !== undefined &&
      !(
        typeof confirmationDetails.toolArgs === 'object' &&
        confirmationDetails.toolArgs !== null &&
        Object.keys(confirmationDetails.toolArgs).length === 0
      );
    if (hasNonEmptyToolArgs) {
      let argsText: string;
      try {
        argsText = stripUnsafeCharacters(
          JSON.stringify(confirmationDetails.toolArgs, null, 2),
        );
      } catch {
        argsText = '[unserializable arguments]';
      }
      detailsLines.push('Invocation Arguments:');
      detailsLines.push(argsText);
    }

    const description = confirmationDetails.toolDescription?.trim();
    if (description) {
      if (detailsLines.length > 0) {
        detailsLines.push('');
      }
      detailsLines.push('Description:');
      detailsLines.push(stripUnsafeCharacters(description));
    }

    if (confirmationDetails.toolParameterSchema !== undefined) {
      let schemaText: string;
      try {
        schemaText = stripUnsafeCharacters(
          JSON.stringify(confirmationDetails.toolParameterSchema, null, 2),
        );
      } catch {
        schemaText = '[unserializable schema]';
      }
      if (detailsLines.length > 0) {
        detailsLines.push('');
      }
      detailsLines.push('Input Schema:');
      detailsLines.push(schemaText);
    }

    if (detailsLines.length === 0) {
      return null;
    }

    return detailsLines.join('\n');
  }, [confirmationDetails]);

  const hasMcpToolDetails = !!mcpToolDetailsText;
  const expandDetailsHintKey = formatCommand(Command.SHOW_MORE_LINES);

  useKeypress(
    (key) => {
      if (!isFocused) return false;
      if (
        confirmationDetails.type === 'mcp' &&
        hasMcpToolDetails &&
        keyMatchers[Command.SHOW_MORE_LINES](key)
      ) {
        setMcpDetailsExpansionState({
          callId,
          expanded: !isMcpToolDetailsExpanded,
        });
        return true;
      }
      if (keyMatchers[Command.ESCAPE](key)) {
        setIsCancelling(true);
        return true;
      }
      if (keyMatchers[Command.QUIT](key)) {
        return false;
      }
      return false;
    },
    { isActive: isFocused, priority: true },
  );

  // TODO(#23009): Remove this hack once we migrate to the new renderer.
  // Why useEffect is used here instead of calling handleConfirm directly:
  // There is a race condition where calling handleConfirm immediately upon
  // keypress removes the tool UI component while the UI is in an expanded state.
  // This simultaneously triggers setConstrainHeight, causing render two footers.
  // By bridging the cancel action through state (isCancelling) and this useEffect,
  // we delay handleConfirm until the next render cycle, ensuring setConstrainHeight
  // resolves properly first.
  useEffect(() => {
    if (isCancelling) {
      handleConfirm(ToolConfirmationOutcome.Cancel);
    }
  }, [isCancelling, handleConfirm]);

  const handleSelect = useCallback(
    (item: ToolConfirmationOutcome) => handleConfirm(item),
    [handleConfirm],
  );

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
              label: 'Allow for this file in all future sessions',
              value: ToolConfirmationOutcome.ProceedAlwaysAndSave,
              key: 'Allow for this file in all future sessions',
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
    } else if (confirmationDetails.type === 'sandbox_expansion') {
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
            label: `Allow this command for all future sessions`,
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
    const PADDING_OUTER_Y = 0;
    const HEIGHT_QUESTION = 1;
    const MARGIN_QUESTION_TOP = 0;
    const MARGIN_QUESTION_BOTTOM = 1;
    const SECURITY_WARNING_BOTTOM_MARGIN = 1;
    const SHOW_MORE_LINES_HEIGHT = 1;

    const optionsCount = getOptions().length;

    const securityWarningsHeight = deceptiveUrlWarningText
      ? measuredSecurityWarningsHeight + SECURITY_WARNING_BOTTOM_MARGIN
      : 0;

    let extraInfoLines = 0;
    if (confirmationDetails.type === 'sandbox_expansion') {
      const { additionalPermissions } = confirmationDetails;
      if (additionalPermissions?.network) extraInfoLines++;
      extraInfoLines += additionalPermissions?.fileSystem?.read?.length || 0;
      extraInfoLines += additionalPermissions?.fileSystem?.write?.length || 0;
    } else if (confirmationDetails.type === 'exec') {
      const executionProps = confirmationDetails;
      const commandsToDisplay =
        executionProps.commands && executionProps.commands.length > 0
          ? executionProps.commands
          : [executionProps.command];
      const containsRedirection = commandsToDisplay.some((cmd) =>
        hasRedirection(cmd),
      );
      const isAutoEdit =
        config.getApprovalMode() === ApprovalMode.YOLO ||
        config.getApprovalMode() === ApprovalMode.AUTO_EDIT;
      if (containsRedirection && !isAutoEdit) {
        extraInfoLines = 1; // Warning line
      }
    }

    const surroundingElementsHeight =
      PADDING_OUTER_Y +
      HEIGHT_QUESTION +
      MARGIN_QUESTION_TOP +
      MARGIN_QUESTION_BOTTOM +
      SHOW_MORE_LINES_HEIGHT +
      optionsCount +
      securityWarningsHeight +
      extraInfoLines;

    return Math.max(availableTerminalHeight - surroundingElementsHeight, 2);
  }, [
    availableTerminalHeight,
    handlesOwnUI,
    getOptions,
    measuredSecurityWarningsHeight,
    deceptiveUrlWarningText,
    confirmationDetails,
    config,
  ]);

  const { question, bodyContent, options, securityWarnings, initialIndex } =
    useMemo<{
      question: React.ReactNode;
      bodyContent: React.ReactNode;
      options: Array<RadioSelectItem<ToolConfirmationOutcome>>;
      securityWarnings: React.ReactNode;
      initialIndex: number;
    }>(() => {
      let bodyContent: React.ReactNode | null = null;
      let securityWarnings: React.ReactNode | null = null;
      let question: React.ReactNode = '';
      const options = getOptions();

      let initialIndex = 0;
      if (isTrustedFolder && allowPermanentApproval) {
        // It is safe to allow permanent approval for info, edit, and mcp tools
        // in trusted folders because the generated policy rules are narrowed
        // to specific files, patterns, or tools (rather than allowing all access).
        const isSafeToPersist =
          confirmationDetails.type === 'info' ||
          confirmationDetails.type === 'edit' ||
          confirmationDetails.type === 'mcp';
        if (
          isSafeToPersist &&
          settings.merged.security.autoAddToPolicyByDefault
        ) {
          const alwaysAndSaveIndex = options.findIndex(
            (o) => o.value === ToolConfirmationOutcome.ProceedAlwaysAndSave,
          );
          if (alwaysAndSaveIndex !== -1) {
            initialIndex = alwaysAndSaveIndex;
          }
        }
      }

      if (deceptiveUrlWarningText) {
        securityWarnings = <WarningMessage text={deceptiveUrlWarningText} />;
      }

      const bodyHeight = availableBodyContentHeight();

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
            availableHeight={bodyHeight}
          />
        );
        return {
          question: '',
          bodyContent,
          options: [],
          securityWarnings: null,
          initialIndex: 0,
        };
      }

      if (confirmationDetails.type === 'exit_plan_mode') {
        bodyContent = (
          <ExitPlanModeDialog
            planPath={confirmationDetails.planPath}
            getPreferredEditor={getPreferredEditor}
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
            availableHeight={bodyHeight}
          />
        );
        return {
          question: '',
          bodyContent,
          options: [],
          securityWarnings: null,
          initialIndex: 0,
        };
      }

      if (confirmationDetails.type === 'edit') {
        if (!confirmationDetails.isModifying) {
          question = `Apply this change?`;
          bodyContent = (
            <>
              <Box
                borderStyle="round"
                borderColor={theme.border.default}
                paddingX={1}
                paddingY={0}
                marginBottom={0}
              >
                <DiffRenderer
                  diffContent={stripUnsafeCharacters(
                    confirmationDetails.fileDiff,
                  )}
                  filename={sanitizeForDisplay(confirmationDetails.fileName)}
                  availableTerminalHeight={
                    bodyHeight !== undefined
                      ? Math.max(bodyHeight - 2, 2)
                      : undefined
                  }
                  terminalWidth={Math.max(terminalWidth, 1) - 4}
                />
              </Box>
            </>
          );
        }
      } else if (confirmationDetails.type === 'sandbox_expansion') {
        const { additionalPermissions, command, rootCommand } =
          confirmationDetails;
        const readPaths = additionalPermissions?.fileSystem?.read || [];
        const writePaths = additionalPermissions?.fileSystem?.write || [];
        const network = additionalPermissions?.network;
        const isShell = isShellTool(toolName);

        const rootCmds = rootCommand
          .split(',')
          .map((c) => c.trim().split(/\s+/)[0])
          .filter((c) => c && !c.startsWith('redirection'));
        const commandNames = Array.from(new Set(rootCmds)).join(', ');
        question = '';

        bodyContent = (
          <>
            <Box
              borderStyle="round"
              borderColor={theme.border.default}
              paddingX={1}
              paddingY={0}
              marginBottom={0}
            >
              {colorizeCode({
                code: command.trim(),
                language: 'bash',
                maxWidth: Math.max(terminalWidth, 1) - 6,
                settings,
                theme: activeTheme,
                hideLineNumbers: true,
                availableHeight:
                  bodyHeight !== undefined
                    ? Math.max(bodyHeight - 2, 2)
                    : undefined,
              })}
            </Box>
            <Box flexDirection="column">
              <Text>
                To run{' '}
                <Text
                  color={isShell ? theme.status.warning : undefined}
                  bold={isShell}
                >
                  [{sanitizeForDisplay(commandNames)}]
                </Text>
                , allow access to the following?
              </Text>
              {network && (
                <Text>
                  <Text color={isShell ? theme.status.warning : undefined} bold>
                    • Network:
                  </Text>{' '}
                  All Urls
                </Text>
              )}
              {writePaths.length > 0 && (
                <Text>
                  <Text color={isShell ? theme.status.warning : undefined} bold>
                    • Write:
                  </Text>{' '}
                  {writePaths.map((p) => sanitizeForDisplay(p)).join(', ')}
                </Text>
              )}
              {readPaths.length > 0 && (
                <Text>
                  <Text color={isShell ? theme.status.warning : undefined} bold>
                    • Read:
                  </Text>{' '}
                  {readPaths.map((p) => sanitizeForDisplay(p)).join(', ')}
                </Text>
              )}
            </Box>
          </>
        );
      } else if (confirmationDetails.type === 'exec') {
        const executionProps = confirmationDetails;
        const isShell = isShellTool(toolName);
        const commandsToDisplay =
          executionProps.commands && executionProps.commands.length > 1
            ? executionProps.commands
            : [executionProps.command];
        const containsRedirection = commandsToDisplay.some((cmd) =>
          hasRedirection(cmd),
        );
        const isAutoEdit =
          config.getApprovalMode() === ApprovalMode.YOLO ||
          config.getApprovalMode() === ApprovalMode.AUTO_EDIT;

        let warnings: React.ReactNode = null;
        if (containsRedirection && !isAutoEdit) {
          const tipText = `To auto-accept, press ${formatCommand(Command.CYCLE_APPROVAL_MODE)}`;
          warnings = (
            <Box flexDirection="column" marginBottom={0}>
              <Text color={theme.text.primary}>
                Redirection detected.{' '}
                <Text color={theme.text.secondary}>{tipText}</Text>
              </Text>
            </Box>
          );
        }

        const commandNames = Array.from(
          new Set(
            commandsToDisplay
              .map((cmd) => cmd.trim().split(/\s+/)[0])
              .filter(Boolean),
          ),
        ).join(', ');

        const allowQuestion = (
          <Text>
            Allow execution of{' '}
            <Text
              color={isShell ? theme.status.warning : undefined}
              bold={isShell}
            >
              [{sanitizeForDisplay(commandNames)}]
            </Text>
            {'?'}
          </Text>
        );

        question = (
          <Box flexDirection="column">
            {allowQuestion}
            {warnings}
          </Box>
        );

        bodyContent = (
          <>
            <Box
              borderStyle="round"
              borderColor={theme.border.default}
              paddingX={1}
              paddingY={0}
              marginBottom={0}
            >
              <MaxSizedBox
                maxHeight={
                  bodyHeight !== undefined
                    ? Math.max(bodyHeight - 2, 2)
                    : undefined
                }
                maxWidth={Math.max(terminalWidth, 1) - 4}
              >
                <Box flexDirection="column">
                  {commandsToDisplay.map((cmd, idx) => (
                    <Box
                      key={idx}
                      flexDirection="column"
                      paddingBottom={idx < commandsToDisplay.length - 1 ? 1 : 0}
                    >
                      {colorizeCode({
                        code: cmd.trim(),
                        language: 'bash',
                        maxWidth: Math.max(terminalWidth, 1) - 6,
                        settings,
                        theme: activeTheme,
                        hideLineNumbers: true,
                        availableHeight:
                          bodyHeight !== undefined
                            ? Math.max(bodyHeight - 2, 2)
                            : undefined,
                      })}
                    </Box>
                  ))}
                </Box>
              </MaxSizedBox>
            </Box>
          </>
        );
      } else if (confirmationDetails.type === 'info') {
        question = `Do you want to proceed?`;
        const infoProps = confirmationDetails;
        const displayUrls =
          infoProps.urls &&
          !(
            infoProps.urls.length === 1 &&
            infoProps.urls[0] === infoProps.prompt
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
        const mcpProps = confirmationDetails;
        question = `Allow execution of MCP tool "${sanitizeForDisplay(mcpProps.toolName)}" from server "${sanitizeForDisplay(mcpProps.serverName)}"?`;

        bodyContent = (
          <Box flexDirection="column">
            <>
              <Text color={theme.text.link}>
                MCP Server: {sanitizeForDisplay(mcpProps.serverName)}
              </Text>
              <Text color={theme.text.link}>
                Tool: {sanitizeForDisplay(mcpProps.toolName)}
              </Text>
            </>
            {hasMcpToolDetails && (
              <Box flexDirection="column" marginTop={1}>
                <Text color={theme.text.primary}>MCP Tool Details:</Text>
                {isMcpToolDetailsExpanded ? (
                  <>
                    <Text color={theme.text.secondary}>
                      (press {expandDetailsHintKey} to collapse MCP tool
                      details)
                    </Text>
                    <Box
                      borderStyle="round"
                      borderColor={theme.border.default}
                      paddingX={1}
                      paddingY={0}
                      marginBottom={0}
                    >
                      {colorizeCode({
                        code: mcpToolDetailsText || '',
                        language: 'json',
                        maxWidth: Math.max(terminalWidth, 1) - 4,
                        settings,
                        theme: activeTheme,
                        hideLineNumbers: true,
                        availableHeight:
                          bodyHeight !== undefined
                            ? Math.max(bodyHeight - 2, 2)
                            : undefined,
                      })}
                    </Box>
                  </>
                ) : (
                  <Text color={theme.text.secondary}>
                    (press {expandDetailsHintKey} to expand MCP tool details)
                  </Text>
                )}
              </Box>
            )}
          </Box>
        );
      }

      return { question, bodyContent, options, securityWarnings, initialIndex };
    }, [
      confirmationDetails,
      getOptions,
      availableBodyContentHeight,
      terminalWidth,
      handleConfirm,
      deceptiveUrlWarningText,
      isMcpToolDetailsExpanded,
      hasMcpToolDetails,
      mcpToolDetailsText,
      expandDetailsHintKey,
      getPreferredEditor,
      isTrustedFolder,
      allowPermanentApproval,
      settings,
      activeTheme,
      config,
      toolName,
    ]);

  const bodyOverflowDirection: 'top' | 'bottom' =
    confirmationDetails.type === 'mcp' && isMcpToolDetailsExpanded
      ? 'bottom'
      : 'top';

  const renderRadioItem = useCallback(
    (
      item: RadioSelectItem<ToolConfirmationOutcome>,
      { titleColor }: { titleColor: string },
    ) => {
      if (item.value === ToolConfirmationOutcome.ProceedAlwaysAndSave) {
        return (
          <Text color={titleColor} wrap="truncate">
            {item.label}{' '}
            <Text color={theme.text.secondary}>
              ~/.gemini/policies/auto-saved.toml
            </Text>
          </Text>
        );
      }
      return (
        <Text color={titleColor} wrap="truncate">
          {item.label}
        </Text>
      );
    },
    [],
  );

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
    <Box flexDirection="column" paddingTop={0} paddingBottom={0}>
      {!!confirmationDetails.systemMessage && (
        <Box marginBottom={1}>
          <Text color={theme.status.warning}>
            {confirmationDetails.systemMessage}
          </Text>
        </Box>
      )}

      {handlesOwnUI ? (
        bodyContent
      ) : (
        <>
          <Box
            flexShrink={1}
            overflow="hidden"
            marginBottom={!question && !securityWarnings ? 1 : 0}
          >
            <MaxSizedBox
              maxHeight={availableBodyContentHeight()}
              maxWidth={terminalWidth}
              overflowDirection={bodyOverflowDirection}
            >
              {bodyContent}
            </MaxSizedBox>
          </Box>

          {securityWarnings && (
            <Box
              flexShrink={0}
              marginBottom={1}
              ref={onSecurityWarningsRefChange}
            >
              {securityWarnings}
            </Box>
          )}

          {!!question && (
            <Box marginBottom={1} flexShrink={0}>
              {typeof question === 'string' ? (
                <Text color={theme.text.primary}>{question}</Text>
              ) : (
                question
              )}
            </Box>
          )}

          <Box flexShrink={0}>
            <RadioButtonSelect
              items={options}
              onSelect={handleSelect}
              isFocused={isFocused}
              initialIndex={initialIndex}
              renderItem={renderRadioItem}
            />
          </Box>
        </>
      )}
    </Box>
  );
};
