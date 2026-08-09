/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { type BackgroundTask } from './useExecutionLifecycle.js';

export interface BackgroundTaskManagerProps {
  backgroundTasks: Map<number, BackgroundTask>;
  backgroundTaskCount: number;
  isBackgroundTaskVisible: boolean;
  activePtyId: number | null | undefined;
  embeddedShellFocused: boolean;
  setEmbeddedShellFocused: (focused: boolean) => void;
  terminalHeight: number;
}

export function useBackgroundTaskManager({
  backgroundTasks,
  backgroundTaskCount,
  isBackgroundTaskVisible,
  activePtyId,
  embeddedShellFocused,
  setEmbeddedShellFocused,
  terminalHeight,
}: BackgroundTaskManagerProps) {
  const [isBackgroundTaskListOpen, setIsBackgroundTaskListOpen] =
    useState(false);
  const [activeBackgroundTaskPid, setActiveBackgroundTaskPid] = useState<
    number | null
  >(null);

  useEffect(() => {
    if (backgroundTasks.size === 0) {
      if (activeBackgroundTaskPid !== null) {
        setActiveBackgroundTaskPid(null);
      }
      if (isBackgroundTaskListOpen) {
        setIsBackgroundTaskListOpen(false);
      }
    } else if (
      activeBackgroundTaskPid === null ||
      !backgroundTasks.has(activeBackgroundTaskPid)
    ) {
      // If active shell is closed or none selected, select the first one (last added usually, or just first in iteration)
      setActiveBackgroundTaskPid(backgroundTasks.keys().next().value ?? null);
    }
  }, [
    backgroundTasks,
    activeBackgroundTaskPid,
    backgroundTaskCount,
    isBackgroundTaskListOpen,
  ]);

  useEffect(() => {
    if (embeddedShellFocused) {
      const hasActiveForegroundShell = !!activePtyId;
      const hasVisibleBackgroundTask =
        isBackgroundTaskVisible && backgroundTasks.size > 0;

      if (!hasActiveForegroundShell && !hasVisibleBackgroundTask) {
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

  const backgroundTaskHeight = useMemo(
    () =>
      isBackgroundTaskVisible && backgroundTasks.size > 0
        ? Math.max(Math.floor(terminalHeight * 0.3), 5)
        : 0,
    [isBackgroundTaskVisible, backgroundTasks.size, terminalHeight],
  );

  return {
    isBackgroundTaskListOpen,
    setIsBackgroundTaskListOpen,
    activeBackgroundTaskPid,
    setActiveBackgroundTaskPid,
    backgroundTaskHeight,
  };
}
