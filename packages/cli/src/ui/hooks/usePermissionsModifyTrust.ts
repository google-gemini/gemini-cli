/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import * as process from 'node:process';
import * as path from 'node:path';
import {
  loadTrustedFolders,
  TrustLevel,
  isWorkspaceTrusted,
} from '../../config/trustedFolders.js';
import {
  persistHostTrust,
  writeTrustRequest,
} from '../../utils/sandboxTrust.js';
import { useSettings } from '../contexts/SettingsContext.js';

import { MessageType } from '../types.js';
import { type UseHistoryManagerReturn } from './useHistoryManager.js';
import type { LoadedSettings } from '../../config/settings.js';
import { coreEvents } from '@google/gemini-cli-core';

interface TrustState {
  currentTrustLevel: TrustLevel | undefined;
  isInheritedTrustFromParent: boolean;
  isInheritedTrustFromIde: boolean;
}

function getInitialTrustState(
  settings: LoadedSettings,
  cwd: string,
  isCurrentWorkspace: boolean,
): TrustState {
  const folders = loadTrustedFolders();
  const explicitTrustLevel = folders.user.config[cwd];

  if (!isCurrentWorkspace) {
    return {
      currentTrustLevel: explicitTrustLevel,
      isInheritedTrustFromParent: false,
      isInheritedTrustFromIde: false,
    };
  }

  const { isTrusted, source } = isWorkspaceTrusted(
    settings.merged,
    process.cwd(),
  );

  const isInheritedTrust =
    isTrusted &&
    (!explicitTrustLevel || explicitTrustLevel === TrustLevel.DO_NOT_TRUST);

  return {
    currentTrustLevel: explicitTrustLevel,
    isInheritedTrustFromParent: !!(source === 'file' && isInheritedTrust),
    isInheritedTrustFromIde: !!(source === 'ide' && isInheritedTrust),
  };
}

async function saveTrustLevel(
  folderPath: string,
  level: TrustLevel,
): Promise<void> {
  if (process.env['SANDBOX']) {
    await writeTrustRequest(folderPath, level);
    return;
  }
  await persistHostTrust(folderPath, level);
}

export const usePermissionsModifyTrust = (
  onExit: () => void,
  addItem: UseHistoryManagerReturn['addItem'],
  targetDirectory: string,
) => {
  const settings = useSettings();
  const cwd = targetDirectory;
  // Normalize paths for case-insensitive file systems (macOS/Windows) to ensure
  // accurate comparison between targetDirectory and process.cwd().
  const isCurrentWorkspace =
    path.resolve(targetDirectory).toLowerCase() ===
    path.resolve(process.cwd()).toLowerCase();

  const [initialState] = useState(() =>
    getInitialTrustState(settings, cwd, isCurrentWorkspace),
  );

  const [currentTrustLevel] = useState<TrustLevel | undefined>(
    initialState.currentTrustLevel,
  );
  const [pendingTrustLevel, setPendingTrustLevel] = useState<
    TrustLevel | undefined
  >();
  const [isInheritedTrustFromParent] = useState(
    initialState.isInheritedTrustFromParent,
  );
  const [isInheritedTrustFromIde] = useState(
    initialState.isInheritedTrustFromIde,
  );
  const [needsRestart, setNeedsRestart] = useState(false);

  const isFolderTrustEnabled =
    settings.merged.security.folderTrust.enabled ?? true;

  const updateTrustLevel = useCallback(
    async (trustLevel: TrustLevel) => {
      // If we are not editing the current workspace, the logic is simple:
      // just save the setting and exit. No restart or warnings are needed.
      if (!isCurrentWorkspace) {
        await saveTrustLevel(cwd, trustLevel);
        onExit();
        return;
      }

      // All logic below only applies when editing the current workspace.
      const wasTrusted =
        process.env['GEMINI_CLI_TRUST_WORKSPACE'] === 'true'
          ? true
          : process.env['GEMINI_CLI_TRUST_WORKSPACE'] === 'false'
            ? false
            : isWorkspaceTrusted(settings.merged, process.cwd()).isTrusted;

      const willBeTrusted =
        trustLevel === TrustLevel.TRUST_FOLDER ||
        trustLevel === TrustLevel.TRUST_PARENT;

      // Create a temporary config to check the new trust status without writing
      const currentConfig = loadTrustedFolders().user.config;
      const newConfig = { ...currentConfig, [cwd]: trustLevel };

      const { isTrusted, source } = isWorkspaceTrusted(
        settings.merged,
        process.cwd(),
        newConfig,
      );

      if (trustLevel === TrustLevel.DO_NOT_TRUST && isTrusted) {
        let message =
          'Note: This folder is still trusted because the connected IDE workspace is trusted.';
        if (source === 'file') {
          message =
            'Note: This folder is still trusted because a parent folder is trusted.';
        }
        addItem(
          {
            type: MessageType.WARNING,
            text: message,
          },
          Date.now(),
        );
      }

      if (wasTrusted !== willBeTrusted) {
        setPendingTrustLevel(trustLevel);
        setNeedsRestart(true);
      } else {
        try {
          await saveTrustLevel(cwd, trustLevel);
        } catch {
          coreEvents.emitFeedback(
            'error',
            'Failed to save trust settings. Your changes may not persist.',
          );
        }
        onExit();
      }
    },
    [cwd, settings.merged, onExit, addItem, isCurrentWorkspace],
  );

  const commitTrustLevelChange = useCallback(async () => {
    if (pendingTrustLevel) {
      try {
        await saveTrustLevel(cwd, pendingTrustLevel);
        return true;
      } catch {
        coreEvents.emitFeedback(
          'error',
          'Failed to save trust settings. Your changes may not persist.',
        );
        setNeedsRestart(false);
        setPendingTrustLevel(undefined);
        return false;
      }
    }
    return true;
  }, [cwd, pendingTrustLevel]);

  return {
    cwd,
    currentTrustLevel,
    isInheritedTrustFromParent,
    isInheritedTrustFromIde,
    needsRestart,
    updateTrustLevel,
    commitTrustLevelChange,
    isFolderTrustEnabled,
  };
};
