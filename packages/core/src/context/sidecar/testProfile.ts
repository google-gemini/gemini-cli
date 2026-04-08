/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SidecarConfig } from './types.js';

export const testTruncateProfile: SidecarConfig = {
  budget: {
    retainedTokens: 65000,
    maxTokens: 150000,
  },
  pipelines: [
    {
      name: 'Emergency Backstop (Truncate Only)',
      triggers: ['gc_backstop', 'retained_exceeded'],
      execution: 'blocking',
      processors: [
        { processorId: 'EmergencyTruncationProcessor', options: {} },
      ],
    },
  ],
};
