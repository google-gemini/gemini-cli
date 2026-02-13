/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import {
  ApprovalMode,
  validatePlanPath,
  validatePlanContent,
  QuestionType,
  type Config,
  processSingleFileContent,
} from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { AskUserDialog } from './AskUserDialog.js';

export interface ExitPlanModeDialogProps {
  planPath: string;
  recommendedApprovalMode?: ApprovalMode;
  recommendationReason?: string;
  deepWorkEnabled?: boolean;
  onApprove: (approvalMode: ApprovalMode) => void;
  onFeedback: (feedback: string) => void;
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
}

enum ApprovalOption {
  DeepWork = 'Yes, start Deep Work execution',
  Auto = 'Yes, automatically accept edits',
  Manual = 'Yes, manually accept edits',
}

const DEEP_WORK_SIGNALS = [
  'iterate',
  'iteration',
  'loop',
  'phases',
  'phase',
  'refactor',
  'migrate',
  'end-to-end',
  'e2e',
  'comprehensive',
  'cross-cutting',
  'multi-step',
  'verification',
  'test suite',
];

function recommendApprovalModeFromPlan(
  planContent: string,
  deepWorkEnabled: boolean,
): ApprovalMode {
  if (!deepWorkEnabled) {
    return ApprovalMode.AUTO_EDIT;
  }

  const normalized = planContent.toLowerCase();
  const stepCount = (normalized.match(/^\s*\d+\.\s+/gm) ?? []).length;
  const signalCount = DEEP_WORK_SIGNALS.filter((signal) =>
    normalized.includes(signal),
  ).length;

  if (
    stepCount >= 6 ||
    (stepCount >= 4 && signalCount >= 2) ||
    signalCount >= 4
  ) {
    return ApprovalMode.DEEP_WORK;
  }

  return ApprovalMode.AUTO_EDIT;
}

/**
 * A tiny component for loading and error states with consistent styling.
 */
const StatusMessage: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => <Box paddingX={1}>{children}</Box>;

function usePlanContent(planPath: string, config: Config): PlanContentState {
  const [state, setState] = useState<PlanContentState>({
    status: PlanStatus.Loading,
  });

  useEffect(() => {
    let ignore = false;
    setState({ status: PlanStatus.Loading });

    const load = async () => {
      try {
        const pathError = await validatePlanPath(
          planPath,
          config.storage.getProjectTempPlansDir(),
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
          config.storage.getProjectTempPlansDir(),
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
  }, [planPath, config]);

  return state;
}

export const ExitPlanModeDialog: React.FC<ExitPlanModeDialogProps> = ({
  planPath,
  recommendedApprovalMode,
  recommendationReason,
  deepWorkEnabled = false,
  onApprove,
  onFeedback,
  onCancel,
  width,
  availableHeight,
}) => {
  const config = useConfig();
  const planState = usePlanContent(planPath, config);
  const [showLoading, setShowLoading] = useState(false);

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

  const computedRecommendation = recommendApprovalModeFromPlan(
    planContent,
    deepWorkEnabled,
  );
  const effectiveRecommendation =
    recommendedApprovalMode === ApprovalMode.DEEP_WORK && deepWorkEnabled
      ? ApprovalMode.DEEP_WORK
      : recommendedApprovalMode === ApprovalMode.AUTO_EDIT
        ? ApprovalMode.AUTO_EDIT
        : computedRecommendation;

  const approvalOptions = deepWorkEnabled
    ? effectiveRecommendation === ApprovalMode.DEEP_WORK
      ? [
          {
            label: `${ApprovalOption.DeepWork} (Recommended)`,
            description:
              'Approves plan and uses iterative Deep Work execution with readiness checks.',
          },
          {
            label: ApprovalOption.Auto,
            description:
              'Approves plan and runs regular implementation with automatic edits.',
          },
          {
            label: ApprovalOption.Manual,
            description:
              'Approves plan but requires confirmation before each tool call.',
          },
        ]
      : [
          {
            label: `${ApprovalOption.Auto} (Recommended)`,
            description:
              'Approves plan and runs regular implementation with automatic edits.',
          },
          {
            label: ApprovalOption.DeepWork,
            description:
              'Approves plan and uses iterative Deep Work execution with readiness checks.',
          },
          {
            label: ApprovalOption.Manual,
            description:
              'Approves plan but requires confirmation before each tool call.',
          },
        ]
    : [
        {
          label: ApprovalOption.Auto,
          description: 'Approves plan and allows tools to run automatically.',
        },
        {
          label: ApprovalOption.Manual,
          description: 'Approves plan but requires confirmation for each tool.',
        },
      ];

  const recommendationText =
    recommendationReason && recommendationReason.trim().length > 0
      ? recommendationReason.trim()
      : effectiveRecommendation === ApprovalMode.DEEP_WORK
        ? 'Recommendation: Deep Work execution for iterative implementation.'
        : 'Recommendation: Regular execution.';
  const promptWithRecommendation = `${recommendationText}\n\n${planContent}`;

  return (
    <Box flexDirection="column" width={width}>
      <AskUserDialog
        questions={[
          {
            type: QuestionType.CHOICE,
            header: 'Approval',
            question: promptWithRecommendation,
            options: approvalOptions,
            placeholder: 'Type your feedback...',
            multiSelect: false,
          },
        ]}
        onSubmit={(answers) => {
          const answer = answers['0'];
          if (answer?.startsWith(ApprovalOption.DeepWork)) {
            onApprove(ApprovalMode.DEEP_WORK);
          } else if (answer?.startsWith(ApprovalOption.Auto)) {
            onApprove(ApprovalMode.AUTO_EDIT);
          } else if (answer?.startsWith(ApprovalOption.Manual)) {
            onApprove(ApprovalMode.DEFAULT);
          } else if (answer) {
            onFeedback(answer);
          }
        }}
        onCancel={onCancel}
        width={width}
        availableHeight={availableHeight}
      />
    </Box>
  );
};
