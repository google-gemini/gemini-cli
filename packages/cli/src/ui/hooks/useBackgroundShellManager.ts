/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { type BackgroundTask } from './shellReducer.js';

export interface BackgroundShellManagerProps {
  backgroundTasks: Map<number, BackgroundTask>;
  backgroundTaskCount: number;
  isBackgroundTaskVisible: boolean;
  activePtyId: number | null | undefined;
  embeddedShellFocused: boolean;
  setEmbeddedShellFocused: (focused: boolean) => void;
  terminalHeight: number;
}

export function useBackgroundShellManager({
  backgroundTasks,
  backgroundTaskCount,
  isBackgroundTaskVisible,
  activePtyId,
  embeddedShellFocused,
  setEmbeddedShellFocused,
  terminalHeight,
}: BackgroundShellManagerProps) {
  const [isBackgroundShellListOpen, setIsBackgroundShellListOpen] =
    useState(false);
  const [activeBackgroundShellPid, setActiveBackgroundShellPid] = useState<
    number | null
  >(null);

  const prevShellCountRef = useRef(backgroundTaskCount);

  useEffect(() => {
    if (backgroundTasks.size === 0) {
      if (activeBackgroundShellPid !== null) {
        setActiveBackgroundShellPid(null);
      }
      if (isBackgroundShellListOpen) {
        setIsBackgroundShellListOpen(false);
      }
    } else if (
      activeBackgroundShellPid === null ||
      !backgroundTasks.has(activeBackgroundShellPid)
    ) {
      // If active shell is closed or none selected, select the first one
      setActiveBackgroundShellPid(backgroundTasks.keys().next().value ?? null);
    } else if (backgroundTaskCount > prevShellCountRef.current) {
      // A new shell was added — auto-switch to the newest one (last in the map)
      const pids = Array.from(backgroundTasks.keys());
      const newestPid = pids[pids.length - 1];
      if (newestPid !== undefined && newestPid !== activeBackgroundShellPid) {
        setActiveBackgroundShellPid(newestPid);
      }
    }
    prevShellCountRef.current = backgroundTaskCount;
  }, [
    backgroundTasks,
    activeBackgroundShellPid,
    backgroundTaskCount,
    isBackgroundShellListOpen,
  ]);

  useEffect(() => {
    if (embeddedShellFocused) {
      const hasActiveForegroundShell = !!activePtyId;
      const hasVisibleBackgroundShell =
        isBackgroundTaskVisible && backgroundTasks.size > 0;

      if (!hasActiveForegroundShell && !hasVisibleBackgroundShell) {
        setEmbeddedShellFocused(false);
      }
    }
  }, [
    isBackgroundTaskVisible,
    backgroundTasks,
    embeddedShellFocused,
    backgroundTaskCount,
    activePtyId,
    setEmbeddedShellFocused,
  ]);

  const backgroundShellHeight = useMemo(
    () =>
      isBackgroundTaskVisible && backgroundTasks.size > 0
        ? Math.max(Math.floor(terminalHeight * 0.3), 5)
        : 0,
    [isBackgroundTaskVisible, backgroundTasks.size, terminalHeight],
  );

  return {
    isBackgroundShellListOpen,
    setIsBackgroundShellListOpen,
    activeBackgroundShellPid,
    setActiveBackgroundShellPid,
    backgroundShellHeight,
  };
}
