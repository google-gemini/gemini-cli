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
import { relaunchApp } from '../../utils/processUtils.js';

export const usePermissionsModifyTrust = (onExit: () => void) => {
  const [loading, setLoading] = useState(true);
  const [currentTrustLevel, setCurrentTrustLevel] = useState<
    TrustLevel | undefined
  >();
  const [isInheritedTrust, setIsInheritedTrust] = useState(false);
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

    const effectiveTrust = isWorkspaceTrusted(settings.merged);
    if (
      effectiveTrust &&
      (!explicitTrustLevel || explicitTrustLevel === TrustLevel.DO_NOT_TRUST)
    ) {
      setIsInheritedTrust(true);
    } else {
      setIsInheritedTrust(false);
    }

    setLoading(false);
  }, [cwd, settings.merged, isFolderTrustEnabled]);

  const updateTrustLevel = useCallback(
    (trustLevel: TrustLevel) => {
      const wasTrusted = isWorkspaceTrusted(settings.merged);

      const folders = loadTrustedFolders();
      folders.setValue(cwd, trustLevel);

      const isTrusted = isWorkspaceTrusted(settings.merged);

      if (wasTrusted !== isTrusted) {
        setNeedsRestart(true);
        setTimeout(() => {
          relaunchApp();
          onExit();
        }, 250);
      } else {
        onExit();
      }
    },
    [cwd, settings.merged, onExit],
  );

  return {
    cwd,
    loading,
    currentTrustLevel,
    isInheritedTrust,
    needsRestart,
    updateTrustLevel,
    isFolderTrustEnabled,
  };
};
