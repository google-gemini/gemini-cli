/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useMemo } from 'react';
import {
  type Question,
  QuestionType,
  ApprovalMode,
} from '@google/gemini-cli-core';
import { AskUserDialog } from './AskUserDialog.js';

interface PlanApprovalDialogProps {
  planContent?: string;
  onApprove: (mode: ApprovalMode) => void;
  onFeedback: (feedback: string) => void;
  onCancel: () => void;
}

const APPROVE_MANUAL_OPTION = 'Yes, manually accept edits';
const APPROVE_AUTO_OPTION = 'Yes, automatically accept edits';

export const PlanApprovalDialog: React.FC<PlanApprovalDialogProps> = ({
  planContent,
  onApprove,
  onFeedback,
  onCancel,
}) => {
  const questions = useMemo(
    (): Question[] => [
      {
        question: 'Ready to start implementation?',
        header: 'Plan',
        type: QuestionType.CHOICE,
        options: [
          {
            label: APPROVE_AUTO_OPTION,
            description: '',
          },
          {
            label: APPROVE_MANUAL_OPTION,
            description: '',
          },
        ],
        content: planContent,
        customOptionPlaceholder: 'Provide feedback...',
      },
    ],
    [planContent],
  );

  const handleSubmit = useCallback(
    (answers: { [questionIndex: string]: string }) => {
      const answer = answers['0'];
      if (answer === APPROVE_MANUAL_OPTION) {
        onApprove(ApprovalMode.DEFAULT);
      } else if (answer === APPROVE_AUTO_OPTION) {
        onApprove(ApprovalMode.AUTO_EDIT);
      } else if (answer) {
        onFeedback(answer);
      }
    },
    [onApprove, onFeedback],
  );

  return (
    <AskUserDialog
      questions={questions}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    />
  );
};
