/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { type BackgroundAgent } from '@google/gemini-cli-core';

export interface BackgroundAgentManagerProps {
  backgroundAgents: Map<string, BackgroundAgent>;
  backgroundAgentCount: number;
  isBackgroundAgentVisible: boolean;
  terminalHeight: number;
}

export function useBackgroundAgentManager({
  backgroundAgents,
  backgroundAgentCount,
  isBackgroundAgentVisible,
  terminalHeight,
}: BackgroundAgentManagerProps) {
  const [isBackgroundAgentListOpen, setIsBackgroundAgentListOpen] =
    useState(false);
  const [activeBackgroundAgentId, setActiveBackgroundAgentId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (backgroundAgents.size === 0) {
      if (activeBackgroundAgentId !== null) {
        setActiveBackgroundAgentId(null);
      }
      if (isBackgroundAgentListOpen) {
        setIsBackgroundAgentListOpen(false);
      }
    } else if (
      activeBackgroundAgentId === null ||
      !backgroundAgents.has(activeBackgroundAgentId)
    ) {
      setActiveBackgroundAgentId(backgroundAgents.keys().next().value ?? null);
    }
  }, [
    backgroundAgents,
    activeBackgroundAgentId,
    backgroundAgentCount,
    isBackgroundAgentListOpen,
  ]);

  const backgroundAgentHeight = useMemo(
    () =>
      isBackgroundAgentVisible && backgroundAgents.size > 0
        ? Math.max(Math.floor(terminalHeight * 0.3), 5)
        : 0,
    [isBackgroundAgentVisible, backgroundAgents.size, terminalHeight],
  );

  return {
    isBackgroundAgentListOpen,
    setIsBackgroundAgentListOpen,
    activeBackgroundAgentId,
    setActiveBackgroundAgentId,
    backgroundAgentHeight,
  };
}
