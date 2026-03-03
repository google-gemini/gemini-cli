/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StartupPhaseMetric } from '../types.js';
import type React from 'react';
import { StatsDisplay } from './StatsDisplay.js';

interface SessionSummaryDisplayProps {
  duration: string;
  wallTimeMs?: number;
  startupPhases?: StartupPhaseMetric[];
}

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
  wallTimeMs,
  startupPhases,
}) => (
  <StatsDisplay
    title="Agent powering down. Goodbye!"
    duration={duration}
    wallTimeMs={wallTimeMs}
    startupPhases={startupPhases}
    showPerformanceProfile={wallTimeMs !== undefined}
    footer="Tip: Resume a previous session using gemini --resume or /resume"
  />
);
