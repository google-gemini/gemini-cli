/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ModelAvailabilityService } from './modelAvailabilityService.js';

describe('ModelAvailabilityService', () => {
  let service: ModelAvailabilityService;
  const model = 'test-model';

  beforeEach(() => {
    service = new ModelAvailabilityService();
    vi.useRealTimers();
  });

  it('returns available snapshot when no state recorded', () => {
    expect(service.snapshot(model)).toEqual({ available: true });
  });

  it('tracks retry-once-per-turn failures', () => {
    service.markRetryOncePerTurn(model);
    expect(service.snapshot(model)).toEqual({ available: true });

    service.consumeStickyAttempt(model);
    expect(service.snapshot(model)).toEqual({
      available: false,
      reason: 'retry_once_per_turn',
    });

    service.resetTurn();
    expect(service.snapshot(model)).toEqual({ available: true });
  });

  it('tracks terminal failures', () => {
    service.markTerminal(model, 'quota');
    expect(service.snapshot(model)).toEqual({
      available: false,
      reason: 'quota',
    });
  });

  it('does not override terminal failure with sticky failure', () => {
    service.markTerminal(model, 'quota');
    service.markRetryOncePerTurn(model);
    expect(service.snapshot(model)).toEqual({
      available: false,
      reason: 'quota',
    });
  });

  it('selects models respecting terminal and sticky states', () => {
    const stickyModel = 'stick-model';
    const healthyModel = 'healthy-model';

    service.markTerminal(model, 'capacity');
    service.markRetryOncePerTurn(stickyModel);

    const first = service.selectFirstAvailable([
      model,
      stickyModel,
      healthyModel,
    ]);
    expect(first).toEqual({
      selectedModel: stickyModel,
      attempts: 1,
      skipped: [
        {
          model,
          reason: 'capacity',
        },
      ],
    });

    service.consumeStickyAttempt(stickyModel);
    const second = service.selectFirstAvailable([
      model,
      stickyModel,
      healthyModel,
    ]);
    expect(second).toEqual({
      selectedModel: healthyModel,
      skipped: [
        {
          model,
          reason: 'capacity',
        },
        {
          model: stickyModel,
          reason: 'retry_once_per_turn',
        },
      ],
    });

    service.resetTurn();
    const third = service.selectFirstAvailable([
      model,
      stickyModel,
      healthyModel,
    ]);
    expect(third).toEqual({
      selectedModel: stickyModel,
      attempts: 1,
      skipped: [
        {
          model,
          reason: 'capacity',
        },
      ],
    });
  });

  it('preserves consumed state when marking retry-once-per-turn again', () => {
    service.markRetryOncePerTurn(model);
    service.consumeStickyAttempt(model);

    // It is currently consumed
    expect(service.snapshot(model).available).toBe(false);

    // Marking it again should not reset the consumed flag
    service.markRetryOncePerTurn(model);
    expect(service.snapshot(model).available).toBe(false);
  });

  it('clears consumed state when marked healthy', () => {
    service.markRetryOncePerTurn(model);
    service.consumeStickyAttempt(model);
    expect(service.snapshot(model).available).toBe(false);

    service.markHealthy(model);
    expect(service.snapshot(model).available).toBe(true);

    // If we mark it sticky again, it should be fresh (not consumed)
    service.markRetryOncePerTurn(model);
    expect(service.snapshot(model).available).toBe(true);
  });

  it('resetTurn resets consumed state for multiple sticky models', () => {
    const model2 = 'model-2';
    service.markRetryOncePerTurn(model);
    service.markRetryOncePerTurn(model2);

    service.consumeStickyAttempt(model);
    service.consumeStickyAttempt(model2);

    expect(service.snapshot(model).available).toBe(false);
    expect(service.snapshot(model2).available).toBe(false);

    service.resetTurn();

    expect(service.snapshot(model).available).toBe(true);
    expect(service.snapshot(model2).available).toBe(true);
  });

  it('resetTurn does not affect terminal models', () => {
    service.markTerminal(model, 'quota');
    service.resetTurn();
    expect(service.snapshot(model)).toEqual({
      available: false,
      reason: 'quota',
    });
  });
});
