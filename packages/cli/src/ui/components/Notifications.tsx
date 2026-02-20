/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text, useIsScreenReaderEnabled } from 'ink';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useAppContext } from '../contexts/AppContext.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { theme } from '../semantic-colors.js';
import { StreamingState } from '../types.js';
import { UpdateNotification } from './UpdateNotification.js';
import { persistentState } from '../../utils/persistentState.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { KeypressPriority } from '../contexts/KeypressContext.js';

import {
  GEMINI_DIR,
  Storage,
  homedir,
  WarningPriority,
} from '@google/gemini-cli-core';

import * as fs from 'node:fs/promises';
import path from 'node:path';

const settingsPath = path.join(homedir(), GEMINI_DIR, 'settings.json');

const screenReaderNudgeFilePath = path.join(
  Storage.getGlobalTempDir(),
  'seen_screen_reader_nudge.json',
);

const MAX_STARTUP_WARNING_SHOW_COUNT = 3;

export const Notifications = () => {
  const { startupWarnings } = useAppContext();
  const { initError, streamingState, updateInfo } = useUIState();

  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const showInitError =
    initError && streamingState !== StreamingState.Responding;

  const [hasSeenScreenReaderNudge, setHasSeenScreenReaderNudge] = useState(() =>
    persistentState.get('hasSeenScreenReaderNudge'),
  );

  const [dismissed, setDismissed] = useState(false);

  // Track if we have already incremented the show count in this session
  const hasIncrementedRef = useRef(false);

  // Filter warnings based on persistent state count if low priority
  const visibleWarnings = useMemo(() => {
    if (dismissed) return [];

    const counts = persistentState.get('startupWarningCounts') || {};
    return startupWarnings.filter((w) => {
      if (w.priority === WarningPriority.Low) {
        const count = counts[w.id] || 0;
        return count < MAX_STARTUP_WARNING_SHOW_COUNT;
      }
      return true;
    });
  }, [startupWarnings, dismissed]);

  const showStartupWarnings = visibleWarnings.length > 0;

  // Increment counts for low priority warnings when shown
  useEffect(() => {
    if (visibleWarnings.length > 0 && !hasIncrementedRef.current) {
      const counts = { ...(persistentState.get('startupWarningCounts') || {}) };
      let changed = false;
      visibleWarnings.forEach((w) => {
        if (w.priority === WarningPriority.Low) {
          counts[w.id] = (counts[w.id] || 0) + 1;
          changed = true;
        }
      });
      if (changed) {
        persistentState.set('startupWarningCounts', counts);
      }
      hasIncrementedRef.current = true;
    }
  }, [visibleWarnings]);

  const handleKeyPress = useCallback(() => {
    if (showStartupWarnings) {
      setDismissed(true);
    }
    return false;
  }, [showStartupWarnings]);

  useKeypress(handleKeyPress, {
    isActive: showStartupWarnings,
    priority: KeypressPriority.Critical,
  });

  useEffect(() => {
    const checkLegacyScreenReaderNudge = async () => {
      if (hasSeenScreenReaderNudge !== undefined) return;

      try {
        await fs.access(screenReaderNudgeFilePath);
        persistentState.set('hasSeenScreenReaderNudge', true);
        setHasSeenScreenReaderNudge(true);
        // Best effort cleanup of legacy file
        await fs.unlink(screenReaderNudgeFilePath).catch(() => {});
      } catch {
        setHasSeenScreenReaderNudge(false);
      }
    };

    if (isScreenReaderEnabled) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      checkLegacyScreenReaderNudge();
    }
  }, [isScreenReaderEnabled, hasSeenScreenReaderNudge]);

  const showScreenReaderNudge =
    isScreenReaderEnabled && hasSeenScreenReaderNudge === false;

  useEffect(() => {
    if (showScreenReaderNudge) {
      persistentState.set('hasSeenScreenReaderNudge', true);
    }
  }, [showScreenReaderNudge]);

  if (
    !showStartupWarnings &&
    !showInitError &&
    !updateInfo &&
    !showScreenReaderNudge
  ) {
    return null;
  }

  return (
    <>
      {showScreenReaderNudge && (
        <Text>
          You are currently in screen reader-friendly view. To switch out, open{' '}
          {settingsPath} and remove the entry for {'"screenReader"'}. This will
          disappear on next run.
        </Text>
      )}
      {updateInfo && <UpdateNotification message={updateInfo.message} />}
      {showStartupWarnings && (
        <Box marginY={1} flexDirection="column">
          {visibleWarnings.map((warning, index) => (
            <Box key={index} flexDirection="row">
              <Box width={3}>
                <Text color={theme.status.warning}>⚠ </Text>
              </Box>
              <Box flexGrow={1}>
                <Text color={theme.status.warning}>{warning.message}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {showInitError && (
        <Box
          borderStyle="round"
          borderColor={theme.status.error}
          paddingX={1}
          marginBottom={1}
        >
          <Text color={theme.status.error}>
            Initialization Error: {initError}
          </Text>
          <Text color={theme.status.error}>
            {' '}
            Please check API key and configuration.
          </Text>
        </Box>
      )}
    </>
  );
};
