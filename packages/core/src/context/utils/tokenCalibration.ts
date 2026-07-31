/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Content } from '@google/genai';
import type { ContextEnvironment } from '../pipeline/environment.js';
import type { ConcreteNode } from '../graph/types.js';
import { debugLogger } from '../../utils/debugLogger.js';

export function performCalibration(
  env: ContextEnvironment,
  finalNodes: readonly ConcreteNode[],
  finalContents: Content[],
) {
  if (!env.renderOptions?.calibrateTokenCalculation) {
    return;
  }

  void (async () => {
    try {
      const exactResp = await env.llmClient.countTokens({
        contents: finalContents,
      });
      const exactTokens =
        typeof exactResp.totalTokens === 'number' ? exactResp.totalTokens : 0;
      const estimatedTokens =
        env.tokenCalculator.calculateConcreteListTokens(finalNodes);

      const delta = Math.abs(exactTokens - estimatedTokens);
      const tolerance = Math.max(exactTokens, estimatedTokens) * 0.2; // 20% tolerance

      env.tracer.logEvent('Render', 'Token Calibration Measurement', {
        exactTokens,
        estimatedTokens,
        delta,
        isWithinTolerance: delta <= tolerance,
      });

      if (delta > tolerance) {
        debugLogger.error(
          `[Token Calibration] Large deviation detected: exact ${exactTokens} vs estimated ${estimatedTokens} (delta: ${delta})`,
        );
      }
    } catch {
      // Ignore API failures during background calibration
    }
  })();
}
