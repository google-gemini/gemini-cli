/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { Config } from '@google/gemini-cli-core';

export const useModelDialog = (
  config: Config,
) => {
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false);

  const openModelDialog = useCallback(() => {
    setIsModelDialogOpen(true);
  }, []);

  const handleModelSelect = useCallback(
    (model: string | undefined) => {
      if (model) {
        config.setModel(model);
      }
      setIsModelDialogOpen(false);
    },
    [config],
  );

  return {
    isModelDialogOpen,
    openModelDialog,
    handleModelSelect,
  };
};