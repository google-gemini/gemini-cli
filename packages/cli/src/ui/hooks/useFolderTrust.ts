/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { type Config } from '@google/gemini-cli-core';
import { LoadedSettings } from '../../config/settings.js';
import { FolderTrustChoice } from '../components/FolderTrustDialog.js';
import { loadTrustedFolders, TrustLevel } from '../../config/trustedFolders.js';
import * as process from 'process';

export const useFolderTrust = (settings: LoadedSettings, config: Config) => {
  const [isFolderTrustDialogOpen, setIsFolderTrustDialogOpen] = useState(
    config.isTrustedFolder() === undefined,
  );

  const handleFolderTrustSelect = useCallback((choice: FolderTrustChoice) => {
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
    setIsFolderTrustDialogOpen(false);
  }, []);

  return {
    isFolderTrustDialogOpen,
    handleFolderTrustSelect,
  };
};
