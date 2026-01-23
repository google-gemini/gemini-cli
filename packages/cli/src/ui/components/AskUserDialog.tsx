/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useReducer,
} from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import type { Question } from '@google/gemini-cli-core';
import { BaseSelectionList } from './shared/BaseSelectionList.js';
import type { SelectionListItem } from '../hooks/useSelectionList.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import { checkExhaustive } from '../../utils/checks.js';

interface AskUserDialogState {
  currentQuestionIndex: number;
  answers: { [key: string]: string };
  isEditingCustomOption: boolean;
  submitted: boolean;
}

type AskUserDialogAction =
  | {
      type: 'NEXT_QUESTION';
      payload: { maxIndex: number; isTextQuestion: boolean };
    }
  | { type: 'PREV_QUESTION'; payload: { isTextQuestion: boolean } }
  | {
      type: 'SET_ANSWER';
      payload: {
        index: number;
        answer: string;
        autoAdvance?: boolean;
        maxIndex?: number;
      };
    }
  | { type: 'SET_EDITING_CUSTOM'; payload: { isEditing: boolean } }
  | { type: 'SUBMIT' };

const initialState: AskUserDialogState = {
  currentQuestionIndex: 0,
  answers: {},
  isEditingCustomOption: false,
  submitted: false,
};

function askUserDialogReducerLogic(
  state: AskUserDialogState,
  action: AskUserDialogAction,
): AskUserDialogState {
  if (state.submitted) {
    return state;
  }

  switch (action.type) {
    case 'NEXT_QUESTION': {
      const { maxIndex, isTextQuestion } = action.payload;
      // Prevent navigation if editing custom option (unless it's a text question)
      if (state.isEditingCustomOption && !isTextQuestion) {
        return state;
      }

      if (state.currentQuestionIndex < maxIndex) {
        return {
          ...state,
          currentQuestionIndex: state.currentQuestionIndex + 1,
        };
      }
      return state;
    }
    case 'PREV_QUESTION': {
      const { isTextQuestion } = action.payload;
      // Prevent navigation if editing custom option (unless it's a text question)
      if (state.isEditingCustomOption && !isTextQuestion) {
        return state;
      }

      if (state.currentQuestionIndex > 0) {
        return {
          ...state,
          currentQuestionIndex: state.currentQuestionIndex - 1,
        };
      }
      return state;
    }
    case 'SET_ANSWER': {
      const { index, answer, autoAdvance, maxIndex } = action.payload;
      const hasAnswer = answer && answer.trim();
      const newAnswers = { ...state.answers };

      if (hasAnswer) {
        newAnswers[index] = answer;
      } else {
        delete newAnswers[index];
      }

      const newState = {
        ...state,
        answers: newAnswers,
      };

      if (autoAdvance && typeof maxIndex === 'number') {
        if (newState.currentQuestionIndex < maxIndex) {
          newState.currentQuestionIndex += 1;
        }
      }

      return newState;
    }
    case 'SET_EDITING_CUSTOM': {
      return {
        ...state,
        isEditingCustomOption: action.payload.isEditing,
      };
    }
    case 'SUBMIT': {
      return {
        ...state,
        submitted: true,
      };
    }
    default:
      checkExhaustive(action);
      return state;
  }
}

/**
 * Props for the AskUserDialog component.
 */
interface AskUserDialogProps {
  /**
   * The list of questions to ask the user.
   */
  questions: Question[];
  /**
   * Callback fired when the user submits their answers.
   * Returns a map of question index to answer string.
   */
  onSubmit: (answers: { [questionIndex: string]: string }) => void;
  /**
   * Callback fired when the user cancels the dialog (e.g. via Escape).
   */
  onCancel: () => void;
  /**
   * Optional callback to notify parent when text input is active.
   * Useful for managing global keypress handlers.
   */
  onActiveTextInputChange?: (active: boolean) => void;
}

interface QuestionProgressHeaderProps {
  questions: Question[];
  currentIndex: number;
  answeredIndices: Set<number>;
  showReviewTab?: boolean;
  isOnReviewTab?: boolean;
}

const QuestionProgressHeader: React.FC<QuestionProgressHeaderProps> = ({
  questions,
  currentIndex,
  answeredIndices,
  showReviewTab = false,
  isOnReviewTab = false,
}) => {
  if (questions.length <= 1) return null;

  return (
    <Box flexDirection="row" marginBottom={1}>
      <Text color={theme.text.secondary}>{'← '}</Text>
      {questions.map((q, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text color={theme.text.secondary}>{' │ '}</Text>}
          <Text color={theme.text.secondary}>
            {answeredIndices.has(i) ? '✓' : '□'}{' '}
          </Text>
          <Text
            color={
              i === currentIndex && !isOnReviewTab
                ? theme.text.accent
                : theme.text.secondary
            }
            bold={i === currentIndex && !isOnReviewTab}
          >
            {q.header}
          </Text>
        </React.Fragment>
      ))}
      {showReviewTab && (
        <>
          <Text color={theme.text.secondary}>{' │ '}</Text>
          <Text color={theme.text.secondary}>{'≡'} </Text>
          <Text
            color={isOnReviewTab ? theme.text.accent : theme.text.secondary}
            bold={isOnReviewTab}
          >
            Review
          </Text>
        </>
      )}
      <Text color={theme.text.secondary}>{' →'}</Text>
    </Box>
  );
};

interface ReviewViewProps {
  questions: Question[];
  answers: { [key: string]: string };
  onSubmit: () => void;
  progressHeader?: React.ReactNode;
}

const ReviewView: React.FC<ReviewViewProps> = ({
  questions,
  answers,
  onSubmit,
  progressHeader,
}) => {
  const unansweredCount = questions.length - Object.keys(answers).length;
  const hasUnanswered = unansweredCount > 0;

  // Handle Enter to submit
  useKeypress(
    (key: Key) => {
      if (keyMatchers[Command.RETURN](key)) {
        onSubmit();
      }
    },
    { isActive: true },
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      paddingX={1}
      borderColor={theme.border.default}
    >
      {progressHeader}
      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          Review your answers:
        </Text>
      </Box>

      {hasUnanswered && (
        <Box marginBottom={1}>
          <Text color={theme.status.warning}>
            ⚠ You have {unansweredCount} unanswered question
            {unansweredCount > 1 ? 's' : ''}
          </Text>
        </Box>
      )}

      {questions.map((q, i) => (
        <Box key={i} marginBottom={0}>
          <Text color={theme.text.secondary}>{q.header}</Text>
          <Text color={theme.text.secondary}> → </Text>
          <Text color={answers[i] ? theme.text.primary : theme.status.warning}>
            {answers[i] || '(not answered)'}
          </Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          Enter to submit · ←/→ to edit answers · Esc to cancel
        </Text>
      </Box>
    </Box>
  );
};

// ============== Text Question View ==============

interface TextQuestionState {
  textValue: string;
}

type TextQuestionAction =
  | { type: 'TYPE'; payload: { char: string } }
  | { type: 'BACKSPACE' }
  | { type: 'CLEAR' }
  | { type: 'SET'; payload: { value: string } };

function textQuestionReducer(
  state: TextQuestionState,
  action: TextQuestionAction,
): TextQuestionState {
  switch (action.type) {
    case 'TYPE': {
      return {
        ...state,
        textValue: state.textValue + action.payload.char,
      };
    }
    case 'BACKSPACE': {
      return {
        ...state,
        textValue: state.textValue.slice(0, -1),
      };
    }
    case 'CLEAR': {
      return {
        ...state,
        textValue: '',
      };
    }
    case 'SET': {
      return {
        ...state,
        textValue: action.payload.value,
      };
    }
    default:
      checkExhaustive(action);
      return state;
  }
}

interface TextQuestionViewProps {
  question: Question;
  onAnswer: (answer: string) => void;
  onSelectionChange?: (answer: string) => void;
  onEditingCustomOption?: (editing: boolean) => void;
  initialAnswer?: string;
  progressHeader?: React.ReactNode;
  keyboardHints?: React.ReactNode;
}

const TextQuestionView: React.FC<TextQuestionViewProps> = ({
  question,
  onAnswer,
  onSelectionChange,
  onEditingCustomOption,
  initialAnswer,
  progressHeader,
  keyboardHints,
}) => {
  const [state, dispatch] = useReducer(textQuestionReducer, {
    textValue: initialAnswer || '',
  });
  const { textValue } = state;

  // Sync state change with parent
  useEffect(() => {
    onSelectionChange?.(textValue);
  }, [textValue, onSelectionChange]);

  const handleTextTyping = useCallback(
    (key: Key) => {
      // Handle Ctrl+C to clear all text
      if (keyMatchers[Command.QUIT](key)) {
        dispatch({ type: 'CLEAR' });
        return;
      }

      // Handle backspace
      if (key.name === 'backspace' || key.name === 'delete') {
        dispatch({ type: 'BACKSPACE' });
        return;
      }

      // Handle Enter to submit
      if (keyMatchers[Command.RETURN](key)) {
        if (textValue.trim()) {
          onAnswer(textValue.trim());
        }
        return;
      }

      // Handle printable characters
      if (
        key.sequence &&
        key.sequence.length === 1 &&
        !key.ctrl &&
        !key.alt &&
        key.sequence.charCodeAt(0) >= 32
      ) {
        dispatch({ type: 'TYPE', payload: { char: key.sequence } });
        onEditingCustomOption?.(true);
      }
    },
    [textValue, onAnswer, onEditingCustomOption, dispatch],
  );

  useKeypress(handleTextTyping, { isActive: true });

  // Notify parent that we're in text input mode (for Ctrl+C handling)
  useEffect(() => {
    onEditingCustomOption?.(true);
    return () => {
      onEditingCustomOption?.(false);
    };
  }, [onEditingCustomOption]);

  const placeholder = question.placeholder || 'Enter your response';
  const showPlaceholder = !textValue;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      paddingX={1}
      borderColor={theme.border.default}
    >
      {progressHeader}
      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          {question.question}
        </Text>
      </Box>

      <Box flexDirection="row" marginBottom={1}>
        <Text color={theme.text.accent}>{'> '}</Text>
        {showPlaceholder ? (
          <Text color={theme.text.secondary} italic>
            <Text color={theme.text.accent}>{'|'}</Text>
            {placeholder}
          </Text>
        ) : (
          <Text color={theme.text.primary}>
            {textValue}
            <Text color={theme.text.accent}>{'|'}</Text>
          </Text>
        )}
      </Box>

      {keyboardHints}
    </Box>
  );
};

// ============== Choice Question View ==============

interface OptionItem {
  key: string;
  label: string;
  description: string;
  type: 'option' | 'other' | 'done';
  index: number;
}

interface ChoiceQuestionState {
  selectedIndices: Set<number>;
  customOptionText: string;
  isCustomOptionSelected: boolean;
  isCustomOptionFocused: boolean;
}

type ChoiceQuestionAction =
  | { type: 'TOGGLE_INDEX'; payload: { index: number; multiSelect: boolean } }
  | { type: 'TYPE_CUSTOM'; payload: { char: string; multiSelect: boolean } }
  | { type: 'BACKSPACE_CUSTOM'; payload: { multiSelect: boolean } }
  | { type: 'CLEAR_CUSTOM'; payload: { multiSelect: boolean } }
  | { type: 'TOGGLE_CUSTOM_SELECTED'; payload: { multiSelect: boolean } }
  | { type: 'SET_CUSTOM_FOCUSED'; payload: { focused: boolean } };

function choiceQuestionReducer(
  state: ChoiceQuestionState,
  action: ChoiceQuestionAction,
): ChoiceQuestionState {
  switch (action.type) {
    case 'TOGGLE_INDEX': {
      const { index, multiSelect } = action.payload;
      const newIndices = new Set(multiSelect ? state.selectedIndices : []);
      if (newIndices.has(index)) {
        newIndices.delete(index);
      } else {
        newIndices.add(index);
      }
      return {
        ...state,
        selectedIndices: newIndices,
        // In single select, selecting an option deselects custom
        isCustomOptionSelected: multiSelect
          ? state.isCustomOptionSelected
          : false,
      };
    }
    case 'TYPE_CUSTOM': {
      const { char, multiSelect } = action.payload;
      const newText = state.customOptionText + char;
      return {
        ...state,
        customOptionText: newText,
        // In multi-select, typing in custom auto-selects it
        isCustomOptionSelected: multiSelect
          ? true
          : state.isCustomOptionSelected,
        // In single-select, selecting custom deselects others
        selectedIndices: multiSelect ? state.selectedIndices : new Set(),
        isCustomOptionFocused: true,
      };
    }
    case 'BACKSPACE_CUSTOM': {
      const { multiSelect } = action.payload;
      const newText = state.customOptionText.slice(0, -1);
      const newIsCustomOptionSelected = multiSelect
        ? newText.length > 0
        : state.isCustomOptionSelected;

      return {
        ...state,
        customOptionText: newText,
        isCustomOptionSelected: newIsCustomOptionSelected,
      };
    }
    case 'CLEAR_CUSTOM': {
      return {
        ...state,
        customOptionText: '',
        isCustomOptionSelected: false,
      };
    }
    case 'TOGGLE_CUSTOM_SELECTED': {
      const { multiSelect } = action.payload;
      if (!multiSelect || !state.customOptionText.trim()) return state;

      return {
        ...state,
        isCustomOptionSelected: !state.isCustomOptionSelected,
      };
    }
    case 'SET_CUSTOM_FOCUSED': {
      return {
        ...state,
        isCustomOptionFocused: action.payload.focused,
      };
    }
    default:
      checkExhaustive(action);
      return state;
  }
}

interface ChoiceQuestionViewProps {
  question: Question;
  onAnswer: (answer: string) => void;
  onSelectionChange?: (answer: string) => void;
  onEditingCustomOption?: (editing: boolean) => void;
  initialAnswer?: string;
  progressHeader?: React.ReactNode;
  keyboardHints?: React.ReactNode;
}

const ChoiceQuestionView: React.FC<ChoiceQuestionViewProps> = ({
  question,
  onAnswer,
  onSelectionChange,
  onEditingCustomOption,
  initialAnswer,
  progressHeader,
  keyboardHints,
}) => {
  const questionOptions = useMemo(
    () => question.options ?? [],
    [question.options],
  );

  // Initialize state from initialAnswer if returning to a previously answered question
  const initialReducerState = useMemo((): ChoiceQuestionState => {
    if (!initialAnswer) {
      return {
        selectedIndices: new Set<number>(),
        customOptionText: '',
        isCustomOptionSelected: false,
        isCustomOptionFocused: false,
      };
    }

    // Check if initialAnswer matches any option labels
    const selectedIndices = new Set<number>();
    let customOptionText = '';
    let isCustomOptionSelected = false;

    if (question.multiSelect) {
      const answers = initialAnswer.split(', ');
      answers.forEach((answer) => {
        const index = questionOptions.findIndex((opt) => opt.label === answer);
        if (index !== -1) {
          selectedIndices.add(index);
        } else {
          customOptionText = answer;
          isCustomOptionSelected = true;
        }
      });
    } else {
      const index = questionOptions.findIndex(
        (opt) => opt.label === initialAnswer,
      );
      if (index !== -1) {
        selectedIndices.add(index);
      } else {
        customOptionText = initialAnswer;
        isCustomOptionSelected = true;
      }
    }

    return {
      selectedIndices,
      customOptionText,
      isCustomOptionSelected,
      isCustomOptionFocused: false,
    };
  }, [initialAnswer, questionOptions, question.multiSelect]);

  const [state, dispatch] = useReducer(
    choiceQuestionReducer,
    initialReducerState,
  );
  const {
    selectedIndices,
    customOptionText,
    isCustomOptionSelected,
    isCustomOptionFocused,
  } = state;

  // Helper to build answer string from selections
  const buildAnswerString = useCallback(
    (
      indices: Set<number>,
      includeCustomOption: boolean,
      customOption: string,
    ) => {
      const answers: string[] = [];
      questionOptions.forEach((opt, i) => {
        if (indices.has(i)) {
          answers.push(opt.label);
        }
      });
      if (includeCustomOption && customOption.trim()) {
        answers.push(customOption.trim());
      }
      return answers.join(', ');
    },
    [questionOptions],
  );

  // Synchronize selection changes with parent
  useEffect(() => {
    onSelectionChange?.(
      buildAnswerString(
        selectedIndices,
        isCustomOptionSelected,
        customOptionText,
      ),
    );
  }, [
    selectedIndices,
    isCustomOptionSelected,
    customOptionText,
    buildAnswerString,
    onSelectionChange,
  ]);

  // Handle keypresses for both custom option typing and "type-to-jump"
  const handleChoiceKeypress = useCallback(
    (key: Key) => {
      // If focusing custom option, handle editing keys
      if (isCustomOptionFocused) {
        // Handle Ctrl+C to clear all text
        if (keyMatchers[Command.QUIT](key)) {
          dispatch({
            type: 'CLEAR_CUSTOM',
            payload: { multiSelect: !!question.multiSelect },
          });
          return;
        }

        // Handle backspace
        if (key.name === 'backspace' || key.name === 'delete') {
          dispatch({
            type: 'BACKSPACE_CUSTOM',
            payload: { multiSelect: !!question.multiSelect },
          });
          return;
        }
      }

      // Handle printable characters (ignore control keys)
      // This works both when focused (editing) and when not focused (type-to-jump)
      const isPrintable =
        key.sequence &&
        key.sequence.length === 1 &&
        !key.ctrl &&
        !key.alt &&
        key.sequence.charCodeAt(0) >= 32;

      // Avoid capturing numbers if they might be used for selection (1-9)
      const isNumber = /^[0-9]$/.test(key.sequence);
      // We assume BaseSelectionList handles numbers if showNumbers is true (which implies we shouldn't steal them)
      // Since we don't know showNumbers here easily without props, we'll assume we shouldn't steal numbers if not focused.
      // If focused, we treat numbers as text input.
      const shouldCapture = isPrintable && (isCustomOptionFocused || !isNumber);

      if (shouldCapture) {
        dispatch({
          type: 'TYPE_CUSTOM',
          payload: {
            char: key.sequence,
            multiSelect: !!question.multiSelect,
          },
        });
        onEditingCustomOption?.(true);
      }
    },
    [
      isCustomOptionFocused,
      question.multiSelect,
      onEditingCustomOption,
      dispatch,
    ],
  );

  useKeypress(handleChoiceKeypress, { isActive: true });

  const selectionItems = useMemo((): Array<SelectionListItem<OptionItem>> => {
    const list: Array<SelectionListItem<OptionItem>> = questionOptions.map(
      (opt, i) => {
        const item: OptionItem = {
          key: `opt-${i}`,
          label: opt.label,
          description: opt.description,
          type: 'option',
          index: i,
        };
        return { key: item.key, value: item };
      },
    );

    // Only add custom option for choice type, not yesno
    if (question.type !== 'yesno') {
      const otherItem: OptionItem = {
        key: 'other',
        label: customOptionText || '',
        description: '',
        type: 'other',
        index: list.length,
      };
      list.push({ key: otherItem.key, value: otherItem });
    }

    if (question.multiSelect) {
      const doneItem: OptionItem = {
        key: 'done',
        label: 'Done',
        description: 'Finish selection',
        type: 'done',
        index: list.length,
      };
      list.push({ key: doneItem.key, value: doneItem, hideNumber: true });
    }

    return list;
  }, [questionOptions, question.multiSelect, question.type, customOptionText]);

  const handleHighlight = useCallback(
    (itemValue: OptionItem) => {
      const nowFocusingCustomOption = itemValue.type === 'other';
      dispatch({
        type: 'SET_CUSTOM_FOCUSED',
        payload: { focused: nowFocusingCustomOption },
      });
      // Notify parent when we stop focusing custom option (so navigation can resume)
      if (!nowFocusingCustomOption) {
        onEditingCustomOption?.(false);
      }
    },
    [onEditingCustomOption],
  );

  const handleSelect = useCallback(
    (itemValue: OptionItem) => {
      if (question.multiSelect) {
        if (itemValue.type === 'option') {
          dispatch({
            type: 'TOGGLE_INDEX',
            payload: { index: itemValue.index, multiSelect: true },
          });
        } else if (itemValue.type === 'other') {
          dispatch({
            type: 'TOGGLE_CUSTOM_SELECTED',
            payload: { multiSelect: true },
          });
        } else if (itemValue.type === 'done') {
          // Done just triggers navigation, selections already saved via useEffect
          onAnswer(
            buildAnswerString(
              selectedIndices,
              isCustomOptionSelected,
              customOptionText,
            ),
          );
        }
      } else {
        if (itemValue.type === 'option') {
          onAnswer(itemValue.label);
        } else if (itemValue.type === 'other') {
          // Submit the other text if it has content
          if (customOptionText.trim()) {
            // Reset editing state before submitting so navigation works on next question
            onEditingCustomOption?.(false);
            onAnswer(customOptionText.trim());
          }
        }
      }
    },
    [
      question.multiSelect,
      selectedIndices,
      isCustomOptionSelected,
      customOptionText,
      onAnswer,
      onEditingCustomOption,
      buildAnswerString,
    ],
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      paddingX={1}
      borderColor={theme.border.default}
    >
      {progressHeader}
      <Box marginBottom={1}>
        <Text bold color={theme.text.primary}>
          {question.question}
        </Text>
      </Box>
      {question.multiSelect && (
        <Text color={theme.text.secondary} italic>
          {' '}
          (Select all that apply)
        </Text>
      )}

      <BaseSelectionList<OptionItem>
        items={selectionItems}
        onSelect={handleSelect}
        onHighlight={handleHighlight}
        focusKey={isCustomOptionFocused ? 'other' : undefined}
        renderItem={(item, context) => {
          const optionItem = item.value;
          const isChecked =
            selectedIndices.has(optionItem.index) ||
            (optionItem.type === 'other' && isCustomOptionSelected);
          const showCheck =
            question.multiSelect &&
            (optionItem.type === 'option' || optionItem.type === 'other');

          // Render inline text input for custom option
          if (optionItem.type === 'other') {
            const displayText = customOptionText || '';
            const placeholder = 'Enter a custom value';
            const showPlaceholder = !displayText && context.isSelected;
            const showCursor = context.isSelected;
            return (
              <Box flexDirection="column">
                <Box flexDirection="row">
                  {showCheck && (
                    <Text
                      color={
                        isChecked ? theme.text.accent : theme.text.secondary
                      }
                    >
                      [{isChecked ? 'x' : ' '}]
                    </Text>
                  )}
                  <Text color={theme.text.primary}> </Text>
                  {showPlaceholder ? (
                    <Text color={theme.text.secondary} italic>
                      <Text color={theme.text.accent}>
                        {showCursor ? '▌' : ''}
                      </Text>
                      {placeholder}
                    </Text>
                  ) : (
                    <Text
                      color={
                        isChecked && !question.multiSelect
                          ? theme.status.success
                          : displayText
                            ? theme.text.primary
                            : theme.text.secondary
                      }
                    >
                      {displayText || (context.isSelected ? '' : placeholder)}
                      {showCursor && <Text color={theme.text.accent}>▌</Text>}
                    </Text>
                  )}
                  {isChecked && !question.multiSelect && (
                    <Text color={theme.status.success}> ✓</Text>
                  )}
                </Box>
              </Box>
            );
          }

          // Determine label color: checked (previously answered) uses success, selected uses accent, else primary
          const labelColor =
            isChecked && !question.multiSelect
              ? theme.status.success
              : context.isSelected
                ? context.titleColor
                : theme.text.primary;

          return (
            <Box flexDirection="column">
              <Box flexDirection="row">
                {showCheck && (
                  <Text
                    color={isChecked ? theme.text.accent : theme.text.secondary}
                  >
                    [{isChecked ? 'x' : ' '}]
                  </Text>
                )}
                <Text color={labelColor} bold={optionItem.type === 'done'}>
                  {' '}
                  {optionItem.label}
                </Text>
                {isChecked && !question.multiSelect && (
                  <Text color={theme.status.success}> ✓</Text>
                )}
              </Box>
              {optionItem.description && (
                <Text color={theme.text.secondary} wrap="wrap">
                  {' '}
                  {optionItem.description}
                </Text>
              )}
            </Box>
          );
        }}
      />
      {keyboardHints}
    </Box>
  );
};

/**
 * A dialog component for asking the user a series of questions.
 * Supports multiple question types (text, choice, yes/no, multi-select),
 * navigation between questions, and a final review step.
 */
export const AskUserDialog: React.FC<AskUserDialogProps> = ({
  questions,
  onSubmit,
  onCancel,
  onActiveTextInputChange,
}) => {
  const [state, dispatch] = useReducer(askUserDialogReducerLogic, initialState);
  const { currentQuestionIndex, answers, isEditingCustomOption, submitted } =
    state;

  // Use refs for synchronous checks to prevent race conditions
  const isEditingCustomOptionRef = useRef(false);
  isEditingCustomOptionRef.current = isEditingCustomOption;

  const handleEditingCustomOption = useCallback((isEditing: boolean) => {
    dispatch({ type: 'SET_EDITING_CUSTOM', payload: { isEditing } });
  }, []);

  // Sync isEditingCustomOption state with parent for global keypress handling
  // Clean up on unmount to ensure Ctrl+C works normally after dialog closes
  useEffect(() => {
    onActiveTextInputChange?.(isEditingCustomOption);
    return () => {
      onActiveTextInputChange?.(false);
    };
  }, [isEditingCustomOption, onActiveTextInputChange]);

  // Handle Escape or Ctrl+C to cancel (but not Ctrl+C when editing custom option)
  const handleCancel = useCallback(
    (key: Key) => {
      if (submitted) return;
      if (keyMatchers[Command.ESCAPE](key)) {
        onCancel();
      } else if (
        keyMatchers[Command.QUIT](key) &&
        !isEditingCustomOptionRef.current
      ) {
        onCancel();
      }
    },
    [onCancel, submitted],
  );

  useKeypress(handleCancel, {
    isActive: !submitted,
  });

  // Review tab is at index questions.length (after all questions)
  const reviewTabIndex = questions.length;
  const isOnReviewTab = currentQuestionIndex === reviewTabIndex;

  // Bidirectional navigation between questions using custom useKeypress for consistency
  const handleNavigation = useCallback(
    (key: Key) => {
      if (submitted) return;

      const currentQuestionIsText =
        questions[currentQuestionIndex]?.type === 'text';

      if (keyMatchers[Command.MOVE_RIGHT](key) || key.name === 'tab') {
        // Allow navigation up to Review tab for multi-question flows
        const maxIndex =
          questions.length > 1 ? reviewTabIndex : questions.length - 1;
        dispatch({
          type: 'NEXT_QUESTION',
          payload: { maxIndex, isTextQuestion: currentQuestionIsText },
        });
      } else if (keyMatchers[Command.MOVE_LEFT](key)) {
        dispatch({
          type: 'PREV_QUESTION',
          payload: { isTextQuestion: currentQuestionIsText },
        });
      }
    },
    [currentQuestionIndex, questions, reviewTabIndex, submitted],
  );

  useKeypress(handleNavigation, {
    isActive: questions.length > 1 && !submitted,
  });

  // Effect to trigger submission when state.submitted becomes true
  // This ensures the callback is called only after state update is processed
  useEffect(() => {
    if (submitted) {
      onSubmit(answers);
    }
  }, [submitted, answers, onSubmit]);

  const handleAnswer = useCallback(
    (answer: string) => {
      if (submitted) return;

      const reviewTabIndex = questions.length;
      dispatch({
        type: 'SET_ANSWER',
        payload: {
          index: currentQuestionIndex,
          answer,
          autoAdvance: questions.length > 1,
          maxIndex: reviewTabIndex,
        },
      });

      if (questions.length === 1) {
        dispatch({ type: 'SUBMIT' });
      }
    },
    [currentQuestionIndex, questions.length, submitted],
  );

  // Submit from Review tab
  const handleReviewSubmit = useCallback(() => {
    if (submitted) return;
    dispatch({ type: 'SUBMIT' });
  }, [submitted]);

  const handleSelectionChange = useCallback(
    (answer: string) => {
      if (submitted) return;
      dispatch({
        type: 'SET_ANSWER',
        payload: {
          index: currentQuestionIndex,
          answer,
          autoAdvance: false,
        },
      });
    },
    [currentQuestionIndex, submitted],
  );

  const answeredIndices = useMemo(
    () => new Set(Object.keys(answers).map(Number)),
    [answers],
  );

  const currentQuestion = questions[currentQuestionIndex];

  // For yesno type, generate Yes/No options and force single-select
  const effectiveQuestion = useMemo(() => {
    if (currentQuestion?.type === 'yesno') {
      return {
        ...currentQuestion,
        options: [
          { label: 'Yes', description: '' },
          { label: 'No', description: '' },
        ],
        multiSelect: false,
      };
    }
    return currentQuestion;
  }, [currentQuestion]);

  const progressHeader =
    questions.length > 1 ? (
      <QuestionProgressHeader
        questions={questions}
        currentIndex={currentQuestionIndex}
        answeredIndices={answeredIndices}
        showReviewTab={true}
        isOnReviewTab={isOnReviewTab}
      />
    ) : null;

  // Render Review tab when on it
  if (isOnReviewTab) {
    return (
      <ReviewView
        questions={questions}
        answers={answers}
        onSubmit={handleReviewSubmit}
        progressHeader={progressHeader}
      />
    );
  }

  // Safeguard for invalid question index
  if (!currentQuestion) return null;

  const keyboardHints = (
    <Box marginTop={1}>
      <Text color={theme.text.secondary}>
        {currentQuestion.type === 'text'
          ? questions.length > 1
            ? 'Enter to submit · ←/→ to switch questions · Esc to cancel'
            : 'Enter to submit · Esc to cancel'
          : questions.length > 1
            ? 'Enter to select · ←/→ to switch questions · Esc to cancel'
            : 'Enter to select · ↑/↓ to navigate · Esc to cancel'}
      </Text>
    </Box>
  );

  // Render text-type or choice-type question view
  if (currentQuestion.type === 'text') {
    return (
      <TextQuestionView
        key={currentQuestionIndex}
        question={currentQuestion}
        onAnswer={handleAnswer}
        onSelectionChange={handleSelectionChange}
        onEditingCustomOption={handleEditingCustomOption}
        initialAnswer={answers[currentQuestionIndex]}
        progressHeader={progressHeader}
        keyboardHints={keyboardHints}
      />
    );
  }

  return (
    <ChoiceQuestionView
      key={currentQuestionIndex}
      question={effectiveQuestion}
      onAnswer={handleAnswer}
      onSelectionChange={handleSelectionChange}
      onEditingCustomOption={handleEditingCustomOption}
      initialAnswer={answers[currentQuestionIndex]}
      progressHeader={progressHeader}
      keyboardHints={keyboardHints}
    />
  );
};
