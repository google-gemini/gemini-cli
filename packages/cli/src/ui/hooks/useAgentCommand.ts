/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';

interface UseAgentCommandReturn {
  isAgentDialogOpen: boolean;
  openAgentDialog: () => void;
  closeAgentDialog: () => void;
}

export const useAgentCommand = (): UseAgentCommandReturn => {
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false);

  const openAgentDialog = useCallback(() => {
    setIsAgentDialogOpen(true);
  }, []);

  const closeAgentDialog = useCallback(() => {
    setIsAgentDialogOpen(false);
  }, []);

  return {
    isAgentDialogOpen,
    openAgentDialog,
    closeAgentDialog,
  };
};
