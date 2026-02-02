/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  useContext,
} from 'react';
import { Box, Text } from 'ink';
import * as fs from 'node:fs';
import { ApprovalMode } from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import { MarkdownDisplay } from '../utils/MarkdownDisplay.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { TextInput } from './shared/TextInput.js';
import { useTextBuffer } from './shared/text-buffer.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import { DialogFooter } from './shared/DialogFooter.js';
import { checkExhaustive } from '../../utils/checks.js';
import { useAlternateBuffer } from '../hooks/useAlternateBuffer.js';
import { MaxSizedBox } from './shared/MaxSizedBox.js';
import { UIStateContext } from '../contexts/UIStateContext.js';

/**
 * Layout constants for the dialog.
 */
const MIN_PLAN_HEIGHT = 3;
const MAX_STANDARD_PLAN_HEIGHT = 20;
const FEEDBACK_BUFFER_WIDTH_OFFSET = 6;
const PLAN_WIDTH_OFFSET = 2;
const QUESTION_AND_MARGIN = 2; // Question text + margin
const FOOTER_HEIGHT = 2; // DialogFooter + margin

export interface ExitPlanModeDialogProps {
  planPath: string;
  onApprove: (approvalMode: ApprovalMode) => void;
  onFeedback: (feedback: string) => void;
  onCancel: () => void;
  width: number;
  availableHeight?: number;
}

interface PlanContentState {
  status: 'loading' | 'loaded' | 'error';
  content?: string;
  error?: string;
}

enum DialogChoice {
  APPROVE_AUTO_EDIT = 'approve_auto_edit',
  APPROVE_DEFAULT = 'approve_default',
  FEEDBACK = 'feedback',
}

interface DialogState {
  activeChoice: DialogChoice;
  isEditingFeedback: boolean;
  submitted: boolean;
}

type DialogAction =
  | { type: 'SET_ACTIVE_CHOICE'; payload: DialogChoice }
  | { type: 'SUBMIT' };

const initialDialogState: DialogState = {
  activeChoice: DialogChoice.APPROVE_AUTO_EDIT,
  isEditingFeedback: false,
  submitted: false,
};

function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  if (state.submitted) return state;

  switch (action.type) {
    case 'SET_ACTIVE_CHOICE':
      return {
        ...state,
        activeChoice: action.payload,
        isEditingFeedback: action.payload === DialogChoice.FEEDBACK,
      };
    case 'SUBMIT':
      return { ...state, submitted: true };
    default:
      checkExhaustive(action);
  }
}

const CHOICE_LABELS: Record<
  Exclude<DialogChoice, DialogChoice.FEEDBACK>,
  string
> = {
  [DialogChoice.APPROVE_AUTO_EDIT]: 'Yes, automatically accept edits',
  [DialogChoice.APPROVE_DEFAULT]: 'Yes, manually accept edits',
};

export const ExitPlanModeDialog: React.FC<ExitPlanModeDialogProps> = ({
  planPath,
  onApprove,
  onFeedback,
  onCancel,
  width,
  availableHeight: availableHeightProp,
}) => {
  const isAlternateBuffer = useAlternateBuffer();
  const uiState = useContext(UIStateContext);
  const availableHeight =
    availableHeightProp ??
    (uiState?.constrainHeight !== false
      ? (uiState?.availableTerminalHeight ?? uiState?.terminalHeight)
      : undefined);

  const [planState, setPlanState] = useState<PlanContentState>({
    status: 'loading',
  });
  const [state, dispatch] = useReducer(dialogReducer, initialDialogState);

  useEffect(() => {
    let ignore = false;

    fs.promises
      .readFile(planPath, 'utf8')
      .then((content) => {
        if (ignore) return;
        setPlanState({ status: 'loaded', content });
      })
      .catch((err) => {
        if (ignore) return;
        setPlanState({ status: 'error', error: err.message });
      });

    return () => {
      ignore = true;
    };
  }, [planPath]);

  const feedbackBuffer = useTextBuffer({
    initialText: '',
    viewport: {
      width: Math.max(1, width - FEEDBACK_BUFFER_WIDTH_OFFSET),
      height: 1,
    },
    singleLine: true,
    isValidPath: () => false,
  });

  useKeypress(
    useCallback(
      (key: Key) => {
        if (state.submitted) return false;
        if (keyMatchers[Command.ESCAPE](key)) {
          onCancel();
          return true;
        }
        if (keyMatchers[Command.QUIT](key)) {
          onCancel();
          return false;
        }
        return false;
      },
      [onCancel, state.submitted],
    ),
    { isActive: !state.submitted },
  );

  useKeypress(
    useCallback(
      (key: Key) => {
        if (
          state.isEditingFeedback &&
          keyMatchers[Command.QUIT](key) &&
          feedbackBuffer.text !== ''
        ) {
          feedbackBuffer.setText('');
          return true;
        }
        return false;
      },
      [state.isEditingFeedback, feedbackBuffer],
    ),
    { isActive: state.isEditingFeedback, priority: true },
  );

  const handleSelect = useCallback(
    (choice: DialogChoice) => {
      if (state.submitted) return;

      if (choice === DialogChoice.FEEDBACK) {
        dispatch({ type: 'SET_ACTIVE_CHOICE', payload: choice });
        return;
      }

      dispatch({ type: 'SUBMIT' });
      if (choice === DialogChoice.APPROVE_AUTO_EDIT) {
        onApprove(ApprovalMode.AUTO_EDIT);
      } else if (choice === DialogChoice.APPROVE_DEFAULT) {
        onApprove(ApprovalMode.DEFAULT);
      }
    },
    [state.submitted, onApprove],
  );

  const handleHighlight = useCallback((choice: DialogChoice) => {
    dispatch({ type: 'SET_ACTIVE_CHOICE', payload: choice });
  }, []);

  const handleFeedbackSubmit = useCallback(
    (text: string) => {
      if (state.submitted || !text.trim()) return;
      dispatch({ type: 'SUBMIT' });
      onFeedback(text.trim());
    },
    [state.submitted, onFeedback],
  );

  const selectItems = useMemo(
    (): Array<RadioSelectItem<DialogChoice>> => [
      {
        key: DialogChoice.APPROVE_AUTO_EDIT,
        value: DialogChoice.APPROVE_AUTO_EDIT,
        label: CHOICE_LABELS[DialogChoice.APPROVE_AUTO_EDIT],
      },
      {
        key: DialogChoice.APPROVE_DEFAULT,
        value: DialogChoice.APPROVE_DEFAULT,
        label: CHOICE_LABELS[DialogChoice.APPROVE_DEFAULT],
      },
      {
        key: DialogChoice.FEEDBACK,
        value: DialogChoice.FEEDBACK,
        label: '',
      },
    ],
    [],
  );

  const OPTIONS_COUNT = selectItems.length;
  const overhead = QUESTION_AND_MARGIN + OPTIONS_COUNT + FOOTER_HEIGHT;

  const planContentHeight =
    availableHeight && !isAlternateBuffer
      ? Math.min(
          MAX_STANDARD_PLAN_HEIGHT,
          Math.max(MIN_PLAN_HEIGHT, availableHeight - overhead),
        )
      : undefined;

  const planContent = useMemo(() => {
    if (planState.status === 'loading') {
      return (
        <Text color={theme.text.secondary} italic>
          Loading plan...
        </Text>
      );
    }
    if (planState.status === 'error') {
      return (
        <Text color={theme.status.error}>
          Error reading plan: {planState.error}
        </Text>
      );
    }
    return (
      <MarkdownDisplay
        text={planState.content || ''}
        isPending={false}
        terminalWidth={width - PLAN_WIDTH_OFFSET}
      />
    );
  }, [planState, width]);

  return (
    <Box flexDirection="column" width={width}>
      <Box marginBottom={1}>
        <MaxSizedBox
          maxHeight={planContentHeight}
          maxWidth={width - PLAN_WIDTH_OFFSET}
          overflowDirection="bottom"
        >
          {planContent}
        </MaxSizedBox>
      </Box>

      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          Ready to start implementation?
        </Text>
      </Box>

      <RadioButtonSelect
        items={selectItems}
        onSelect={handleSelect}
        onHighlight={handleHighlight}
        isFocused={true}
        showNumbers={true}
        showScrollArrows={false}
        renderItem={(item, { titleColor, isSelected }) => {
          if (item.value === DialogChoice.FEEDBACK) {
            return (
              <Box flexDirection="row">
                <TextInput
                  buffer={feedbackBuffer}
                  placeholder="Type your feedback..."
                  focus={isSelected}
                  onSubmit={handleFeedbackSubmit}
                />
              </Box>
            );
          }
          return <Text color={titleColor}>{item.label}</Text>;
        }}
      />

      <DialogFooter
        primaryAction={
          state.activeChoice === DialogChoice.FEEDBACK
            ? 'Enter to send feedback'
            : 'Enter to select'
        }
        navigationActions="↑/↓ to navigate"
      />
    </Box>
  );
};
