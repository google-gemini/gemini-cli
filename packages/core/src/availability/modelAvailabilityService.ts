/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type ModelId = string;

type TerminalUnavailabilityReason = 'quota' | 'capacity';
export type TurnUnavailabilityReason = 'retry_once_per_turn';

export type UnavailabilityReason =
  | TerminalUnavailabilityReason
  | TurnUnavailabilityReason
  | 'unknown';

export type ModelHealthStatus = 'terminal' | 'sticky_retry';

type HealthState =
  | { status: 'terminal'; reason: TerminalUnavailabilityReason }
  | {
      status: 'sticky_retry';
      reason: TurnUnavailabilityReason;
      consumed: boolean;
      attempts: number;
    };

export interface ModelAvailabilitySnapshot {
  available: boolean;
  reason?: UnavailabilityReason;
}

export interface ModelSelectionResult {
  selectedModel: ModelId | null;
  attempts?: number;
  skipped: Array<{
    model: ModelId;
    reason: UnavailabilityReason;
  }>;
}

import { normalizeModelId } from '../utils/modelUtils.js';

export class ModelAvailabilityService {
  private readonly health = new Map<ModelId, HealthState>();

  markTerminal(modelId: ModelId, reason: TerminalUnavailabilityReason) {
    const model = normalizeModelId(modelId);
    this.setState(model, {
      status: 'terminal',
      reason,
    });
  }

  markHealthy(modelId: ModelId) {
    const model = normalizeModelId(modelId);
    this.clearState(model);
  }

  markRetryOncePerTurn(modelId: ModelId, attempts: number = 1) {
    const model = normalizeModelId(modelId);
    const currentState = this.health.get(model);
    // Do not override a terminal failure with a transient one.
    if (currentState?.status === 'terminal') {
      return;
    }

    // Only reset consumption if we are not already in the sticky_retry state.
    // This prevents infinite loops if the model fails repeatedly in the same turn.
    let consumed = false;
    if (currentState?.status === 'sticky_retry') {
      consumed = currentState.consumed;
    }

    this.setState(model, {
      status: 'sticky_retry',
      reason: 'retry_once_per_turn',
      consumed,
      attempts,
    });
  }

  consumeStickyAttempt(modelId: ModelId) {
    const model = normalizeModelId(modelId);
    const state = this.health.get(model);
    if (state?.status === 'sticky_retry') {
      this.setState(model, { ...state, consumed: true });
    }
  }

  snapshot(modelId: ModelId): ModelAvailabilitySnapshot {
    const model = normalizeModelId(modelId);
    const state = this.health.get(model);

    if (!state) {
      return { available: true };
    }

    if (state.status === 'terminal') {
      return { available: false, reason: state.reason };
    }

    if (state.status === 'sticky_retry' && state.consumed) {
      return { available: false, reason: state.reason };
    }

    return { available: true };
  }

  selectFirstAvailable(modelIds: ModelId[]): ModelSelectionResult {
    const skipped: ModelSelectionResult['skipped'] = [];

    for (const modelId of modelIds) {
      const model = normalizeModelId(modelId);
      const snapshot = this.snapshot(model);
      if (snapshot.available) {
        const state = this.health.get(model);
        // A sticky model is being attempted, so note that.
        const attempts =
          state?.status === 'sticky_retry' ? state.attempts : undefined;
        return { selectedModel: model, skipped, attempts };
      } else {
        skipped.push({ model, reason: snapshot.reason ?? 'unknown' });
      }
    }
    return { selectedModel: null, skipped };
  }

  resetTurn() {
    for (const [model, state] of this.health.entries()) {
      if (state.status === 'sticky_retry') {
        this.setState(model, { ...state, consumed: false });
      }
    }
  }

  reset() {
    this.health.clear();
  }

  private setState(model: ModelId, nextState: HealthState) {
    this.health.set(model, nextState);
  }

  private clearState(model: ModelId) {
    this.health.delete(model);
  }
}
