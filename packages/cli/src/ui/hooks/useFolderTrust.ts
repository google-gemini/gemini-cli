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
import {
  coreEvents,
  ExitCodes,
  isHeadlessMode,
  FolderTrustDiscoveryService,
  type FolderDiscoveryResults,
} from '@google/gemini-cli-core';
import { runExitCleanup } from '../../utils/cleanup.js';

export const useFolderTrust = (
  settings: LoadedSettings,
  onTrustChange: (isTrusted: boolean | undefined) => void,
  addItem: (item: HistoryItemWithoutId, timestamp: number) => number,
) => {
  const [isTrusted, setIsTrusted] = useState<boolean | undefined>(undefined);
  const [isFolderTrustDialogOpen, setIsFolderTrustDialogOpen] = useState(false);
  const [discoveryResults, setDiscoveryResults] =
    useState<FolderDiscoveryResults | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const startupMessageSent = useRef(false);

  const folderTrust = settings.merged.security.folderTrust.enabled ?? true;

  useEffect(() => {
    let isMounted = true;
    const { isTrusted: trusted } = isWorkspaceTrusted(settings.merged);

    if (trusted === undefined || trusted === false) {
      void FolderTrustDiscoveryService.discover(process.cwd())
        .then((results) => {
          if (isMounted) {
            setDiscoveryResults(results);
          }
        })
        .catch(() => {
          // Silently ignore discovery errors as they are handled within the service
          // and reported via results.discoveryErrors if successful.
        });
    }

    const showUntrustedMessage = () => {
      if (trusted === false && !startupMessageSent.current) {
        addItem(
          {
            type: MessageType.INFO,
            text: 'This folder is untrusted, project settings, hooks, MCPs, and GEMINI.md files will not be applied for this folder.\nUse the `/permissions` command to change the trust level.',
          },
          Date.now(),
        );
        startupMessageSent.current = true;
      }
    };

    if (isHeadlessMode()) {
      if (isMounted) {
        setIsTrusted(trusted);
        setIsFolderTrustDialogOpen(false);
        onTrustChange(true);
        showUntrustedMessage();
      }
    } else if (isMounted) {
      setIsTrusted(trusted);
      setIsFolderTrustDialogOpen(trusted === undefined);
      onTrustChange(trusted);
      showUntrustedMessage();
    }

    return () => {
      isMounted = false;
    };
  }, [folderTrust, onTrustChange, settings.merged, addItem]);

  const handleFolderTrustSelect = useCallback(
    async (choice: FolderTrustChoice) => {
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
        await trustedFolders.setValue(cwd, trustLevel);
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
    discoveryResults,
    handleFolderTrustSelect,
    isRestarting,
  };
};
