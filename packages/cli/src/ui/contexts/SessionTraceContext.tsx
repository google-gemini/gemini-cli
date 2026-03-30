/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { uiTelemetryService } from '@google/gemini-cli-core';

export const SessionTraceStepKey = {
  AgentTurn: 'agent_turn',
  SlashCommand: 'slash_command',
} as const;

export type SessionTraceStepKey =
  (typeof SessionTraceStepKey)[keyof typeof SessionTraceStepKey];

export interface SessionTraceStep {
  key: string;
  label: string;
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
  lastDurationMs: number;
}

export interface SessionTraceState {
  steps: Record<string, SessionTraceStep>;
}

interface SessionTraceContextValue {
  trace: SessionTraceState;
  recordStep: (key: string, label: string, durationMs: number) => void;
}

const INITIAL_TRACE_STATE: SessionTraceState = {
  steps: {},
};

const SessionTraceContext = createContext<SessionTraceContextValue | undefined>(
  undefined,
);

export const SessionTraceProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [trace, setTrace] = useState<SessionTraceState>(INITIAL_TRACE_STATE);

  useEffect(() => {
    const handleClear = () => {
      setTrace(INITIAL_TRACE_STATE);
    };

    uiTelemetryService.on('clear', handleClear);
    return () => {
      uiTelemetryService.off('clear', handleClear);
    };
  }, []);

  const recordStep = useCallback(
    (key: string, label: string, durationMs: number) => {
      const safeDuration =
        Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;

      setTrace((previous) => {
        const existing = previous.steps[key];

        return {
          steps: {
            ...previous.steps,
            [key]: {
              key,
              label,
              count: (existing?.count ?? 0) + 1,
              totalDurationMs: (existing?.totalDurationMs ?? 0) + safeDuration,
              maxDurationMs: Math.max(
                existing?.maxDurationMs ?? 0,
                safeDuration,
              ),
              lastDurationMs: safeDuration,
            },
          },
        };
      });
    },
    [],
  );

  const value = useMemo(
    () => ({
      trace,
      recordStep,
    }),
    [trace, recordStep],
  );

  return (
    <SessionTraceContext.Provider value={value}>
      {children}
    </SessionTraceContext.Provider>
  );
};

export const useSessionTrace = () => {
  const context = useContext(SessionTraceContext);
  if (context === undefined) {
    throw new Error(
      'useSessionTrace must be used within a SessionTraceProvider',
    );
  }
  return context;
};
