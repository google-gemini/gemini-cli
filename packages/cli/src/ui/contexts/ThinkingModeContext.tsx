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
import type { Config } from '@google/gemini-cli-core';

export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high';

export const THINKING_BUDGETS: Record<ThinkingLevel, number> = {
  off: 0,
  low: 2048,
  medium: 8192,
  high: 24576,
};

export interface ThinkingModeState {
  level: ThinkingLevel;
  budget: number;
}

export interface ThinkingModeContextValue {
  state: ThinkingModeState;
  setThinkingLevel: (level: ThinkingLevel) => void;
}

const ThinkingModeContext = createContext<ThinkingModeContextValue | undefined>(
  undefined,
);

export const ThinkingModeProvider: React.FC<{
  children: React.ReactNode;
  config: Config | null;
}> = ({ children, config }) => {
  const [state, setState] = useState<ThinkingModeState>({
    level: 'medium',
    budget: THINKING_BUDGETS.medium,
  });

  const setThinkingLevel = useCallback(
    (level: ThinkingLevel) => {
      const budget = THINKING_BUDGETS[level];
      setState({ level, budget });

      if (config?.modelConfigService) {
        // Register override for Gemini 2.5 models (use thinkingBudget)
        config.modelConfigService.registerRuntimeModelOverride({
          match: { model: 'chat-base-2.5' },
          modelConfig: {
            generateContentConfig: {
              thinkingConfig: {
                thinkingBudget: budget,
              },
            },
          },
        });

        // Register override for Gemini 3 models (use thinkingLevel enum)
        // Note: For now we only support thinkingBudget, but this can be extended
        // to map budget values to ThinkingLevel enum for Gemini 3 models
        config.modelConfigService.registerRuntimeModelOverride({
          match: { model: 'chat-base-3' },
          modelConfig: {
            generateContentConfig: {
              thinkingConfig: {
                thinkingBudget: budget,
              },
            },
          },
        });
      }
    },
    [config],
  );

  // Apply default thinking budget on mount
  useEffect(() => {
    if (config?.modelConfigService) {
      const defaultBudget = THINKING_BUDGETS.medium;
      config.modelConfigService.registerRuntimeModelOverride({
        match: { model: 'chat-base-2.5' },
        modelConfig: {
          generateContentConfig: {
            thinkingConfig: {
              thinkingBudget: defaultBudget,
            },
          },
        },
      });
      config.modelConfigService.registerRuntimeModelOverride({
        match: { model: 'chat-base-3' },
        modelConfig: {
          generateContentConfig: {
            thinkingConfig: {
              thinkingBudget: defaultBudget,
            },
          },
        },
      });
    }
  }, [config]);

  const value = useMemo(
    () => ({
      state,
      setThinkingLevel,
    }),
    [state, setThinkingLevel],
  );

  return (
    <ThinkingModeContext.Provider value={value}>
      {children}
    </ThinkingModeContext.Provider>
  );
};

export const useThinkingMode = () => {
  const context = useContext(ThinkingModeContext);
  if (context === undefined) {
    throw new Error(
      'useThinkingMode must be used within a ThinkingModeProvider',
    );
  }
  return context;
};
