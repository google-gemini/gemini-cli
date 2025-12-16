/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useState,
  useMemo,
  useEffect,
} from 'react';

import type {
  SessionMetrics,
  ModelMetrics,
  ToolCallStats,
} from '@google/gemini-cli-core';
import { uiTelemetryService, sessionId } from '@google/gemini-cli-core';

export enum ToolCallDecision {
  ACCEPT = 'accept',
  REJECT = 'reject',
  MODIFY = 'modify',
  AUTO_ACCEPT = 'auto_accept',
}

function areModelMetricsEqual(a: ModelMetrics, b: ModelMetrics): boolean {
  if (
    a.api.totalRequests !== b.api.totalRequests ||
    a.api.totalErrors !== b.api.totalErrors ||
    a.api.totalLatencyMs !== b.api.totalLatencyMs
  ) {
    return false;
  }
  if (
    a.tokens.input !== b.tokens.input ||
    a.tokens.prompt !== b.tokens.prompt ||
    a.tokens.candidates !== b.tokens.candidates ||
    a.tokens.total !== b.tokens.total ||
    a.tokens.cached !== b.tokens.cached ||
    a.tokens.thoughts !== b.tokens.thoughts ||
    a.tokens.tool !== b.tokens.tool
  ) {
    return false;
  }
  return true;
}

function areToolCallStatsEqual(a: ToolCallStats, b: ToolCallStats): boolean {
  if (
    a.count !== b.count ||
    a.success !== b.success ||
    a.fail !== b.fail ||
    a.durationMs !== b.durationMs
  ) {
    return false;
  }
  if (
    a.decisions[ToolCallDecision.ACCEPT] !==
      b.decisions[ToolCallDecision.ACCEPT] ||
    a.decisions[ToolCallDecision.REJECT] !==
      b.decisions[ToolCallDecision.REJECT] ||
    a.decisions[ToolCallDecision.MODIFY] !==
      b.decisions[ToolCallDecision.MODIFY] ||
    a.decisions[ToolCallDecision.AUTO_ACCEPT] !==
      b.decisions[ToolCallDecision.AUTO_ACCEPT]
  ) {
    return false;
  }
  return true;
}

function areMetricsEqual(a: SessionMetrics, b: SessionMetrics): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  // Compare files
  if (
    a.files.totalLinesAdded !== b.files.totalLinesAdded ||
    a.files.totalLinesRemoved !== b.files.totalLinesRemoved
  ) {
    return false;
  }

  // Compare tools
  const toolsA = a.tools;
  const toolsB = b.tools;
  if (
    toolsA.totalCalls !== toolsB.totalCalls ||
    toolsA.totalSuccess !== toolsB.totalSuccess ||
    toolsA.totalFail !== toolsB.totalFail ||
    toolsA.totalDurationMs !== toolsB.totalDurationMs
  ) {
    return false;
  }

  // Compare tool decisions
  if (
    toolsA.totalDecisions[ToolCallDecision.ACCEPT] !==
      toolsB.totalDecisions[ToolCallDecision.ACCEPT] ||
    toolsA.totalDecisions[ToolCallDecision.REJECT] !==
      toolsB.totalDecisions[ToolCallDecision.REJECT] ||
    toolsA.totalDecisions[ToolCallDecision.MODIFY] !==
      toolsB.totalDecisions[ToolCallDecision.MODIFY] ||
    toolsA.totalDecisions[ToolCallDecision.AUTO_ACCEPT] !==
      toolsB.totalDecisions[ToolCallDecision.AUTO_ACCEPT]
  ) {
    return false;
  }

  // Compare tools.byName
  const toolsByNameAKeys = Object.keys(toolsA.byName);
  const toolsByNameBKeys = Object.keys(toolsB.byName);
  if (toolsByNameAKeys.length !== toolsByNameBKeys.length) return false;

  for (const key of toolsByNameAKeys) {
    const toolA = toolsA.byName[key];
    const toolB = toolsB.byName[key];
    if (!toolB || !areToolCallStatsEqual(toolA, toolB)) {
      return false;
    }
  }

  // Compare models
  const modelsAKeys = Object.keys(a.models);
  const modelsBKeys = Object.keys(b.models);
  if (modelsAKeys.length !== modelsBKeys.length) return false;

  for (const key of modelsAKeys) {
    if (!b.models[key] || !areModelMetricsEqual(a.models[key], b.models[key])) {
      return false;
    }
  }

  return true;
}

export type { SessionMetrics, ModelMetrics };

export interface SessionStatsState {
  sessionId: string;
  sessionStartTime: Date;
  metrics: SessionMetrics;
  lastPromptTokenCount: number;
  promptCount: number;
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
  totalInputTokens: number;
  totalPromptTokens: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
}

// Defines the final "value" of our context, including the state
// and the functions to update it.
interface SessionStatsContextValue {
  stats: SessionStatsState;
  startNewPrompt: () => void;
  getPromptCount: () => number;
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
    sessionId,
    sessionStartTime: new Date(),
    metrics: uiTelemetryService.getMetrics(),
    lastPromptTokenCount: 0,
    promptCount: 0,
  });

  useEffect(() => {
    const handleUpdate = ({
      metrics,
      lastPromptTokenCount,
    }: {
      metrics: SessionMetrics;
      lastPromptTokenCount: number;
    }) => {
      setStats((prevState) => {
        if (
          prevState.lastPromptTokenCount === lastPromptTokenCount &&
          areMetricsEqual(prevState.metrics, metrics)
        ) {
          return prevState;
        }
        return {
          ...prevState,
          metrics,
          lastPromptTokenCount,
        };
      });
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

  const startNewPrompt = useCallback(() => {
    setStats((prevState) => ({
      ...prevState,
      promptCount: prevState.promptCount + 1,
    }));
  }, []);

  const getPromptCount = useCallback(
    () => stats.promptCount,
    [stats.promptCount],
  );

  const value = useMemo(
    () => ({
      stats,
      startNewPrompt,
      getPromptCount,
    }),
    [stats, startNewPrompt, getPromptCount],
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
