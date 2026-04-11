/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { StatsDisplay } from './StatsDisplay.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import { escapeShellArg, getShellConfiguration } from '@google/gemini-cli-core';

interface SessionSummaryDisplayProps {
  duration: string;
}

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
}) => {
  const { stats } = useSessionStats();
  const config = useConfig();
  const { shell } = getShellConfiguration();

  const worktreeSettings = config.getWorktreeSettings();

  const escapedSessionId = escapeShellArg(stats.sessionId, shell);
  let footer = `To resume this session: gemini --resume ${escapedSessionId}`;

  if (worktreeSettings) {
    footer =
      `To resume work in this worktree: cd ${escapeShellArg(worktreeSettings.path, shell)} && gemini --resume ${escapedSessionId}\n` +
      `To remove manually: git worktree remove ${escapeShellArg(worktreeSettings.path, shell)}`;
  }

  return (
    <StatsDisplay
      title="Agent powering down. Goodbye!"
      duration={duration}
      footer={footer}
    />
  );
};
