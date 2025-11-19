/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type ModelId = string;

export type TerminalAvailabilityReason = 'quota' | 'capacity';
export type TurnAvailabilityReason = 'retry_once_per_turn';

export type AvailabilityReason =
  | TerminalAvailabilityReason
  | TurnAvailabilityReason
  | 'unknown';

type HealthState =
  | { status: 'terminal'; reason: TerminalAvailabilityReason }
  | { status: 'sticky_retry'; reason: TurnAvailabilityReason };

export interface ModelAvailabilitySnapshot {
  available: boolean;
  reason?: AvailabilityReason;
}

export interface ModelSelectionResult {
  selected: ModelId | null;
  attempts?: number;
  skipped: Array<{
    model: ModelId;
    reason: AvailabilityReason;
  }>;
}

export class ModelAvailabilityService {
  private readonly health = new Map<ModelId, HealthState>();
  private readonly consumedSticky = new Set<ModelId>();

  markTerminal(model: ModelId, reason: TerminalAvailabilityReason) {
    this.setState(model, {
      status: 'terminal',
      reason,
    });
  }

  markHealthy(model: ModelId) {
    this.clearState(model);
  }

  markRetryOncePerTurn(model: ModelId) {
    const currentState = this.health.get(model);
    // Do not override a terminal failure with a transient one.
    if (currentState?.status === 'terminal') {
      return;
    }

    // Only reset consumption if we are not already in the sticky_retry state.
    // This prevents infinite loops if the model fails repeatedly in the same turn.
    if (currentState?.status !== 'sticky_retry') {
      this.consumedSticky.delete(model);
    }

    this.setState(model, {
      status: 'sticky_retry',
      reason: 'retry_once_per_turn',
    });
  }

  consumeStickyAttempt(model: ModelId) {
    if (this.health.get(model)?.status === 'sticky_retry') {
      this.consumedSticky.add(model);
    }
  }

  snapshot(model: ModelId): ModelAvailabilitySnapshot {
    const state = this.health.get(model);
    const isUnavailable =
      state?.status === 'terminal' ||
      (state?.status === 'sticky_retry' && this.consumedSticky.has(model));

    if (isUnavailable) {
      return { available: false, reason: state!.reason };
    }
    return { available: true };
  }

  selectFirstAvailable(models: ModelId[]): ModelSelectionResult {
    const skipped: ModelSelectionResult['skipped'] = [];

    for (const model of models) {
      const snapshot = this.snapshot(model);
      if (snapshot.available) {
        const state = this.health.get(model);
        // A sticky model is being attempted, so note that.
        const attempts = state?.status === 'sticky_retry' ? 1 : undefined;
        return { selected: model, skipped, attempts };
      } else {
        skipped.push({ model, reason: snapshot.reason ?? 'unknown' });
      }
    }
    return { selected: null, skipped };
  }

  resetTurn() {
    this.consumedSticky.clear();
  }

  private setState(model: ModelId, nextState: HealthState) {
    this.health.set(model, nextState);
  }

  private clearState(model: ModelId) {
    this.health.delete(model);
    this.consumedSticky.delete(model);
  }
}
