/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { FolderTrustChoice } from '../components/FolderTrustDialog.js';

export const useFolderTrust = (settings: LoadedSettings) => {
  const [isFolderTrustDialogOpen, setIsFolderTrustDialogOpen] = useState(
    !!settings.merged.folderTrustFeature &&
      // TODO: Update to avoid showing dialog for folders that are trusted.
      settings.merged.folderTrust === undefined,
  );

  const handleFolderTrustSelect = useCallback(
    (_choice: FolderTrustChoice) => {
      // TODO: Store folderPath in the trusted folders config file based on the choice.
      settings.setValue(SettingScope.User, 'folderTrust', true);
      setIsFolderTrustDialogOpen(false);
    },
    [settings],
  );

  return {
    isFolderTrustDialogOpen,
    handleFolderTrustSelect,
  };
};
