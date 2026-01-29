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
import { Box, Text } from 'ink';
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
import { getCachedStringWidth } from '../utils/textUtils.js';
import { useTabbedNavigation } from '../hooks/useTabbedNavigation.js';
import { DialogFooter } from './shared/DialogFooter.js';
import { MaxSizedBox } from './shared/MaxSizedBox.js';

interface AskUserDialogState {
  answers: { [key: string]: string };
  isEditingCustomOption: boolean;
  submitted: boolean;
}

type AskUserDialogAction =
  | {
      type: 'SET_ANSWER';
      payload: {
        index: number;
        answer: string;
      };
    }
  | { type: 'SET_EDITING_CUSTOM'; payload: { isEditing: boolean } }
  | { type: 'SUBMIT' };

const initialState: AskUserDialogState = {
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
    case 'SET_ANSWER': {
      const { index, answer } = action.payload;
      const hasAnswer =
        answer !== undefined && answer !== null && answer.trim() !== '';
      const newAnswers = { ...state.answers };

      if (hasAnswer) {
        newAnswers[index] = answer;
      } else {
        delete newAnswers[index];
      }

      return {
        ...state,
        answers: newAnswers,
      };
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
  /**
   * Optional width override. If not provided, uses terminal width from context.
   */
  width?: number;
  /**
   * Optional height constraint for scrollable content.
   */
  availableHeight?: number;
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
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column">
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
      <DialogFooter
        primaryAction="Enter to submit"
        navigationActions="Tab/Shift+Tab to edit answers"
      />
    </Box>
  );
};

// ============== Text Question View ==============

interface TextQuestionViewProps {
  question: Question;
  onAnswer: (answer: string) => void;
  onSelectionChange?: (answer: string) => void;
  onEditingCustomOption?: (editing: boolean) => void;
  availableWidth: number;
  initialAnswer?: string;
  progressHeader?: React.ReactNode;
  keyboardHints?: React.ReactNode;
}

const TextQuestionView: React.FC<TextQuestionViewProps> = ({
  question,
  onAnswer,
  onSelectionChange,
  onEditingCustomOption,
  availableWidth,
  initialAnswer,
  progressHeader,
  keyboardHints,
}) => {
  const prefix = '> ';
  const horizontalPadding = 1; // 1 for cursor
  const bufferWidth =
    availableWidth - getCachedStringWidth(prefix) - horizontalPadding;

  const buffer = useTextBuffer({
    initialText: initialAnswer,
    viewport: { width: Math.max(1, bufferWidth), height: 1 },
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

  // Handle Ctrl+C to clear all text
  const handleExtraKeys = useCallback(
    (key: Key) => {
      if (keyMatchers[Command.QUIT](key)) {
        buffer.setText('');
        return true;
      }
      return false;
    },
    [buffer],
  );

  useKeypress(handleExtraKeys, { isActive: true, priority: true });

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
    <Box flexDirection="column">
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
  availableWidth: number;
  initialAnswer?: string;
  progressHeader?: React.ReactNode;
  keyboardHints?: React.ReactNode;
}

const ChoiceQuestionView: React.FC<ChoiceQuestionViewProps> = ({
  question,
  onAnswer,
  onSelectionChange,
  onEditingCustomOption,
  availableWidth,
  initialAnswer,
  progressHeader,
  keyboardHints,
}) => {
  const numOptions =
    (question.options?.length ?? 0) + (question.type !== 'yesno' ? 1 : 0);
  const numLen = String(numOptions).length;
  const radioWidth = 2; // "● "
  const numberWidth = numLen + 2; // e.g., "1. "
  const checkboxWidth = question.multiSelect ? 4 : 1; // "[x] " or " "
  const checkmarkWidth = question.multiSelect ? 0 : 2; // "" or " ✓"
  const cursorPadding = 1; // Extra character for cursor at end of line
  const outerBoxPadding = 0;

  const horizontalPadding =
    outerBoxPadding +
    radioWidth +
    numberWidth +
    checkboxWidth +
    checkmarkWidth +
    cursorPadding;

  const bufferWidth = availableWidth - horizontalPadding;

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
    viewport: { width: Math.max(1, bufferWidth), height: 1 },
    singleLine: true,
    isValidPath: () => false,
  });

  const customOptionText = customBuffer.text;

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
        return true;
      }

      // Don't jump if a navigation or selection key is pressed
      if (
        keyMatchers[Command.DIALOG_NAVIGATION_UP](key) ||
        keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key) ||
        keyMatchers[Command.DIALOG_NEXT](key) ||
        keyMatchers[Command.DIALOG_PREV](key) ||
        keyMatchers[Command.MOVE_LEFT](key) ||
        keyMatchers[Command.MOVE_RIGHT](key) ||
        keyMatchers[Command.RETURN](key) ||
        keyMatchers[Command.ESCAPE](key) ||
        keyMatchers[Command.QUIT](key)
      ) {
        return false;
      }

      // Check if it's a numeric quick selection key (if numbers are shown)
      const isNumeric = /^[0-9]$/.test(key.sequence);
      if (isNumeric) {
        return false;
      }

      // Type-to-jump: if printable characters are typed and not focused, jump to custom
      const isPrintable =
        key.sequence &&
        !key.ctrl &&
        !key.alt &&
        (key.sequence.length > 1 || key.sequence.charCodeAt(0) >= 32);

      if (isPrintable && !isCustomOptionFocused) {
        dispatch({ type: 'SET_CUSTOM_FOCUSED', payload: { focused: true } });
        onEditingCustomOption?.(true);
        // For IME or multi-char sequences, we want to capture the whole thing.
        // If it's a single char, we start the buffer with it.
        customBuffer.setText(key.sequence);
        return true;
      }
      return false;
    },
    [isCustomOptionFocused, customBuffer, onEditingCustomOption],
  );

  useKeypress(handleExtraKeys, { isActive: true, priority: true });

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
    <Box flexDirection="column">
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

export const AskUserDialog: React.FC<AskUserDialogProps> = ({
  questions,
  onSubmit,
  onCancel,
  onActiveTextInputChange,
  width,
  availableHeight,
}) => {
  const [state, dispatch] = useReducer(askUserDialogReducerLogic, initialState);
  const { answers, isEditingCustomOption, submitted } = state;

  const uiState = useContext(UIStateContext);
  const terminalWidth = uiState?.terminalWidth ?? 80;
  const availableWidth = width ?? terminalWidth;

  const reviewTabIndex = questions.length;
  const tabCount =
    questions.length > 1 ? questions.length + 1 : questions.length;

  const { currentIndex, goToNextTab, goToPrevTab } = useTabbedNavigation({
    tabCount,
    isActive: !submitted && questions.length > 1,
    enableArrowNavigation: false, // We'll handle arrows via textBuffer callbacks or manually
    enableTabKey: false, // We'll handle tab manually to match existing behavior
  });

  const currentQuestionIndex = currentIndex;

  const handleEditingCustomOption = useCallback((isEditing: boolean) => {
    dispatch({ type: 'SET_EDITING_CUSTOM', payload: { isEditing } });
  }, []);

  useEffect(() => {
    onActiveTextInputChange?.(isEditingCustomOption);
    return () => {
      onActiveTextInputChange?.(false);
    };
  }, [isEditingCustomOption, onActiveTextInputChange]);

  const handleCancel = useCallback(
    (key: Key) => {
      if (submitted) return false;
      if (keyMatchers[Command.ESCAPE](key)) {
        onCancel();
        return true;
      } else if (keyMatchers[Command.QUIT](key) && !isEditingCustomOption) {
        onCancel();
        return true;
      }
      return false;
    },
    [onCancel, submitted, isEditingCustomOption],
  );

  useKeypress(handleCancel, {
    isActive: !submitted,
  });

  const isOnReviewTab = currentQuestionIndex === reviewTabIndex;

  const handleNavigation = useCallback(
    (key: Key) => {
      if (submitted || questions.length <= 1) return false;

      const isNextKey = keyMatchers[Command.DIALOG_NEXT](key);
      const isPrevKey = keyMatchers[Command.DIALOG_PREV](key);

      const isRight = keyMatchers[Command.MOVE_RIGHT](key);
      const isLeft = keyMatchers[Command.MOVE_LEFT](key);

      // Tab keys always trigger navigation.
      // Arrows trigger navigation if NOT in a text input OR if the input bubbles the event (already at edge).
      const shouldGoNext = isNextKey || isRight;
      const shouldGoPrev = isPrevKey || isLeft;

      if (shouldGoNext) {
        goToNextTab();
        return true;
      } else if (shouldGoPrev) {
        goToPrevTab();
        return true;
      }
      return false;
    },
    [questions.length, submitted, goToNextTab, goToPrevTab],
  );

  useKeypress(handleNavigation, {
    isActive: questions.length > 1 && !submitted,
  });

  useEffect(() => {
    if (submitted) {
      onSubmit(answers);
    }
  }, [submitted, answers, onSubmit]);

  const handleAnswer = useCallback(
    (answer: string) => {
      if (submitted) return;

      dispatch({
        type: 'SET_ANSWER',
        payload: {
          index: currentQuestionIndex,
          answer,
        },
      });

      if (questions.length > 1) {
        goToNextTab();
      } else {
        dispatch({ type: 'SUBMIT' });
      }
    },
    [currentQuestionIndex, questions.length, submitted, goToNextTab],
  );

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
        },
      });
    },
    [submitted, currentQuestionIndex],
  );

  const answeredIndices = useMemo(
    () => new Set(Object.keys(answers).map(Number)),
    [answers],
  );

  const currentQuestion = questions[currentQuestionIndex];

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

  const tabs = useMemo((): Tab[] => {
    const questionTabs: Tab[] = questions.map((q, i) => ({
      key: String(i),
      header: q.header,
    }));
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

  if (isOnReviewTab) {
    return (
      <MaxSizedBox maxHeight={availableHeight} maxWidth={availableWidth}>
        <Box aria-label="Review your answers">
          <ReviewView
            questions={questions}
            answers={answers}
            onSubmit={handleReviewSubmit}
            progressHeader={progressHeader}
          />
        </Box>
      </MaxSizedBox>
    );
  }

  if (!currentQuestion) return null;

  const keyboardHints = (
    <DialogFooter
      primaryAction={
        currentQuestion.type === 'text' || isEditingCustomOption
          ? 'Enter to submit'
          : 'Enter to select'
      }
      navigationActions={
        questions.length > 1
          ? currentQuestion.type === 'text' || isEditingCustomOption
            ? 'Tab/Shift+Tab to switch questions'
            : '←/→ to switch questions'
          : currentQuestion.type === 'text' || isEditingCustomOption
            ? undefined
            : '↑/↓ to navigate'
      }
    />
  );

  const questionView =
    currentQuestion.type === 'text' ? (
      <TextQuestionView
        key={currentQuestionIndex}
        question={currentQuestion}
        onAnswer={handleAnswer}
        onSelectionChange={handleSelectionChange}
        onEditingCustomOption={handleEditingCustomOption}
        availableWidth={availableWidth}
        initialAnswer={answers[currentQuestionIndex]}
        progressHeader={progressHeader}
        keyboardHints={keyboardHints}
      />
    ) : (
      <ChoiceQuestionView
        key={currentQuestionIndex}
        question={effectiveQuestion}
        onAnswer={handleAnswer}
        onSelectionChange={handleSelectionChange}
        onEditingCustomOption={handleEditingCustomOption}
        availableWidth={availableWidth}
        initialAnswer={answers[currentQuestionIndex]}
        progressHeader={progressHeader}
        keyboardHints={keyboardHints}
      />
    );

  return (
    <MaxSizedBox maxHeight={availableHeight} maxWidth={availableWidth}>
      <Box
        flexDirection="column"
        width={availableWidth}
        aria-label={`Question ${currentQuestionIndex + 1} of ${questions.length}: ${currentQuestion.question}`}
      >
        {questionView}
      </Box>
    </MaxSizedBox>
  );
};
