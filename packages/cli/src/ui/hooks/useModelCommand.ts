/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import type { Config } from '@google/gemini-cli-core';

interface UseModelCommandReturn {
  isModelDialogOpen: boolean;
  openModelDialog: () => void;
  closeModelDialog: () => void;
  handleModelSelect: (model: string) => void;
}

export const useModelCommand = (config: Config): UseModelCommandReturn => {
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);

  const openModelDialog = useCallback(() => {
    setIsModelDialogOpen(true);
  }, []);

  const closeModelDialog = useCallback(() => {
    setIsModelDialogOpen(false);
  }, []);

  const handleModelSelect = useCallback(
    (model: string) => {
      config.setModel(model);
      setIsModelDialogOpen(false);
    },
    [config],
  );

  return {
    isModelDialogOpen,
    openModelDialog,
    closeModelDialog,
    handleModelSelect,
  };
};
