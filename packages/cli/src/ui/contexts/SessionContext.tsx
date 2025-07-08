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
  useEffect,
} from 'react';

import {
  uiTelemetryService,
  SessionMetrics,
  ModelMetrics,
} from '@google/gemini-cli-core';

// --- Interface Definitions ---

export type { SessionMetrics, ModelMetrics };

export interface SessionStatsState {
  sessionStartTime: Date;
  metrics: SessionMetrics;
  lastPromptTokenCount: number;
}

export interface ComputedSessionStats {
  totalApiTime: number;
  totalToolTime: number;
  agentActiveTime: number;
  apiTimePercent: number;
  toolTimePercent: number;
  cacheEfficiency: number;
  totalDecisions: number;
  successRate: number;
  agreementRate: number;
  totalCachedTokens: number;
  totalPromptTokens: number;
}

// Defines the final "value" of our context, including the state
// and the functions to update it.
interface SessionStatsContextValue {
  stats: SessionStatsState;
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
    metrics: uiTelemetryService.getMetrics(),
    lastPromptTokenCount: 0,
  });

  useEffect(() => {
    const handleUpdate = ({
      metrics,
      lastPromptTokenCount,
    }: {
      metrics: SessionMetrics;
      lastPromptTokenCount: number;
    }) => {
      setStats((prevState) => ({
        ...prevState,
        metrics,
        lastPromptTokenCount,
      }));
    };

    uiTelemetryService.on('update', handleUpdate);
    // Set initial state
    handleUpdate({
      metrics: uiTelemetryService.getMetrics(),
      lastPromptTokenCount: uiTelemetryService.getLastPromptTokenCount(),
    });

    return () => {
      uiTelemetryService.off('update', handleUpdate);
    };
  }, []);

  const value = useMemo(
    () => ({
      stats,
    }),
    [stats],
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
