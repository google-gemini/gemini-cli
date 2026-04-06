/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../../config/config.js';
import type { SidecarConfig } from './types.js';

export class SidecarLoader {
  /**
   * Generates a default Sidecar JSON graph from the user's legacy UI profile settings.
   */
  static fromLegacyConfig(config: Config): SidecarConfig {
    const mngConfig = config.getContextManagementConfig ? config.getContextManagementConfig() : undefined;
    const strat: any = mngConfig?.strategies ?? {};
    const budget = mngConfig?.budget ?? { retainedTokens: 65000, maxTokens: 150000, maxPressureStrategy: 'truncate', gcTarget: 'incremental', freeTokensTarget: 10000 };

    return {
      budget: {
        retainedTokens: budget.retainedTokens,
        maxTokens: budget.maxTokens,
      },
      gcBackstop: {
        strategy: budget.maxPressureStrategy,
        target: budget.gcTarget,
        freeTokensTarget: budget.freeTokensTarget,
      },
      pipelines: {
        eagerBackground: [
          {
            processorId: 'StateSnapshotWorker',
            options: {},
          }
        ],
        retainedProcessingGraph: [
          {
            processorId: 'HistorySquashingProcessor',
            options: { maxTokensPerNode: strat.historySquashing?.maxTokensPerNode ?? 3000 }
          }
        ],
        normalProcessingGraph: [
          {
            processorId: 'ToolMaskingProcessor',
            options: { stringLengthThresholdTokens: strat.toolMasking?.stringLengthThresholdTokens ?? 8000 }
          },
          {
            processorId: 'BlobDegradationProcessor',
            options: {}
          },
          {
            processorId: 'SemanticCompressionProcessor',
            options: { nodeThresholdTokens: strat.semanticCompression?.nodeThresholdTokens ?? 3000 }
          }
        ]
      }
    };
  }
}
