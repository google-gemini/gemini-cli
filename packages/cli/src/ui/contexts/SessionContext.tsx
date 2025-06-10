/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
} from 'react';

import { type GenerateContentResponseUsageMetadata } from '@google/genai';

// --- Interface Definitions ---

interface CumulativeStats {
  turnCount: number;
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  cachedContentTokenCount: number;
  toolUsePromptTokenCount: number;
  thoughtsTokenCount: number;
}

interface LastTurnStats {
  metadata: GenerateContentResponseUsageMetadata;
  // TODO(abhipatel12): Add apiTime, etc. here in a future step.
}

interface SessionStatsState {
  sessionStartTime: Date;
  cumulative: CumulativeStats;
  lastTurn: LastTurnStats | null;
  isNewTurnForAggregation: boolean;
}

// Defines the final "value" of our context, including the state
// and the functions to update it.
interface SessionStatsContextValue {
  stats: SessionStatsState;
  startNewTurn: () => void;
  addUsage: (metadata: GenerateContentResponseUsageMetadata) => void;
}

// --- Context Definition ---

const SessionStatsContext = createContext<SessionStatsContextValue | undefined>(
  undefined,
);

// --- Provider Component ---

export const SessionStatsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [stats, setStats] = useState<SessionStatsState>({
    sessionStartTime: new Date(),
    cumulative: {
      turnCount: 0,
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
      cachedContentTokenCount: 0,
      toolUsePromptTokenCount: 0,
      thoughtsTokenCount: 0,
    },
    lastTurn: null,
    isNewTurnForAggregation: true,
  });

  // A single, internal worker function to handle all metadata aggregation.
  const aggregateTokens = useCallback(
    (metadata: GenerateContentResponseUsageMetadata) => {
      setStats((prevState) => {
        const { isNewTurnForAggregation } = prevState;
        const newCumulative = { ...prevState.cumulative };

        newCumulative.candidatesTokenCount +=
          metadata.candidatesTokenCount ?? 0;
        newCumulative.thoughtsTokenCount += metadata.thoughtsTokenCount ?? 0;
        newCumulative.totalTokenCount += metadata.totalTokenCount ?? 0;

        if (isNewTurnForAggregation) {
          newCumulative.promptTokenCount += metadata.promptTokenCount ?? 0;
          newCumulative.cachedContentTokenCount +=
            metadata.cachedContentTokenCount ?? 0;
          newCumulative.toolUsePromptTokenCount +=
            metadata.toolUsePromptTokenCount ?? 0;
        }

        return {
          ...prevState,
          cumulative: newCumulative,
          lastTurn: { metadata },
          isNewTurnForAggregation: false,
        };
      });
    },
    [],
  );

  const startNewTurn = useCallback(() => {
    setStats((prevState) => ({
      ...prevState,
      cumulative: {
        ...prevState.cumulative,
        turnCount: prevState.cumulative.turnCount + 1,
      },
      isNewTurnForAggregation: true,
    }));
  }, []);

  const value = useMemo(
    () => ({
      stats,
      startNewTurn,
      addUsage: aggregateTokens,
    }),
    [stats, startNewTurn, aggregateTokens],
  );

  return (
    <SessionStatsContext.Provider value={value}>
      {children}
    </SessionStatsContext.Provider>
  );
};

// --- Consumer Hook ---

export const useSessionStats = () => {
  const context = useContext(SessionStatsContext);
  if (context === undefined) {
    throw new Error(
      'useSessionStats must be used within a SessionStatsProvider',
    );
  }
  return context;
};
