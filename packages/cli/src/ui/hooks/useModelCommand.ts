/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useMemo } from 'react';
import {
  ALL_GEMINI_MODELS,
  Config,
  DEFAULT_GEMINI_MODEL,
} from '@google/gemini-cli-core';
import { HistoryItem, MessageType } from '../types.js';

interface UseModelCommandReturn {
  isModelDialogOpen: boolean;
  openModelDialog: () => void;
  handleModelSelect: (modelName: string | undefined) => void;
  availableModels: string[];
  currentModel: string;
}

export const useModelCommand = (
  config: Config | null,
  addItem: (item: Omit<HistoryItem, 'id'>, timestamp: number) => void,
): UseModelCommandReturn => {
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);
  const availableModels = useMemo(() => ALL_GEMINI_MODELS, []);

  const openModelDialog = useCallback(() => {
    setIsModelDialogOpen(true);
  }, []);

  const handleModelSelect = useCallback(
    (modelName: string | undefined) => {
      if (config && modelName && availableModels.includes(modelName)) {
        config.setModel(modelName);
        addItem(
          {
            type: MessageType.INFO,
            text: `Model set to ${modelName}`,
          },
          Date.now(),
        );
      }
      setIsModelDialogOpen(false);
    },
    [config, addItem, availableModels],
  );

  return {
    isModelDialogOpen,
    openModelDialog,
    handleModelSelect,
    availableModels,
    currentModel: config?.getModel() || DEFAULT_GEMINI_MODEL,
  };
};
