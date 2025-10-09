/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { LoadedSettings } from '../../config/settings.js';
import { FolderTrustChoice } from '../components/FolderTrustDialog.js';
import {
  loadTrustedFolders,
  TrustLevel,
  isWorkspaceTrusted,
} from '../../config/trustedFolders.js';
import * as process from 'node:process';
import { type HistoryItemWithoutId, MessageType } from '../types.js';

export const useFolderTrust = (
  settings: LoadedSettings,
  onTrustChange: (isTrusted: boolean | undefined) => void,
  addItem: (item: HistoryItemWithoutId, timestamp: number) => number,
) => {
  const [isTrusted, setIsTrusted] = useState<boolean | undefined>(undefined);
  const [isFolderTrustDialogOpen, setIsFolderTrustDialogOpen] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const startupMessageSent = useRef(false);

  const folderTrust = settings.merged.security?.folderTrust?.enabled;

  useEffect(() => {
    const { isTrusted: trusted } = isWorkspaceTrusted(settings.merged);
    setIsTrusted(trusted);
    setIsFolderTrustDialogOpen(trusted === undefined);
    onTrustChange(trusted);

    if (trusted === false && !startupMessageSent.current) {
      addItem(
        {
          type: MessageType.INFO,
          text: 'This folder is not trusted. Some features may be disabled. Use the `/permissions` command to change the trust level.',
        },
        Date.now(),
      );
      startupMessageSent.current = true;
    }
  }, [folderTrust, onTrustChange, settings.merged, addItem]);

  const handleFolderTrustSelect = useCallback(
    (choice: FolderTrustChoice) => {
      const trustedFolders = loadTrustedFolders();
      const cwd = process.cwd();
      let trustLevel: TrustLevel;

      const wasTrusted = isTrusted ?? true;

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
      const currentIsTrusted =
        trustLevel === TrustLevel.TRUST_FOLDER ||
        trustLevel === TrustLevel.TRUST_PARENT;
      setIsTrusted(currentIsTrusted);
      onTrustChange(currentIsTrusted);

      const needsRestart = wasTrusted !== currentIsTrusted;
      if (needsRestart) {
        setIsRestarting(true);
        setIsFolderTrustDialogOpen(true);
      } else {
        setIsFolderTrustDialogOpen(false);
      }
    },
    [onTrustChange, isTrusted],
  );

  return {
    isTrusted,
    isFolderTrustDialogOpen,
    handleFolderTrustSelect,
    isRestarting,
  };
};
