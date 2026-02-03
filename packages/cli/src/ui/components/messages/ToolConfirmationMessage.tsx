/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useMemo, useCallback, useState } from 'react';
import { Box, Text } from 'ink';
import { DiffRenderer } from './DiffRenderer.js';
import { RenderInline } from '../../utils/InlineMarkdownRenderer.js';
import {
  type SerializableConfirmationDetails,
  type ToolCallConfirmationDetails,
  type Config,
  type ToolConfirmationPayload,
  type ApprovalScope,
  type ScopeOption,
  ToolConfirmationOutcome,
  hasRedirection,
  debugLogger,
  generateScopeOptions,
  getRecommendedScope,
  shouldPersist,
} from '@google/gemini-cli-core';
import type { RadioSelectItem } from '../shared/RadioButtonSelect.js';
import { useToolActions } from '../../contexts/ToolActionsContext.js';
import { RadioButtonSelect } from '../shared/RadioButtonSelect.js';
import { MaxSizedBox, MINIMUM_MAX_HEIGHT } from '../shared/MaxSizedBox.js';
import { sanitizeForDisplay } from '../../utils/textUtils.js';
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

type ExecOptionValue =
  | ToolConfirmationOutcome
  | `scope:${ApprovalScope}`
  | 'more-options'
  | 'back';

/**
 * Helper function to build radio select items for scope options.
 * Adds "(recommended)" suffix to the recommended scope option.
 */
function buildScopeOptionItems(
  scopeOptions: ScopeOption[],
  recommendedScope: ApprovalScope,
): Array<RadioSelectItem<ExecOptionValue>> {
  return scopeOptions.map((scopeOpt) => {
    const isRecommended = scopeOpt.id === recommendedScope;
    const label = isRecommended
      ? `${scopeOpt.label} (recommended)`
      : scopeOpt.label;

    return {
      label,
      value: `scope:${scopeOpt.id}` as ExecOptionValue,
      key: `scope:${scopeOpt.id}`,
    };
  });
}

/**
 * Finds the full command that matches the given root command.
 * Used to map root commands (like "git") to full commands (like "git status").
 */
function findMatchingCommand(commands: string[], rootCommand: string): string {
  return (
    commands.find((cmd: string) =>
      cmd.trim().toLowerCase().startsWith(rootCommand.toLowerCase()),
    ) || commands[0]
  );
}

/**
 * Checks if confirmation details represent compound commands (multiple commands chained).
 */
function isCompoundCommand(
  confirmationDetails:
    | ToolCallConfirmationDetails
    | SerializableConfirmationDetails,
): boolean {
  return (
    confirmationDetails.type === 'exec' &&
    confirmationDetails.rootCommands.length > 1
  );
}

/**
 * Checks if any command in the list is dangerous (restricted to exact-only scope).
 * Dangerous commands only have one scope option (exact), indicating high risk.
 */
function hasAnyDangerousCommand(commands: string[]): boolean {
  return commands.some((cmd: string) => {
    const scopeOptions = generateScopeOptions(cmd);
    // Dangerous commands only allow exact scope (length === 1)
    return scopeOptions.length === 1;
  });
}

/**
 * Handles scope selection in expanded mode for per-command configuration.
 * @returns True if the selection was handled, false to continue processing
 */
function handleExpandedModeSelection(
  scope: ApprovalScope,
  confirmationDetails: Extract<
    SerializableConfirmationDetails,
    { type: 'exec' }
  >,
  expandedMode: boolean,
  currentCommandIndex: number,
  selectedScopes: Record<string, ApprovalScope>,
  setSelectedScopes: (scopes: Record<string, ApprovalScope>) => void,
  setCurrentCommandIndex: (index: number) => void,
  handleConfirm: (
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
  ) => void,
): boolean {
  if (!expandedMode || confirmationDetails.rootCommands.length <= 1) {
    return false;
  }

  const commands = confirmationDetails.commands || [
    confirmationDetails.command,
  ];
  const rootCommands = confirmationDetails.rootCommands;
  const currentRootCmd = rootCommands[currentCommandIndex];
  const currentCmd = findMatchingCommand(commands, currentRootCmd);

  const newSelectedScopes = {
    ...selectedScopes,
    [currentCmd]: scope,
  };
  setSelectedScopes(newSelectedScopes);

  // Move to next command or finish
  if (currentCommandIndex < rootCommands.length - 1) {
    setCurrentCommandIndex(currentCommandIndex + 1);
    return true;
  }

  // All commands configured - submit with per-command scopes.
  // Only persist if ALL commands are safe to persist (prevents auto-persisting dangerous commands).
  const shouldPersistApproval = commands.every((cmd: string) =>
    shouldPersist(cmd),
  );

  handleConfirm(ToolConfirmationOutcome.ProceedAlways, {
    commandScopes: newSelectedScopes,
    persist: shouldPersistApproval,
    compoundCommands: commands,
  });
  return true;
}

/**
 * Builds the payload for single or uniform compound command scope selection.
 */
function buildScopePayload(
  confirmationDetails: Extract<
    SerializableConfirmationDetails,
    { type: 'exec' }
  >,
  scope: ApprovalScope,
): ToolConfirmationPayload {
  const isCompound = confirmationDetails.rootCommands.length > 1;
  const shouldPersistApproval = shouldPersist(confirmationDetails.rootCommand);

  if (isCompound) {
    // For compound commands, apply uniform scope to all commands
    return {
      scope,
      persist: shouldPersistApproval,
      compoundCommands: confirmationDetails.commands || [
        confirmationDetails.command,
      ],
    };
  }

  // For single commands, check for custom pattern
  const scopeOptions = generateScopeOptions(confirmationDetails.command);
  const selectedOption = scopeOptions.find(
    (opt: ScopeOption) => opt.id === scope,
  );
  const customPattern = selectedOption?.pattern?.startsWith('^')
    ? selectedOption.pattern
    : undefined;

  return {
    scope: customPattern ? 'custom' : scope,
    customPattern,
    persist: shouldPersistApproval,
  };
}

/**
 * Builds radio select options for compound commands based on current mode.
 */
function buildCompoundCommandOptions(
  commands: string[],
  rootCommands: string[],
  expandedMode: boolean,
  currentCommandIndex: number,
): Array<RadioSelectItem<ExecOptionValue>> {
  const options: Array<RadioSelectItem<ExecOptionValue>> = [];

  if (expandedMode) {
    // Expanded mode: per-command scope selection
    const currentRootCmd = rootCommands[currentCommandIndex];
    const currentCmd = findMatchingCommand(commands, currentRootCmd);
    const scopeOptions = generateScopeOptions(currentCmd);
    const recommendedScope = getRecommendedScope(currentCmd);

    // Header
    const stepLabel = `Step ${currentCommandIndex + 1}/${rootCommands.length}: ${currentRootCmd}`;
    options.push({
      label: `━━━ ${stepLabel} ━━━`,
      value: 'back' as ExecOptionValue,
      key: 'header',
      disabled: true,
    });

    // Scope options
    options.push(...buildScopeOptionItems(scopeOptions, recommendedScope));

    // Back option
    options.push({
      label: '← Back to simple options',
      value: 'back' as ExecOptionValue,
      key: 'back',
    });
  } else {
    // Non-expanded mode: tiered uniform scope options
    const hasDangerousCmd = hasAnyDangerousCommand(commands);

    // Always offer exact scope
    options.push({
      label: `Allow each exactly (${rootCommands.join(', ')})`,
      value: 'scope:exact' as ExecOptionValue,
      key: 'scope:exact',
    });

    if (!hasDangerousCmd) {
      // Offer broadest scope
      const isReadOnly = commands.every(
        (cmd: string) => getRecommendedScope(cmd) === 'command-only',
      );
      const cmdOnlyLabel = `Allow by command (${rootCommands.join(', ')} *)`;

      options.push({
        label: isReadOnly ? `${cmdOnlyLabel} (recommended)` : cmdOnlyLabel,
        value: 'scope:command-only' as ExecOptionValue,
        key: 'scope:command-only',
      });

      // More options
      options.push({
        label: 'More options...',
        value: 'more-options' as ExecOptionValue,
        key: 'more-options',
      });
    }
  }

  return options;
}

export interface ToolConfirmationMessageProps {
  callId: string;
  confirmationDetails:
    | ToolCallConfirmationDetails
    | SerializableConfirmationDetails;
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

  // State for per-command scope selection (compound commands)
  const [expandedMode, setExpandedMode] = useState(false);
  const [currentCommandIndex, setCurrentCommandIndex] = useState(0);
  const [selectedScopes, setSelectedScopes] = useState<
    Record<string, ApprovalScope>
  >({});

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

  type ExecOptionValue =
    | ToolConfirmationOutcome
    | `scope:${ApprovalScope}`
    | 'more-options'
    | 'back';

  const handleSelect = useCallback(
    (item: ToolConfirmationOutcome | string) => {
      // Handle mode transitions
      if (item === 'more-options') {
        setExpandedMode(true);
        setCurrentCommandIndex(0);
        setSelectedScopes({});
        return;
      }

      if (item === 'back') {
        setExpandedMode(false);
        setCurrentCommandIndex(0);
        setSelectedScopes({});
        return;
      }

      // Handle scope selections
      if (typeof item === 'string' && item.startsWith('scope:')) {
        const scope = item.replace('scope:', '') as ApprovalScope;

        if (confirmationDetails.type === 'exec') {
          // Delegate to expanded mode handler
          const handled = handleExpandedModeSelection(
            scope,
            confirmationDetails,
            expandedMode,
            currentCommandIndex,
            selectedScopes,
            setSelectedScopes,
            setCurrentCommandIndex,
            handleConfirm,
          );

          if (handled) return;

          // Non-expanded mode: single or uniform compound scope
          const payload = buildScopePayload(confirmationDetails, scope);
          handleConfirm(ToolConfirmationOutcome.ProceedAlways, payload);
          return;
        }
      }

      // Handle standard outcomes
      handleConfirm(item as ToolConfirmationOutcome);
    },
    [
      handleConfirm,
      confirmationDetails,
      expandedMode,
      currentCommandIndex,
      selectedScopes,
    ],
  );

  const getOptions = useCallback(() => {
    const options: Array<RadioSelectItem<ExecOptionValue>> = [];

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
        const commands = confirmationDetails.commands || [
          confirmationDetails.command,
        ];

        if (isCompoundCommand(confirmationDetails)) {
          // Compound commands: use extracted helper
          options.push(
            ...buildCompoundCommandOptions(
              commands,
              confirmationDetails.rootCommands,
              expandedMode,
              currentCommandIndex,
            ),
          );
        } else {
          // Single commands: offer scope selection
          const fullCommand = confirmationDetails.command;
          const scopeOptions = generateScopeOptions(fullCommand);
          const recommendedScope = getRecommendedScope(fullCommand);

          options.push(
            ...buildScopeOptionItems(scopeOptions, recommendedScope),
          );
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
    expandedMode,
    currentCommandIndex,
  ]);

  const availableBodyContentHeight = useCallback(() => {
    if (availableTerminalHeight === undefined) {
      return undefined;
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
  }, [availableTerminalHeight, getOptions]);

  const { question, bodyContent, options } = useMemo(() => {
    let bodyContent: React.ReactNode | null = null;
    let question = '';
    const options = getOptions();

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
      return { question: '', bodyContent, options: [] };
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
      return { question: '', bodyContent, options: [] };
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
      const mcpProps = confirmationDetails;
      question = `Allow execution of MCP tool "${mcpProps.toolName}" from server "${mcpProps.serverName}"?`;
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

      const willPersist =
        isTrustedFolder && shouldPersist(executionProps.rootCommand);
      const isCompoundCommand = executionProps.rootCommands.length > 1;

      // Generate hint based on mode
      let hintText: string;
      if (expandedMode && isCompoundCommand) {
        const configuredCount = Object.keys(selectedScopes).length;
        hintText = `💡 Configuring scope for each command (${configuredCount}/${executionProps.rootCommands.length} done)`;
      } else if (isCompoundCommand) {
        hintText = '💡 Will approve all commands in this chain';
      } else if (willPersist) {
        hintText = '💡 Read-only command - will be saved for future sessions';
      } else {
        hintText = '💡 Will apply for this session only';
      }

      const persistenceHint = isTrustedFolder ? (
        <Box marginTop={1}>
          <Text color={theme.border.default} dimColor>
            {hintText}
          </Text>
        </Box>
      ) : null;

      bodyContent = (
        <Box flexDirection="column">
          <MaxSizedBox
            maxHeight={bodyContentHeight}
            maxWidth={Math.max(terminalWidth, 1)}
          >
            <Box flexDirection="column">
              {commandsToDisplay.map((cmd, idx) => {
                // In expanded mode, highlight the current command
                const isCurrent = expandedMode && idx === currentCommandIndex;
                const isConfigured =
                  expandedMode && selectedScopes[cmd] !== undefined;
                const prefix = isCurrent ? '► ' : isConfigured ? '✓ ' : '  ';
                return (
                  <Text
                    key={idx}
                    color={isCurrent ? theme.status.success : theme.text.link}
                    bold={isCurrent}
                  >
                    {expandedMode ? prefix : ''}
                    {sanitizeForDisplay(cmd)}
                    {isConfigured ? ` [${selectedScopes[cmd]}]` : ''}
                  </Text>
                );
              })}
            </Box>
          </MaxSizedBox>
          {warnings}
          {persistenceHint}
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
    } else if (confirmationDetails.type === 'mcp') {
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
    getOptions,
    availableBodyContentHeight,
    terminalWidth,
    handleConfirm,
    isTrustedFolder,
    expandedMode,
    currentCommandIndex,
    selectedScopes,
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
