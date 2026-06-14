/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { StatsDisplay } from './StatsDisplay.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { useConfig } from '../contexts/ConfigContext.js';
import {
  escapeShellArg,
  isWindows,
  type ShellType,
} from '@google/gemini-cli-core';

interface SessionSummaryDisplayProps {
  duration: string;
}

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
}) => {
  const { stats } = useSessionStats();
  const config = useConfig();
  const shell: ShellType = isWindows() ? 'powershell' : 'bash';

  const worktreeSettings = config.getWorktreeSettings();

  // If the recorder is present but has no active file (e.g. recording was
  // disabled by a disk-full error), the session was not saved — don't print a
  // misleading resume command. If we can't tell, keep the resume hint.
  const recordingService = config.getGeminiClient()?.getChatRecordingService();
  const sessionNotSaved =
    recordingService != null && !recordingService.getConversationFilePath();

  const escapedSessionId = escapeShellArg(stats.sessionId, shell);
  const footerSessionId =
    isWindows() &&
    !escapedSessionId.startsWith('"') &&
    !escapedSessionId.startsWith("'")
      ? `"${escapedSessionId}"`
      : escapedSessionId;
  let footer = sessionNotSaved
    ? 'This session was not saved and cannot be resumed.'
    : `To resume this session: gemini --resume ${footerSessionId}`;

  if (worktreeSettings) {
    // The worktree exists on disk regardless of whether the session was saved,
    // so always show how to remove it — but only offer to resume when saved.
    const removeManually = `To remove manually: git worktree remove ${escapeShellArg(worktreeSettings.path, shell)}`;
    footer = sessionNotSaved
      ? `${footer}\n${removeManually}`
      : `To resume work in this worktree: cd ${escapeShellArg(worktreeSettings.path, shell)} && gemini --resume ${footerSessionId}\n${removeManually}`;
  }

  return (
    <StatsDisplay
      title="Agent powering down. Goodbye!"
      duration={duration}
      footer={footer}
    />
  );
};
