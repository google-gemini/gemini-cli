/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { ContextProfile } from '../config/profiles.js';
import type { PipelineDef } from '../config/types.js';
import type { ContextEnvironment } from '../pipeline/environment.js';
import { createHistoryTruncationProcessor } from '../processors/historyTruncationProcessor.js';

export const testTruncateProfile: ContextProfile = {
  config: {
    budget: {
      retainedTokens: 65000,
      maxTokens: 150000,
    },
  },
  buildPipelines: (env: ContextEnvironment): PipelineDef[] => [
    {
      name: 'Emergency Backstop (Truncate Only)',
      triggers: ['gc_backstop', 'retained_exceeded'],
      processors: [
        createHistoryTruncationProcessor('HistoryTruncation', env, {}),
      ],
    },
  ],
  buildAsyncPipelines: () => [],
};
