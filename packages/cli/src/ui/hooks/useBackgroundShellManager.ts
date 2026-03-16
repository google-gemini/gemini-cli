/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { type BackgroundShell } from './shellCommandProcessor.js';

export interface BackgroundShellManagerProps {
  backgroundShells: Map<number, BackgroundShell>;
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
  const [isBackgroundShellListOpen, setIsBackgroundShellListOpen] =
    useState(false);
  const [isBackgroundShellFullscreen, setIsBackgroundShellFullscreen] =
    useState(false);
  const [activeBackgroundShellPid, setActiveBackgroundShellPid] = useState<
    number | null
  >(null);

  useEffect(() => {
    if (backgroundShells.size === 0) {
      if (activeBackgroundShellPid !== null) {
        setActiveBackgroundShellPid(null);
      }
      if (isBackgroundShellListOpen) {
        setIsBackgroundShellListOpen(false);
      }
    } else if (
      activeBackgroundShellPid === null ||
      !backgroundShells.has(activeBackgroundShellPid)
    ) {
      // If active shell is closed or none selected, select the first one (last added usually, or just first in iteration)
      setActiveBackgroundShellPid(backgroundShells.keys().next().value ?? null);
    }
  }, [
    backgroundShells,
    activeBackgroundShellPid,
    backgroundShellCount,
    isBackgroundShellListOpen,
  ]);

  useEffect(() => {
    if (embeddedShellFocused) {
      const hasActiveForegroundShell = !!activePtyId;
      const hasVisibleBackgroundShell =
        isBackgroundShellVisible && backgroundShells.size > 0;

      if (!hasActiveForegroundShell && !hasVisibleBackgroundShell) {
        setEmbeddedShellFocused(false);
      }
    }
  }, [
    isBackgroundShellVisible,
    backgroundShells,
    embeddedShellFocused,
    backgroundShellCount,
    activePtyId,
    setEmbeddedShellFocused,
  ]);

  const backgroundShellHeight = useMemo(() => {
    if (!isBackgroundShellVisible || backgroundShells.size === 0) {
      return 0;
    }
    if (isBackgroundShellFullscreen) {
      // Leave enough room for the footer/composer (approx 7 lines)
      return Math.max(terminalHeight - 7, 5);
    }
    return Math.max(Math.floor(terminalHeight * 0.3), 5);
  }, [
    isBackgroundShellVisible,
    backgroundShells.size,
    terminalHeight,
    isBackgroundShellFullscreen,
  ]);

  return {
    isBackgroundShellListOpen,
    setIsBackgroundShellListOpen,
    isBackgroundShellFullscreen,
    setIsBackgroundShellFullscreen,
    activeBackgroundShellPid,
    setActiveBackgroundShellPid,
    backgroundShellHeight,
  };
}
