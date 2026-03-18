/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useEffect, useState } from 'react';
import { StatsDisplay } from './StatsDisplay.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import {
  escapeShellArg,
  getShellConfiguration,
  hasWorktreeChanges,
} from '@google/gemini-cli-core';

interface SessionSummaryDisplayProps {
  duration: string;
}

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
}) => {
  const { stats } = useSessionStats();
  const config = useConfig();
  const { shell } = getShellConfiguration();

  const [isDirty, setIsDirty] = useState<boolean | undefined>(undefined);

  const worktreeSettings = config.getWorktreeSettings();

  useEffect(() => {
    if (worktreeSettings?.path) {
      hasWorktreeChanges(worktreeSettings.path, worktreeSettings.baseSha)
        .then(setIsDirty)
        .catch(() => {
          // Fallback to dirty if check fails
          setIsDirty(true);
        });
    }
  }, [worktreeSettings]);

  const escapedSessionId = escapeShellArg(stats.sessionId, shell);
  let footer = `To resume this session: gemini --resume ${escapedSessionId}`;

  if (worktreeSettings) {
    if (isDirty === true) {
      footer =
        `To resume work in this worktree: cd ${escapeShellArg(worktreeSettings.path, shell)} && gemini --resume ${escapedSessionId}\n` +
        `To remove manually: git worktree remove ${escapeShellArg(worktreeSettings.path, shell)}`;
    } else if (isDirty === false) {
      footer += `\nWorktree ${worktreeSettings.name} has no changes and will be automatically removed.`;
    }
  }

  return (
    <StatsDisplay
      key={isDirty === undefined ? 'checking' : String(isDirty)}
      title="Agent powering down. Goodbye!"
      duration={duration}
      footer={footer}
    />
  );
};
