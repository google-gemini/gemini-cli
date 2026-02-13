/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { type Config } from '@google/gemini-cli-core';
import { type Settings } from '../../config/settings.js';
import { getAllSessionFiles } from '../../utils/sessionUtils.js';
import { identifySessionsToDelete } from '../../utils/sessionCleanup.js';
import path from 'node:path';

export function useSessionRetentionCheck(
  config: Config,
  settings: Settings,
  onAutoEnable?: () => void,
) {
  const [shouldShowWarning, setShouldShowWarning] = useState(false);
  const [sessionsToDeleteCount, setSessionsToDeleteCount] = useState(0);
  const [checkComplete, setCheckComplete] = useState(false);

  useEffect(() => {
    // If warning already acknowledged or retention already enabled, skip check
    if (
      settings.general?.sessionRetention?.warningAcknowledged ||
      (settings.general?.sessionRetention?.enabled &&
        settings.general?.sessionRetention?.maxAge !== undefined)
    ) {
      setShouldShowWarning(false);
      setCheckComplete(true);
      return;
    }

    const checkSessions = async () => {
      try {
        const chatsDir = path.join(config.storage.getProjectTempDir(), 'chats');
        const allFiles = await getAllSessionFiles(
          chatsDir,
          config.getSessionId(),
        );

        // Calculate how many sessions would be deleted if we applied a 30-day retention
        const sessionsToDelete = await identifySessionsToDelete(allFiles, {
          enabled: true,
          maxAge: '30d',
        });

        if (sessionsToDelete.length > 0) {
          setSessionsToDeleteCount(sessionsToDelete.length);
          setShouldShowWarning(true);
        } else {
          setShouldShowWarning(false);
          // If no sessions to delete, safe to auto-enable retention
          onAutoEnable?.();
        }
      } catch {
        // If we can't check sessions, default to not showing the warning to be safe
        setShouldShowWarning(false);
      } finally {
        setCheckComplete(true);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    checkSessions();
  }, [config, settings.general?.sessionRetention, onAutoEnable]);

  return { shouldShowWarning, checkComplete, sessionsToDeleteCount };
}
