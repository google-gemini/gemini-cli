/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { createContext, useContext, useState, useCallback } from 'react';

interface AskUserActionsContextValue {
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
}

export const AskUserActionsProvider: React.FC<AskUserActionsProviderProps> = ({
  children,
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

  return (
    <AskUserActionsContext.Provider
      value={{ inProgressAnswers, setInProgressAnswer, clearInProgressAnswers }}
    >
      {children}
    </AskUserActionsContext.Provider>
  );
};
