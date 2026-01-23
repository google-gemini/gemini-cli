/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  useCallback,
  useMemo,
  useRef,
  useEffect,
  useReducer,
  useContext,
} from 'react';
import { Box, Text, useStdout } from 'ink';
import { theme } from '../semantic-colors.js';
import type { Question } from '@google/gemini-cli-core';
import { BaseSelectionList } from './shared/BaseSelectionList.js';
import type { SelectionListItem } from '../hooks/useSelectionList.js';
import { TabHeader, type Tab } from './shared/TabHeader.js';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import { checkExhaustive } from '../../utils/checks.js';
import { TextInput } from './shared/TextInput.js';
import { useTextBuffer } from './shared/text-buffer.js';
import { UIStateContext } from '../contexts/UIStateContext.js';
import { cpLen } from '../utils/textUtils.js';

interface AskUserDialogState {
  currentQuestionIndex: number;
  answers: { [key: string]: string };
  isEditingCustomOption: boolean;
  cursorEdge: { left: boolean; right: boolean };
  submitted: boolean;
}

type AskUserDialogAction =
  | {
      type: 'NEXT_QUESTION';
      payload: { maxIndex: number };
    }
  | { type: 'PREV_QUESTION' }
  | {
      type: 'SET_ANSWER';
      payload: {
        index?: number;
        answer: string;
        autoAdvance?: boolean;
        maxIndex?: number;
      };
    }
  | { type: 'SET_EDITING_CUSTOM'; payload: { isEditing: boolean } }
  | { type: 'SET_CURSOR_EDGE'; payload: { left: boolean; right: boolean } }
  | { type: 'SUBMIT' };

const initialState: AskUserDialogState = {
  currentQuestionIndex: 0,
  answers: {},
  isEditingCustomOption: false,
  cursorEdge: { left: true, right: true },
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
      const { maxIndex } = action.payload;
      if (state.currentQuestionIndex < maxIndex) {
        return {
          ...state,
          currentQuestionIndex: state.currentQuestionIndex + 1,
          isEditingCustomOption: false,
          cursorEdge: { left: true, right: true },
        };
      }
      return state;
    }
    case 'PREV_QUESTION': {
      if (state.currentQuestionIndex > 0) {
        return {
          ...state,
          currentQuestionIndex: state.currentQuestionIndex - 1,
          isEditingCustomOption: false,
          cursorEdge: { left: true, right: true },
        };
      }
      return state;
    }
    case 'SET_ANSWER': {
      const { index, answer, autoAdvance, maxIndex } = action.payload;
      const targetIndex = index ?? state.currentQuestionIndex;
      const hasAnswer =
        answer !== undefined && answer !== null && answer.trim() !== '';
      const newAnswers = { ...state.answers };

      if (hasAnswer) {
        newAnswers[targetIndex] = answer;
      } else {
        delete newAnswers[targetIndex];
      }

      const newState = {
        ...state,
        answers: newAnswers,
      };

      if (autoAdvance && typeof maxIndex === 'number') {
        if (newState.currentQuestionIndex < maxIndex) {
          newState.currentQuestionIndex += 1;
          newState.isEditingCustomOption = false;
          newState.cursorEdge = { left: true, right: true };
        }
      }

      return newState;
    }
    case 'SET_EDITING_CUSTOM': {
      if (state.isEditingCustomOption === action.payload.isEditing) {
        return state;
      }
      return {
        ...state,
        isEditingCustomOption: action.payload.isEditing,
      };
    }
    case 'SET_CURSOR_EDGE': {
      const { left, right } = action.payload;
      if (state.cursorEdge.left === left && state.cursorEdge.right === right) {
        return state;
      }
      return {
        ...state,
        cursorEdge: { left, right },
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
          Enter to submit · Tab/Shift+Tab to edit answers · Esc to cancel
        </Text>
      </Box>
    </Box>
  );
};

// ============== Text Question View ==============

interface TextQuestionViewProps {
  question: Question;
  onAnswer: (answer: string) => void;
  onSelectionChange?: (answer: string) => void;
  onEditingCustomOption?: (editing: boolean) => void;
  onCursorEdgeChange?: (edge: { left: boolean; right: boolean }) => void;
  initialAnswer?: string;
  progressHeader?: React.ReactNode;
  keyboardHints?: React.ReactNode;
}

const TextQuestionView: React.FC<TextQuestionViewProps> = ({
  question,
  onAnswer,
  onSelectionChange,
  onEditingCustomOption,
  onCursorEdgeChange,
  initialAnswer,
  progressHeader,
  keyboardHints,
}) => {
  const uiState = useContext(UIStateContext);
  const { stdout } = useStdout();
  const terminalWidth = uiState?.terminalWidth ?? stdout?.columns ?? 80;

  const buffer = useTextBuffer({
    initialText: initialAnswer,
    viewport: { width: terminalWidth - 10, height: 1 },
    singleLine: true,
    isValidPath: () => false,
  });

  const { text: textValue } = buffer;

  // Sync state change with parent - only when it actually changes
  const lastTextValueRef = useRef(textValue);
  useEffect(() => {
    if (textValue !== lastTextValueRef.current) {
      onSelectionChange?.(textValue);
      lastTextValueRef.current = textValue;
    }
  }, [textValue, onSelectionChange]);

  // Sync cursor edge state with parent - only when it actually changes
  const lastEdgeRef = useRef<{ left: boolean; right: boolean } | null>(null);
  useEffect(() => {
    const isLeft = buffer.cursor[1] === 0;
    const isRight = buffer.cursor[1] === cpLen(buffer.lines[0] || '');
    if (
      !lastEdgeRef.current ||
      isLeft !== lastEdgeRef.current.left ||
      isRight !== lastEdgeRef.current.right
    ) {
      onCursorEdgeChange?.({ left: isLeft, right: isRight });
      lastEdgeRef.current = { left: isLeft, right: isRight };
    }
  }, [buffer.cursor, buffer.lines, onCursorEdgeChange]);

  // Handle Ctrl+C to clear all text
  const handleExtraKeys = useCallback(
    (key: Key) => {
      if (keyMatchers[Command.QUIT](key)) {
        buffer.setText('');
      }
    },
    [buffer],
  );

  useKeypress(handleExtraKeys, { isActive: true });

  const handleSubmit = useCallback(
    (val: string) => {
      if (val.trim()) {
        onAnswer(val.trim());
      }
    },
    [onAnswer],
  );

  // Notify parent that we're in text input mode (for Ctrl+C handling)
  useEffect(() => {
    onEditingCustomOption?.(true);
    return () => {
      onEditingCustomOption?.(false);
    };
  }, [onEditingCustomOption]);

  const placeholder = question.placeholder || 'Enter your response';

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
        <TextInput
          buffer={buffer}
          placeholder={placeholder}
          onSubmit={handleSubmit}
        />
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
  isCustomOptionSelected: boolean;
  isCustomOptionFocused: boolean;
}

type ChoiceQuestionAction =
  | { type: 'TOGGLE_INDEX'; payload: { index: number; multiSelect: boolean } }
  | {
      type: 'SET_CUSTOM_SELECTED';
      payload: { selected: boolean; multiSelect: boolean };
    }
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
    case 'SET_CUSTOM_SELECTED': {
      const { selected, multiSelect } = action.payload;
      return {
        ...state,
        isCustomOptionSelected: selected,
        // In single-select, selecting custom deselects others
        selectedIndices: multiSelect ? state.selectedIndices : new Set(),
      };
    }
    case 'TOGGLE_CUSTOM_SELECTED': {
      const { multiSelect } = action.payload;
      if (!multiSelect) return state;

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
  onCursorEdgeChange?: (edge: { left: boolean; right: boolean }) => void;
  initialAnswer?: string;
  progressHeader?: React.ReactNode;
  keyboardHints?: React.ReactNode;
}

const ChoiceQuestionView: React.FC<ChoiceQuestionViewProps> = ({
  question,
  onAnswer,
  onSelectionChange,
  onEditingCustomOption,
  onCursorEdgeChange,
  initialAnswer,
  progressHeader,
  keyboardHints,
}) => {
  const uiState = useContext(UIStateContext);
  const { stdout } = useStdout();
  const terminalWidth = uiState?.terminalWidth ?? stdout?.columns ?? 80;

  const questionOptions = useMemo(
    () => question.options ?? [],
    [question.options],
  );

  // Initialize state from initialAnswer if returning to a previously answered question
  const initialReducerState = useMemo((): ChoiceQuestionState => {
    if (!initialAnswer) {
      return {
        selectedIndices: new Set<number>(),
        isCustomOptionSelected: false,
        isCustomOptionFocused: false,
      };
    }

    // Check if initialAnswer matches any option labels
    const selectedIndices = new Set<number>();
    let isCustomOptionSelected = false;

    if (question.multiSelect) {
      const answers = initialAnswer.split(', ');
      answers.forEach((answer) => {
        const index = questionOptions.findIndex((opt) => opt.label === answer);
        if (index !== -1) {
          selectedIndices.add(index);
        } else {
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
        isCustomOptionSelected = true;
      }
    }

    return {
      selectedIndices,
      isCustomOptionSelected,
      isCustomOptionFocused: false,
    };
  }, [initialAnswer, questionOptions, question.multiSelect]);

  const [state, dispatch] = useReducer(
    choiceQuestionReducer,
    initialReducerState,
  );
  const { selectedIndices, isCustomOptionSelected, isCustomOptionFocused } =
    state;

  const initialCustomText = useMemo(() => {
    if (!initialAnswer) return '';
    if (question.multiSelect) {
      const answers = initialAnswer.split(', ');
      const custom = answers.find(
        (a) => !questionOptions.some((opt) => opt.label === a),
      );
      return custom || '';
    } else {
      const isPredefined = questionOptions.some(
        (opt) => opt.label === initialAnswer,
      );
      return isPredefined ? '' : initialAnswer;
    }
  }, [initialAnswer, questionOptions, question.multiSelect]);

  const customBuffer = useTextBuffer({
    initialText: initialCustomText,
    viewport: { width: terminalWidth - 20, height: 1 },
    singleLine: true,
    isValidPath: () => false,
  });

  const customOptionText = customBuffer.text;

  // Sync cursor edge state with parent - only when it actually changes
  const lastEdgeRef = useRef<{ left: boolean; right: boolean } | null>(null);
  useEffect(() => {
    const isLeft = customBuffer.cursor[1] === 0;
    const isRight =
      customBuffer.cursor[1] === cpLen(customBuffer.lines[0] || '');
    if (
      !lastEdgeRef.current ||
      isLeft !== lastEdgeRef.current.left ||
      isRight !== lastEdgeRef.current.right
    ) {
      onCursorEdgeChange?.({ left: isLeft, right: isRight });
      lastEdgeRef.current = { left: isLeft, right: isRight };
    }
  }, [customBuffer.cursor, customBuffer.lines, onCursorEdgeChange]);

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

  // Synchronize selection changes with parent - only when it actually changes
  const lastBuiltAnswerRef = useRef('');
  useEffect(() => {
    const newAnswer = buildAnswerString(
      selectedIndices,
      isCustomOptionSelected,
      customOptionText,
    );
    if (newAnswer !== lastBuiltAnswerRef.current) {
      onSelectionChange?.(newAnswer);
      lastBuiltAnswerRef.current = newAnswer;
    }
  }, [
    selectedIndices,
    isCustomOptionSelected,
    customOptionText,
    buildAnswerString,
    onSelectionChange,
  ]);

  // Handle "Type-to-Jump" and Ctrl+C for custom buffer
  const handleExtraKeys = useCallback(
    (key: Key) => {
      // If focusing custom option, handle Ctrl+C
      if (isCustomOptionFocused && keyMatchers[Command.QUIT](key)) {
        customBuffer.setText('');
        return;
      }

      // Type-to-jump: if a printable character is typed and not focused, jump to custom
      const isPrintable =
        key.sequence &&
        key.sequence.length === 1 &&
        !key.ctrl &&
        !key.alt &&
        key.sequence.charCodeAt(0) >= 32;

      const isNumber = /^[0-9]$/.test(key.sequence);

      if (isPrintable && !isCustomOptionFocused && !isNumber) {
        dispatch({ type: 'SET_CUSTOM_FOCUSED', payload: { focused: true } });
        onEditingCustomOption?.(true);
        // We can't easily inject the first key into useTextBuffer's internal state
        // but TextInput will handle subsequent keys once it's focused.
        customBuffer.setText(key.sequence);
      }
    },
    [isCustomOptionFocused, customBuffer, onEditingCustomOption],
  );

  useKeypress(handleExtraKeys, { isActive: true });

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
      list.push({ key: 'other', value: otherItem });
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
      // Notify parent when we start/stop focusing custom option (so navigation can resume)
      onEditingCustomOption?.(nowFocusingCustomOption);
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
          // In single select, selecting other submits it if it has text
          if (customOptionText.trim()) {
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
      buildAnswerString,
    ],
  );

  // Auto-select custom option when typing in it
  useEffect(() => {
    if (customOptionText.trim() && !isCustomOptionSelected) {
      dispatch({
        type: 'SET_CUSTOM_SELECTED',
        payload: { selected: true, multiSelect: !!question.multiSelect },
      });
    }
  }, [customOptionText, isCustomOptionSelected, question.multiSelect]);

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
            const placeholder = 'Enter a custom value';
            return (
              <Box flexDirection="row">
                {showCheck && (
                  <Text
                    color={isChecked ? theme.text.accent : theme.text.secondary}
                  >
                    [{isChecked ? 'x' : ' '}]
                  </Text>
                )}
                <Text color={theme.text.primary}> </Text>
                <TextInput
                  buffer={customBuffer}
                  placeholder={placeholder}
                  focus={context.isSelected}
                  onSubmit={() => handleSelect(optionItem)}
                />
                {isChecked && !question.multiSelect && (
                  <Text color={theme.status.success}> ✓</Text>
                )}
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
  const {
    currentQuestionIndex,
    answers,
    isEditingCustomOption,
    cursorEdge,
    submitted,
  } = state;

  // Use refs for synchronous checks to prevent race conditions in handleCancel
  const isEditingCustomOptionRef = useRef(false);
  isEditingCustomOptionRef.current = isEditingCustomOption;

  const handleEditingCustomOption = useCallback((isEditing: boolean) => {
    dispatch({ type: 'SET_EDITING_CUSTOM', payload: { isEditing } });
  }, []);

  const handleCursorEdgeChange = useCallback(
    (edge: { left: boolean; right: boolean }) => {
      dispatch({ type: 'SET_CURSOR_EDGE', payload: edge });
    },
    [],
  );

  // Sync isEditingCustomOption state with parent for global keypress handling
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

      const isTab = key.name === 'tab';
      const isShiftTab = isTab && key.shift;
      const isPlainTab = isTab && !key.shift;

      const isRight = key.name === 'right' && !key.ctrl && !key.alt;
      const isLeft = key.name === 'left' && !key.ctrl && !key.alt;

      // Tab always works. Arrows work if NOT editing OR if at the corresponding edge.
      const shouldGoNext =
        isPlainTab || (isRight && (!isEditingCustomOption || cursorEdge.right));
      const shouldGoPrev =
        isShiftTab || (isLeft && (!isEditingCustomOption || cursorEdge.left));

      if (shouldGoNext) {
        // Allow navigation up to Review tab for multi-question flows
        const maxIndex =
          questions.length > 1 ? reviewTabIndex : questions.length - 1;
        dispatch({
          type: 'NEXT_QUESTION',
          payload: { maxIndex },
        });
      } else if (shouldGoPrev) {
        dispatch({
          type: 'PREV_QUESTION',
        });
      }
    },
    [isEditingCustomOption, cursorEdge, questions, reviewTabIndex, submitted],
  );

  useKeypress(handleNavigation, {
    isActive: questions.length > 1 && !submitted,
  });

  // Effect to trigger submission when state.submitted becomes true
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
          answer,
          autoAdvance: questions.length > 1,
          maxIndex: reviewTabIndex,
        },
      });

      if (questions.length === 1) {
        dispatch({ type: 'SUBMIT' });
      }
    },
    [questions.length, submitted],
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
          answer,
          autoAdvance: false,
        },
      });
    },
    [submitted],
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

  // Build tabs array for TabHeader
  const tabs = useMemo((): Tab[] => {
    const questionTabs: Tab[] = questions.map((q, i) => ({
      key: String(i),
      header: q.header,
    }));
    // Add review tab when there are multiple questions
    if (questions.length > 1) {
      questionTabs.push({
        key: 'review',
        header: 'Review',
        isSpecial: true,
      });
    }
    return questionTabs;
  }, [questions]);

  const progressHeader =
    questions.length > 1 ? (
      <TabHeader
        tabs={tabs}
        currentIndex={currentQuestionIndex}
        completedIndices={answeredIndices}
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
        {currentQuestion.type === 'text' || isEditingCustomOption
          ? questions.length > 1
            ? 'Enter to submit · Tab/Shift+Tab to switch questions · Esc to cancel'
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
        onCursorEdgeChange={handleCursorEdgeChange}
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
      onCursorEdgeChange={handleCursorEdgeChange}
      initialAnswer={answers[currentQuestionIndex]}
      progressHeader={progressHeader}
      keyboardHints={keyboardHints}
    />
  );
};
