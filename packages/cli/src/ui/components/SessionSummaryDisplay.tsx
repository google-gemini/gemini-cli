/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { StatsDisplay } from './StatsDisplay.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { escapeShellArg, getShellConfiguration } from '@google/gemini-cli-core';

interface SessionSummaryDisplayProps {
  duration: string;
}

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
}) => {
  const { stats } = useSessionStats();
  const { shell } = getShellConfiguration();
  const footer = `To resume this session: gemini --resume ${escapeShellArg(stats.sessionId, shell)}`;

  return (
    <StatsDisplay
      title="Agent powering down. Goodbye!"
      duration={duration}
      footer={footer}
    />
  );
};
