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

export interface CumulativeStats {
  turnCount: number;
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  cachedContentTokenCount: number;
  toolUsePromptTokenCount: number;
  thoughtsTokenCount: number;
  apiTimeMs: number;
}

interface SessionStatsState {
  sessionStartTime: Date;
  cumulative: CumulativeStats;
  currentTurn: CumulativeStats;
  currentResponse: CumulativeStats;
}

// Defines the final "value" of our context, including the state
// and the functions to update it.
interface SessionStatsContextValue {
  stats: SessionStatsState;
  startNewTurn: () => void;
  addUsage: (
    metadata: GenerateContentResponseUsageMetadata & { apiTimeMs?: number },
  ) => void;
}

// --- Context Definition ---

const SessionStatsContext = createContext<SessionStatsContextValue | undefined>(
  undefined,
);

// --- Helper Functions ---

/**
 * A small, reusable helper function to sum token counts.
 * It unconditionally adds all token values from the source to the target.
 * @param target The object to add the tokens to (e.g., cumulative, currentTurn).
 * @param source The metadata object from the API response.
 */
const addTokens = (
  target: CumulativeStats,
  source: GenerateContentResponseUsageMetadata & { apiTimeMs?: number },
) => {
  target.candidatesTokenCount += source.candidatesTokenCount ?? 0;
  target.thoughtsTokenCount += source.thoughtsTokenCount ?? 0;
  target.totalTokenCount += source.totalTokenCount ?? 0;
  target.apiTimeMs += source.apiTimeMs ?? 0;
  target.promptTokenCount += source.promptTokenCount ?? 0;
  target.cachedContentTokenCount += source.cachedContentTokenCount ?? 0;
  target.toolUsePromptTokenCount += source.toolUsePromptTokenCount ?? 0;
};

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
      apiTimeMs: 0,
    },
    currentTurn: {
      turnCount: 0,
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
      cachedContentTokenCount: 0,
      toolUsePromptTokenCount: 0,
      thoughtsTokenCount: 0,
      apiTimeMs: 0,
    },
    currentResponse: {
      turnCount: 0,
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
      cachedContentTokenCount: 0,
      toolUsePromptTokenCount: 0,
      thoughtsTokenCount: 0,
      apiTimeMs: 0,
    },
  });

  // A single, internal worker function to handle all metadata aggregation.
  const aggregateTokens = useCallback(
    (
      metadata: GenerateContentResponseUsageMetadata & { apiTimeMs?: number },
    ) => {
      setStats((prevState) => {
        const newCumulative = { ...prevState.cumulative };
        const newCurrentTurn = { ...prevState.currentTurn };
        const newCurrentResponse = {
          turnCount: 0,
          promptTokenCount: 0,
          candidatesTokenCount: 0,
          totalTokenCount: 0,
          cachedContentTokenCount: 0,
          toolUsePromptTokenCount: 0,
          thoughtsTokenCount: 0,
          apiTimeMs: 0,
        };

        // Add all tokens to the current turn's stats as well as cumulative stats.
        addTokens(newCurrentTurn, metadata);
        addTokens(newCumulative, metadata);
        addTokens(newCurrentResponse, metadata);

        return {
          ...prevState,
          cumulative: newCumulative,
          currentTurn: newCurrentTurn,
          currentResponse: newCurrentResponse,
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
      currentTurn: {
        turnCount: 0, // Reset for the new turn's accumulation.
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
        cachedContentTokenCount: 0,
        toolUsePromptTokenCount: 0,
        thoughtsTokenCount: 0,
        apiTimeMs: 0,
      },
      currentResponse: {
        turnCount: 0,
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
        cachedContentTokenCount: 0,
        toolUsePromptTokenCount: 0,
        thoughtsTokenCount: 0,
        apiTimeMs: 0,
      },
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
