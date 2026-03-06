/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
} from 'react';
import type { Question } from '@google/gemini-cli-core';

export interface AskUserState {
  questions: Question[];
  correlationId: string;
}

interface AskUserActionsContextValue {
  request: AskUserState | null;
  submit: (answers: { [questionIndex: string]: string }) => Promise<void>;
  cancel: () => void;
  inProgressAnswers: Record<string, string>;
  setInProgressAnswer: (key: string, value: string) => void;
  clearInProgressAnswers: () => void;
}

export const AskUserActionsContext =
  createContext<AskUserActionsContextValue | null>(null);

export const useAskUserActions = () => {
  const context = useContext(AskUserActionsContext);
  if (!context) {
    throw new Error(
      'useAskUserActions must be used within an AskUserActionsProvider',
    );
  }
  return context;
};

interface AskUserActionsProviderProps {
  children: React.ReactNode;
  request: AskUserState | null;
  onSubmit: (answers: { [questionIndex: string]: string }) => Promise<void>;
  onCancel: () => void;
}

export const AskUserActionsProvider: React.FC<AskUserActionsProviderProps> = ({
  children,
  request,
  onSubmit,
  onCancel,
}) => {
  const [inProgressAnswers, setInProgressAnswersState] = useState<
    Record<string, string>
  >({});

  const setInProgressAnswer = useCallback((key: string, value: string) => {
    setInProgressAnswersState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearInProgressAnswers = useCallback(() => {
    setInProgressAnswersState({});
  }, []);

  const value = useMemo(
    () => ({
      request,
      submit: onSubmit,
      cancel: onCancel,
      inProgressAnswers,
      setInProgressAnswer,
      clearInProgressAnswers,
    }),
    [
      request,
      onSubmit,
      onCancel,
      inProgressAnswers,
      setInProgressAnswer,
      clearInProgressAnswers,
    ],
  );

  return (
    <AskUserActionsContext.Provider value={value}>
      {children}
    </AskUserActionsContext.Provider>
  );
};
