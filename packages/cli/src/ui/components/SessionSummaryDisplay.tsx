/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { escapeShellArg, getShellConfiguration } from '@google/gemini-cli-core';
import { StatsDisplay } from './StatsDisplay.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { useConfig } from '../contexts/ConfigContext.js';

interface SessionSummaryDisplayProps {
  duration: string;
  sessionId?: string;
}

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
  sessionId,
}) => {
  const { stats } = useSessionStats();
  const config = useConfig();
  const { shell } = getShellConfiguration();
  const worktreeSettings = config.getWorktreeSettings();

  const sessionIdForFooter = sessionId ?? stats.sessionId ?? '<session-id>';
  const escapedSessionId = escapeShellArg(sessionIdForFooter, shell);

  let footer = `Tip: Resume from any folder using gemini --resume ${escapedSessionId} or /resume`;

  if (worktreeSettings) {
    const escapedWorktreePath = escapeShellArg(worktreeSettings.path, shell);
    footer =
      `Tip: Resume from any folder using gemini --resume ${escapedSessionId}\n` +
      `To resume work in this worktree: cd ${escapedWorktreePath} && gemini --resume ${escapedSessionId}\n` +
      `To remove manually: git worktree remove ${escapedWorktreePath}`;
  }

  return (
    <StatsDisplay
      title="Agent powering down. Goodbye!"
      duration={duration}
      footer={footer}
    />
  );
};
