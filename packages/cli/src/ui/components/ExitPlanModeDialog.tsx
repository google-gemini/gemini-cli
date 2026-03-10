/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState, useCallback } from 'react';
import { Box, Text, useStdin } from 'ink';
import {
  ApprovalMode,
  validatePlanPath,
  validatePlanContent,
  QuestionType,
  type Config,
  type EditorType,
  processSingleFileContent,
  debugLogger,
} from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { useSettingsStore } from '../contexts/SettingsContext.js';
import { SettingScope } from '../../config/settings.js';
import { AskUserDialog } from './AskUserDialog.js';
import { openFileInEditor } from '../utils/editorUtils.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { Command } from '../key/keyMatchers.js';
import { formatCommand } from '../key/keybindingUtils.js';
import { useKeyMatchers } from '../hooks/useKeyMatchers.js';

export interface ExitPlanModeDialogProps {
  planPath: string;
  onApprove: (approvalMode: ApprovalMode, clearConversation?: boolean) => void;
  onFeedback: (feedback: string) => void;
  onCancel: () => void;
  getPreferredEditor: () => EditorType | undefined;
  width: number;
  availableHeight?: number;
}

enum PlanStatus {
  Loading = 'loading',
  Loaded = 'loaded',
  Error = 'error',
}

enum ApprovalStep {
  PLAN_APPROVAL = 'plan_approval',
  CONTEXT_CHOICE = 'context_choice',
}

interface PlanContentState {
  status: PlanStatus;
  content?: string;
  error?: string;
  refresh: () => void;
}

enum ApprovalOption {
  Auto = 'Yes, automatically accept edits',
  Manual = 'Yes, manually accept edits',
}

enum ContextOption {
  Once = 'Allow once',
  Session = 'Allow for this session',
  Always = 'Allow for all future sessions',
  No = 'No',
}

/**
 * A tiny component for loading and error states with consistent styling.
 */
const StatusMessage: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => <Box paddingX={1}>{children}</Box>;

function usePlanContent(planPath: string, config: Config): PlanContentState {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<Omit<PlanContentState, 'refresh'>>({
    status: PlanStatus.Loading,
  });

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let ignore = false;
    setState({ status: PlanStatus.Loading });

    const load = async () => {
      try {
        const pathError = await validatePlanPath(
          planPath,
          config.storage.getPlansDir(),
          config.getTargetDir(),
        );
        if (ignore) return;
        if (pathError) {
          setState({ status: PlanStatus.Error, error: pathError });
          return;
        }

        const contentError = await validatePlanContent(planPath);
        if (ignore) return;
        if (contentError) {
          setState({ status: PlanStatus.Error, error: contentError });
          return;
        }

        const result = await processSingleFileContent(
          planPath,
          config.storage.getPlansDir(),
          config.getFileSystemService(),
        );

        if (ignore) return;

        if (result.error) {
          setState({ status: PlanStatus.Error, error: result.error });
          return;
        }

        if (typeof result.llmContent !== 'string') {
          setState({
            status: PlanStatus.Error,
            error: 'Plan file format not supported (binary or image).',
          });
          return;
        }

        const content = result.llmContent;
        if (!content) {
          setState({ status: PlanStatus.Error, error: 'Plan file is empty.' });
          return;
        }
        setState({ status: PlanStatus.Loaded, content });
      } catch (err: unknown) {
        if (ignore) return;
        const errorMessage = err instanceof Error ? err.message : String(err);
        setState({ status: PlanStatus.Error, error: errorMessage });
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [planPath, config, version]);

  return { ...state, refresh };
}

export const ExitPlanModeDialog: React.FC<ExitPlanModeDialogProps> = ({
  planPath,
  onApprove,
  onFeedback,
  onCancel,
  getPreferredEditor,
  width,
  availableHeight,
}) => {
  const keyMatchers = useKeyMatchers();
  const config = useConfig();
  const { stdin, setRawMode } = useStdin();
  const planState = usePlanContent(planPath, config);
  const { refresh } = planState;
  const [showLoading, setShowLoading] = useState(false);
  const [step, setStep] = useState<ApprovalStep>(ApprovalStep.PLAN_APPROVAL);
  const [selectedApprovalMode, setSelectedApprovalMode] =
    useState<ApprovalMode | null>(null);
  const [pendingApproval, setPendingApproval] = useState<{
    mode: ApprovalMode;
    clear: boolean;
  } | null>(null);
  const { settings, setSetting } = useSettingsStore();

  useEffect(() => {
    if (pendingApproval) {
      onApprove(pendingApproval.mode, pendingApproval.clear);
    }
  }, [pendingApproval, onApprove]);

  const handleOpenEditor = useCallback(async () => {
    try {
      await openFileInEditor(planPath, stdin, setRawMode, getPreferredEditor());

      onFeedback(
        'I have edited the plan or annotated it with feedback. Review the edited plan, update if necessary, and present it again for approval.',
      );
      refresh();
    } catch (err) {
      debugLogger.error('Failed to open plan in editor:', err);
    }
  }, [planPath, stdin, setRawMode, getPreferredEditor, refresh, onFeedback]);

  useKeypress(
    (key) => {
      if (keyMatchers[Command.OPEN_EXTERNAL_EDITOR](key)) {
        void handleOpenEditor();
        return true;
      }
      return false;
    },
    { isActive: true, priority: true },
  );

  useEffect(() => {
    if (planState.status !== PlanStatus.Loading) {
      setShowLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowLoading(true);
    }, 200);

    return () => clearTimeout(timer);
  }, [planState.status]);

  if (planState.status === PlanStatus.Loading) {
    if (!showLoading) {
      return null;
    }

    return (
      <StatusMessage>
        <Text color={theme.text.secondary} italic>
          Loading plan...
        </Text>
      </StatusMessage>
    );
  }

  if (planState.status === PlanStatus.Error) {
    return (
      <StatusMessage>
        <Text color={theme.status.error}>
          Error reading plan: {planState.error}
        </Text>
      </StatusMessage>
    );
  }

  const planContent = planState.content?.trim();
  if (!planContent) {
    return (
      <StatusMessage>
        <Text color={theme.status.error}>Error: Plan content is empty.</Text>
      </StatusMessage>
    );
  }

  const editHint = formatCommand(Command.OPEN_EXTERNAL_EDITOR);

  if (step === ApprovalStep.PLAN_APPROVAL) {
    return (
      <Box flexDirection="column" width={width}>
        <AskUserDialog
          key="plan-approval"
          questions={[
            {
              type: QuestionType.CHOICE,
              header: 'Approval',
              question: planContent,
              options: [
                {
                  label: ApprovalOption.Auto,
                  description:
                    'Approves plan and allows tools to run automatically',
                },
                {
                  label: ApprovalOption.Manual,
                  description:
                    'Approves plan but requires confirmation for each tool',
                },
              ],
              placeholder: 'Type your feedback...',
              multiSelect: false,
            },
          ]}
          onSubmit={(answers) => {
            const answer = answers['0'];
            let nextMode: ApprovalMode | null = null;
            if (answer === ApprovalOption.Auto) {
              nextMode = ApprovalMode.AUTO_EDIT;
            } else if (answer === ApprovalOption.Manual) {
              nextMode = ApprovalMode.DEFAULT;
            } else if (answer) {
              onFeedback(answer);
              return;
            }

            if (nextMode) {
              const sessionOverride =
                config.getClearContextOnPlanApprovalSessionOverride();
              const persistentSetting =
                settings.merged.general?.plan?.clearContextOnApproval;
              const clearContext = sessionOverride ?? persistentSetting;

              if (clearContext !== undefined) {
                onApprove(nextMode, clearContext);
              } else {
                setSelectedApprovalMode(nextMode);
                setStep(ApprovalStep.CONTEXT_CHOICE);
              }
            }
          }}
          onCancel={onCancel}
          width={width}
          availableHeight={availableHeight}
          extraParts={[`${editHint} to edit plan`]}
        />
      </Box>
    );
  }

  if (step === ApprovalStep.CONTEXT_CHOICE) {
    return (
      <Box flexDirection="column" width={width}>
        <AskUserDialog
          key="context-choice"
          questions={[
            {
              type: QuestionType.CHOICE,
              header: 'Context',
              question:
                'Clear conversation context before implementing? (Keeps pre-plan history)',
              options: [
                {
                  label: ContextOption.Once,
                  description: 'Clear context this time only',
                },
                {
                  label: ContextOption.Session,
                  description: 'Clear context for this entire session',
                },
                {
                  label: ContextOption.Always,
                  description: 'Always clear context on plan approval',
                },
                { label: ContextOption.No, description: 'Keep context' },
              ],
              multiSelect: false,
              allowCustomOption: false,
              unconstrainedHeight: false,
            },
          ]}
          onSubmit={(answers) => {
            const answer = answers['0'];
            let clearConversation = false;

            if (answer === ContextOption.Once) {
              clearConversation = true;
            } else if (answer === ContextOption.Session) {
              clearConversation = true;
              config.setClearContextOnPlanApprovalSessionOverride(true);
            } else if (answer === ContextOption.Always) {
              clearConversation = true;
              setSetting(
                SettingScope.User,
                'general.plan.clearContextOnApproval',
                true,
              );
            } else if (answer === ContextOption.No) {
              clearConversation = false;
              setSetting(
                SettingScope.User,
                'general.plan.clearContextOnApproval',
                false,
              );
            }

            if (selectedApprovalMode) {
              setPendingApproval({
                mode: selectedApprovalMode,
                clear: clearConversation,
              });
            }
          }}
          onCancel={() => setStep(ApprovalStep.PLAN_APPROVAL)}
          width={width}
          availableHeight={availableHeight}
          extraParts={[`${editHint} to edit plan`]}
        />
      </Box>
    );
  }

  return null;
};
