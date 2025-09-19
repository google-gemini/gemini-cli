/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import * as process from 'node:process';
import {
  loadTrustedFolders,
  TrustLevel,
  isWorkspaceTrusted,
} from '../../config/trustedFolders.js';
import { useSettings } from '../contexts/SettingsContext.js';

import { MessageType } from '../types.js';
import { type UseHistoryManagerReturn } from './useHistoryManager.js';

export const usePermissionsModifyTrust = (
  onExit: () => void,
  addItem: UseHistoryManagerReturn['addItem'],
) => {
  const [loading, setLoading] = useState(true);
  const [currentTrustLevel, setCurrentTrustLevel] = useState<
    TrustLevel | undefined
  >();
  const [pendingTrustLevel, setPendingTrustLevel] = useState<
    TrustLevel | undefined
  >();
  const [isInheritedTrustFromParent, setIsInheritedTrustFromParent] =
    useState(false);
  const [isInheritedTrustFromIde, setIsInheritedTrustFromIde] = useState(false);
  const [needsRestart, setNeedsRestart] = useState(false);
  const settings = useSettings();
  const cwd = process.cwd();

  const isFolderTrustEnabled = !!settings.merged.security?.folderTrust?.enabled;

  useEffect(() => {
    if (!isFolderTrustEnabled) {
      setLoading(false);
      return;
    }
    const folders = loadTrustedFolders();
    const explicitTrustLevel = folders.user.config[cwd];
    setCurrentTrustLevel(explicitTrustLevel);

    const { isTrusted, source } = isWorkspaceTrusted(settings.merged);

    const isInheritedTrust =
      isTrusted &&
      (!explicitTrustLevel || explicitTrustLevel === TrustLevel.DO_NOT_TRUST);

    setIsInheritedTrustFromIde(!!(source === 'ide' && isInheritedTrust));
    setIsInheritedTrustFromParent(!!(source === 'file' && isInheritedTrust));

    setLoading(false);
  }, [cwd, settings.merged, isFolderTrustEnabled]);

  const updateTrustLevel = useCallback(
    (trustLevel: TrustLevel) => {
      const wasTrusted = isWorkspaceTrusted(settings.merged).isTrusted;

      // Create a temporary config to check the new trust status without writing
      const currentConfig = loadTrustedFolders().user.config;
      const newConfig = { ...currentConfig, [cwd]: trustLevel };

      const { isTrusted, source } = isWorkspaceTrusted(
        settings.merged,
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

      if (wasTrusted !== isTrusted) {
        setPendingTrustLevel(trustLevel);
        setNeedsRestart(true);
      } else {
        const folders = loadTrustedFolders();
        folders.setValue(cwd, trustLevel);
        onExit();
      }
    },
    [cwd, settings.merged, onExit, addItem],
  );

  const commitTrustLevelChange = useCallback(() => {
    if (pendingTrustLevel) {
      const folders = loadTrustedFolders();
      folders.setValue(cwd, pendingTrustLevel);
    }
  }, [cwd, pendingTrustLevel]);

  return {
    cwd,
    loading,
    currentTrustLevel,
    isInheritedTrustFromParent,
    isInheritedTrustFromIde,
    needsRestart,
    updateTrustLevel,
    commitTrustLevelChange,
    isFolderTrustEnabled,
  };
};
