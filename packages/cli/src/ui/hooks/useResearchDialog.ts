/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { ResearchOptInSettings } from '../components/ResearchOptInDialog.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';

export function useResearchDialog(
  settings: LoadedSettings,
  setResearchError: (error: string | null) => void,
  addItem: UseHistoryManagerReturn['addItem'],
) {
  const [isResearchDialogOpen, setIsResearchDialogOpen] = useState(false);

  const openResearchDialog = useCallback(() => {
    setIsResearchDialogOpen(true);
    setResearchError(null);
  }, [setResearchError]);

  const closeResearchDialog = useCallback(() => {
    setIsResearchDialogOpen(false);
    setResearchError(null);
  }, [setResearchError]);

  const handleResearchSelect = useCallback(
    (
      researchSettings: ResearchOptInSettings | undefined,
      scope: SettingScope,
    ) => {
      if (researchSettings) {
        settings.setValue(scope, 'researchOptIn', researchSettings);
        addItem(
          {
            type: 'info',
            text: researchSettings.enabled
              ? 'Research opt-in settings saved. Thank you for helping improve Gemini CLI!'
              : 'Research opt-in disabled.',
          },
          Date.now(),
        );
      }
      closeResearchDialog();
    },
    [settings, closeResearchDialog, addItem],
  );

  return {
    isResearchDialogOpen,
    openResearchDialog,
    closeResearchDialog,
    handleResearchSelect,
  };
}
