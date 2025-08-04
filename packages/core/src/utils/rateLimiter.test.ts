/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  AuthTier,
  RateLimiterManager,
  RATE_LIMITS,
} from './rateLimiter.js';

describe('RateLimiter', () => {
  const model = 'gemini-2.5-pro';
  const tier = AuthTier.FREE;
  const limits = RATE_LIMITS[model][tier]!;

  beforeEach(() => {
    vi.useFakeTimers();
    RateLimiterManager.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow a request when no limits are exceeded', () => {
    const limiter = RateLimiterManager.getLimiter(model, tier);
    const delay = limiter.getRetryDelay(100);
    expect(delay).toBe(0);
  });

  it('should return a delay when RPM is exceeded', () => {
    const limiter = RateLimiterManager.getLimiter(model, tier);
    for (let i = 0; i < limits.rpm; i++) {
      limiter.addRequest(1);
    }
    const delay = limiter.getRetryDelay(1);
    expect(delay).toBeGreaterThan(0);
  });

  it('should return a delay when TPM is exceeded', () => {
    const limiter = RateLimiterManager.getLimiter(model, tier);
    limiter.addRequest(limits.tpm);
    const delay = limiter.getRetryDelay(1);
    expect(delay).toBeGreaterThan(0);
  });

  it('should return a delay when RPD is exceeded', () => {
    const limiter = RateLimiterManager.getLimiter(model, tier);
    for (let i = 0; i < limits.rpd; i++) {
      limiter.addRequest(1);
    }
    const delay = limiter.getRetryDelay(1);
    expect(delay).toBeGreaterThan(0);
  });

  it('should reset minute limits after a minute', async () => {
    const limiter = RateLimiterManager.getLimiter(model, tier);
    for (let i = 0; i < limits.rpm; i++) {
      limiter.addRequest(1);
    }
    vi.advanceTimersByTime(60 * 1000);
    const delay = limiter.getRetryDelay(1);
    expect(delay).toBe(0);
  });

  it('should reset day limits after a day', async () => {
    const limiter = RateLimiterManager.getLimiter(model, tier);
    for (let i = 0; i < limits.rpd; i++) {
      limiter.addRequest(1);
    }
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    const delay = limiter.getRetryDelay(1);
    expect(delay).toBe(0);
  });
});

describe('RateLimiterManager', () => {
  it('should return the same limiter instance for the same model and tier', () => {
    const model = 'gemini-2.5-pro';
    const tier = AuthTier.FREE;
    const limiter1 = RateLimiterManager.getLimiter(model, tier);
    const limiter2 = RateLimiterManager.getLimiter(model, tier);
    expect(limiter1).toBe(limiter2);
  });

  it('should return different limiter instances for different models', () => {
    const model1 = 'gemini-2.5-pro';
    const model2 = 'gemini-2.5-flash';
    const tier = AuthTier.FREE;
    const limiter1 = RateLimiterManager.getLimiter(model1, tier);
    const limiter2 = RateLimiterManager.getLimiter(model2, tier);
    expect(limiter1).not.toBe(limiter2);
  });
});
