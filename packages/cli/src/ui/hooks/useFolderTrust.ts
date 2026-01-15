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
import { coreEvents, ExitCodes } from '@google/gemini-cli-core';
import { runExitCleanup } from '../../utils/cleanup.js';

export const useFolderTrust = (
  settings: LoadedSettings,
  onTrustChange: (isTrusted: boolean | undefined) => void,
  addItem: (item: HistoryItemWithoutId, timestamp: number) => number,
) => {
  const [isTrusted, setIsTrusted] = useState<boolean | undefined>(undefined);
  const [isFolderTrustDialogOpen, setIsFolderTrustDialogOpen] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const startupMessageSent = useRef(false);

  const folderTrust = settings.merged.security.folderTrust.enabled;

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
      const trustLevelMap: Record<FolderTrustChoice, TrustLevel> = {
        [FolderTrustChoice.TRUST_FOLDER]: TrustLevel.TRUST_FOLDER,
        [FolderTrustChoice.TRUST_PARENT]: TrustLevel.TRUST_PARENT,
        [FolderTrustChoice.DO_NOT_TRUST]: TrustLevel.DO_NOT_TRUST,
      };

      const trustLevel = trustLevelMap[choice];
      if (!trustLevel) return;

      const cwd = process.cwd();
      const trustedFolders = loadTrustedFolders();

      try {
        trustedFolders.setValue(cwd, trustLevel);
      } catch (_e) {
        coreEvents.emitFeedback(
          'error',
          'Failed to save trust settings. Exiting Gemini CLI.',
        );
        setTimeout(async () => {
          await runExitCleanup();
          process.exit(ExitCodes.FATAL_CONFIG_ERROR);
        }, 100);
        return;
      }

      const currentIsTrusted =
        trustLevel === TrustLevel.TRUST_FOLDER ||
        trustLevel === TrustLevel.TRUST_PARENT;

      onTrustChange(currentIsTrusted);
      setIsTrusted(currentIsTrusted);

      // logic: we restart if the trust state *effectively* changes from the previous state.
      // previous state was `isTrusted`. If undefined, we assume false (untrusted).
      const wasTrusted = isTrusted ?? false;

      if (wasTrusted !== currentIsTrusted) {
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
