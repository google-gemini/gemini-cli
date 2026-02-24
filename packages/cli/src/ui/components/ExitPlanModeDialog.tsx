/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import {
  ApprovalMode,
  validatePlanPath,
  validatePlanContent,
  QuestionType,
  type Config,
  processSingleFileContent,
  coreEvents,
  openFileInEditor,
  IdeClient,
  debugLogger,
  isValidEditorType,
} from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { AskUserDialog } from './AskUserDialog.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { KeypressPriority } from '../contexts/KeypressContext.js';
import { Command, keyMatchers } from '../keyMatchers.js';

export interface ExitPlanModeDialogProps {
  planPath: string;
  onApprove: (approvalMode: ApprovalMode, planModified: boolean) => void;
  onFeedback: (feedback: string, planModified: boolean) => void;
  onCancel: () => void;
  width: number;
  availableHeight?: number;
}

enum PlanStatus {
  Loading = 'loading',
  Loaded = 'loaded',
  Error = 'error',
}

interface PlanContentState {
  status: PlanStatus;
  content?: string;
  error?: string;
  reload: () => void;
}

enum ApprovalOption {
  Auto = 'Yes, automatically accept edits',
  Manual = 'Yes, manually accept edits',
}

/**
 * A tiny component for loading and error states with consistent styling.
 */
const StatusMessage: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => <Box paddingX={1}>{children}</Box>;

function usePlanContent(planPath: string, config: Config): PlanContentState {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<Omit<PlanContentState, 'reload'>>({
    status: PlanStatus.Loading,
  });

  const reload = useCallback(() => {
    setNonce((n) => n + 1);
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
  }, [planPath, config, nonce]);

  return useMemo(() => ({ ...state, reload }), [state, reload]);
}

export const ExitPlanModeDialog: React.FC<ExitPlanModeDialogProps> = ({
  planPath,
  onApprove,
  onFeedback,
  onCancel,
  width,
  availableHeight,
}) => {
  const config = useConfig();
  const settings = useSettings();
  const planState = usePlanContent(planPath, config);
  const [showLoading, setShowLoading] = useState(false);
  const [isModified, setIsModified] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
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

  const performOpenInEditor = useCallback(async () => {
    if (isEditing) return;
    setIsEditing(true);
    try {
      const ideClient = await IdeClient.getInstance();
      const preferredEditorRaw = settings.merged.general.preferredEditor;
      const preferredEditor =
        typeof preferredEditorRaw === 'string' &&
        isValidEditorType(preferredEditorRaw)
          ? preferredEditorRaw
          : undefined;

      const result = await openFileInEditor(planPath, {
        preferredEditor,
        ideClient,
        readTextFile: (path: string) =>
          config.getFileSystemService().readTextFile(path),
        writeTextFile: (path, content) =>
          config.getFileSystemService().writeTextFile(path, content),
      });

      if (result.modified) {
        setIsModified(true);
        planState.reload();
      }
    } catch (err) {
      coreEvents.emitFeedback(
        'error',
        '[ExitPlanModeDialog] external editor error',
        err,
      );
    } finally {
      setIsEditing(false);
    }
  }, [
    isEditing,
    settings.merged.general.preferredEditor,
    planPath,
    config,
    planState,
  ]);

  const handleOpenInEditor = useCallback(() => {
    void performOpenInEditor();
  }, [performOpenInEditor]);

  const syncIde = useCallback(
    async (outcome: 'accepted' | 'rejected') => {
      try {
        const ideClient = await IdeClient.getInstance();
        if (ideClient.isDiffingEnabled()) {
          await ideClient.resolveDiffFromCli(planPath, outcome);
        }
      } catch (err) {
        debugLogger.error('ExitPlanModeDialog: IDE sync failed:', err);
      }
    },
    [planPath],
  );

  useKeypress(
    (key) => {
      if (keyMatchers[Command.OPEN_PLAN_IN_EDITOR](key)) {
        handleOpenInEditor();
        return true;
      }
      return false;
    },
    {
      isActive: planState.status === PlanStatus.Loaded && !isEditing,
      priority: KeypressPriority.Critical,
    },
  );

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

  return (
    <Box flexDirection="column" width={width}>
      <AskUserDialog
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
          // Sync IDE state first
          void syncIde('accepted');

          if (answer === ApprovalOption.Auto) {
            onApprove(ApprovalMode.AUTO_EDIT, isModified);
          } else if (answer === ApprovalOption.Manual) {
            onApprove(ApprovalMode.DEFAULT, isModified);
          } else if (answer) {
            onFeedback(answer, isModified);
          }
        }}
        onCancel={() => {
          void syncIde('rejected');
          onCancel();
        }}
        width={width}
        availableHeight={availableHeight}
        extraFooterActions={['Ctrl+X to open in editor']}
      />
    </Box>
  );
};
