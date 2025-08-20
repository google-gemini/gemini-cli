/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useContext } from 'react';
import { Settings, LoadedSettings } from '../../config/settings.js';
import { FolderTrustChoice } from '../components/FolderTrustDialog.js';
import {
  loadTrustedFolders,
  TrustLevel,
  isWorkspaceTrusted,
} from '../../config/trustedFolders.js';
import * as process from 'process';
import { SettingsContext } from '../contexts/SettingsContext.js';

export const useFolderTrust = (
  settings: LoadedSettings,
  onTrustChange: (isTrusted: boolean | undefined) => void,
) => {
  const [isTrusted, setIsTrusted] = useState<boolean | undefined>(undefined);
  const [isFolderTrustDialogOpen, setIsFolderTrustDialogOpen] = useState(false);
  const settingsContext = useContext(SettingsContext);

  const { folderTrust, folderTrustFeature } = settings.merged;
  useEffect(() => {
    const trusted = isWorkspaceTrusted({
      folderTrust,
      folderTrustFeature,
    } as Settings);
    setIsTrusted(trusted);
    setIsFolderTrustDialogOpen(trusted === undefined);
    onTrustChange(trusted);
  }, [onTrustChange, folderTrust, folderTrustFeature]);

  const handleFolderTrustSelect = useCallback(
    (choice: FolderTrustChoice) => {
      const trustedFolders = loadTrustedFolders();
      const cwd = process.cwd();
      let trustLevel: TrustLevel;

      switch (choice) {
        case FolderTrustChoice.TRUST_FOLDER:
          trustLevel = TrustLevel.TRUST_FOLDER;
          break;
        case FolderTrustChoice.TRUST_PARENT:
          trustLevel = TrustLevel.TRUST_PARENT;
          break;
        case FolderTrustChoice.DO_NOT_TRUST:
          trustLevel = TrustLevel.DO_NOT_TRUST;
          break;
        default:
          return;
      }

      trustedFolders.setValue(cwd, trustLevel);
      const trusted = isWorkspaceTrusted({
        folderTrust,
        folderTrustFeature,
      } as Settings);
      setIsTrusted(trusted);
      setIsFolderTrustDialogOpen(false);
      onTrustChange(trusted);
      settingsContext?.recomputeSettings();
    },
    [onTrustChange, folderTrust, folderTrustFeature, settingsContext],
  );

  return {
    isTrusted,
    isFolderTrustDialogOpen,
    handleFolderTrustSelect,
  };
};
