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

  const resumeId = stats.alias || stats.sessionId;
  const aliasSuffix = stats.alias ? ` (${stats.sessionId})` : '';
  const escapedResumeId = escapeShellArg(resumeId, shell);

  let footer = `To resume this session: gemini --resume ${escapedResumeId}${aliasSuffix}`;

  if (worktreeSettings) {
    const escapedWorktreePath = escapeShellArg(worktreeSettings.path, shell);
    footer =
      `To resume work in this worktree: cd ${escapedWorktreePath} && gemini --resume ${escapedResumeId}${aliasSuffix}\n` +
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
