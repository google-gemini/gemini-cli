/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';

interface UseVoiceModelCommandReturn {
  isVoiceModelDialogOpen: boolean;
  openVoiceModelDialog: () => void;
  closeVoiceModelDialog: () => void;
}

export const useVoiceModelCommand = (): UseVoiceModelCommandReturn => {
  const [isVoiceModelDialogOpen, setIsVoiceModelDialogOpen] = useState(false);

  const openVoiceModelDialog = useCallback(() => {
    setIsVoiceModelDialogOpen(true);
  }, []);

  const closeVoiceModelDialog = useCallback(() => {
    setIsVoiceModelDialogOpen(false);
  }, []);

  return {
    isVoiceModelDialogOpen,
    openVoiceModelDialog,
    closeVoiceModelDialog,
  };
};
