/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useBackgroundTaskManager } from './useBackgroundTaskManager.js';
import type { BackgroundTask } from './useExecutionLifecycle.js';

export interface BackgroundShellManagerProps {
  backgroundShells: Map<number, BackgroundTask>;
  backgroundShellCount: number;
  isBackgroundShellVisible: boolean;
  activePtyId: number | null | undefined;
  embeddedShellFocused: boolean;
  setEmbeddedShellFocused: (focused: boolean) => void;
  terminalHeight: number;
}

export function useBackgroundShellManager({
  backgroundShells,
  backgroundShellCount,
  isBackgroundShellVisible,
  activePtyId,
  embeddedShellFocused,
  setEmbeddedShellFocused,
  terminalHeight,
}: BackgroundShellManagerProps) {
  const result = useBackgroundTaskManager({
    backgroundTasks: backgroundShells,
    backgroundTaskCount: backgroundShellCount,
    isBackgroundTaskVisible: isBackgroundShellVisible,
    activePtyId,
    embeddedShellFocused,
    setEmbeddedShellFocused,
    terminalHeight,
  });

  return {
    isBackgroundShellListOpen: result.isBackgroundTaskListOpen,
    setIsBackgroundShellListOpen: result.setIsBackgroundTaskListOpen,
    activeBackgroundShellPid: result.activeBackgroundTaskPid,
    setActiveBackgroundShellPid: result.setActiveBackgroundTaskPid,
    backgroundShellHeight: result.backgroundTaskHeight,
  };
}
