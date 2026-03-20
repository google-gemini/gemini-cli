/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from 'react';
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
  const [activeBackgroundShellPid, setActiveBackgroundShellPid] = useState<
    number | null
  >(null);

  const prevShellCountRef = useRef(backgroundShellCount);

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
      // If active shell is closed or none selected, select the first one
      setActiveBackgroundShellPid(backgroundShells.keys().next().value ?? null);
    } else if (backgroundShellCount > prevShellCountRef.current) {
      // A new shell was added — auto-switch to the newest one (last in the map)
      const pids = Array.from(backgroundShells.keys());
      const newestPid = pids[pids.length - 1];
      if (newestPid !== undefined && newestPid !== activeBackgroundShellPid) {
        setActiveBackgroundShellPid(newestPid);
      }
    }
    prevShellCountRef.current = backgroundShellCount;
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

  const backgroundShellHeight = useMemo(
    () =>
      isBackgroundShellVisible && backgroundShells.size > 0
        ? Math.max(Math.floor(terminalHeight * 0.3), 5)
        : 0,
    [isBackgroundShellVisible, backgroundShells.size, terminalHeight],
  );

  return {
    isBackgroundShellListOpen,
    setIsBackgroundShellListOpen,
    activeBackgroundShellPid,
    setActiveBackgroundShellPid,
    backgroundShellHeight,
  };
}
