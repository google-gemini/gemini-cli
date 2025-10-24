/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import type { Config } from '@google/gemini-cli-core';
import { useActivityRecorder } from './useActivityMonitoring.js';
import {
  useHistory,
  type UseHistoryManagerReturn,
} from './useHistoryManager.js';

export type UseHistoryWithActivityMonitoringReturn = UseHistoryManagerReturn;

/**
 * Enhanced version of useHistory that integrates activity monitoring
 *
 * Automatically records activity events when history items are added or updated.
 */
export function useHistoryWithActivityMonitoring(
  config: Config,
  enableActivityMonitoring = true,
): UseHistoryWithActivityMonitoringReturn {
  const { recordMessageAdded, recordHistoryUpdate } = useActivityRecorder(
    config,
    enableActivityMonitoring,
  );

  const handleMessageAdded = useCallback(() => {
    recordMessageAdded();
  }, [recordMessageAdded]);

  const handleHistoryChanged = useCallback(() => {
    recordHistoryUpdate();
  }, [recordHistoryUpdate]);

  return useHistory({
    onItemAdded: handleMessageAdded,
    onItemUpdated: handleHistoryChanged,
    onHistoryCleared: handleHistoryChanged,
    onHistoryLoaded: handleHistoryChanged,
  });
}
