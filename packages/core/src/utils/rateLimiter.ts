/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export enum AuthTier {
  FREE = 'free',
  TIER_1 = 'tier1',
  TIER_2 = 'tier2',
  TIER_3 = 'tier3',
}

export interface RateLimit {
  rpm: number;
  tpm: number;
  rpd: number;
}

export const RATE_LIMITS: Record<string, Partial<Record<AuthTier, RateLimit>>> = {
  'gemini-2.5-pro': {
    [AuthTier.FREE]: { rpm: 5, tpm: 250000, rpd: 100 },
    [AuthTier.TIER_1]: { rpm: 150, tpm: 2000000, rpd: 10000 },
    [AuthTier.TIER_2]: { rpm: 1000, tpm: 5000000, rpd: 50000 },
    [AuthTier.TIER_3]: { rpm: 2000, tpm: 8000000, rpd: Infinity },
  },
  'gemini-2.5-flash': {
    // Note: The RPD for the free tier is subject to change.
    // See https://ai.google.dev/gemini-api/docs/rate-limits#free-tier
    [AuthTier.FREE]: { rpm: 10, tpm: 250000, rpd: 1000 },
    [AuthTier.TIER_1]: { rpm: 1000, tpm: 1000000, rpd: 10000 },
    [AuthTier.TIER_2]: { rpm: 2000, tpm: 3000000, rpd: 100000 },
    [AuthTier.TIER_3]: { rpm: 10000, tpm: 8000000, rpd: Infinity },
  },
};

export class RateLimiter {
  private readonly rpm: number;
  private readonly tpm: number;
  private readonly rpd: number;

  private requestsThisMinute = 0;
  private tokensThisMinute = 0;
  private minuteStart = Date.now();

  private requestsToday = 0;
  private lastDayReset = new Date().setHours(0, 0, 0, 0);

  constructor(model: string, tier: AuthTier) {
    const limits = RATE_LIMITS[model]?.[tier];
    if (!limits) {
      this.rpm = Infinity;
      this.tpm = Infinity;
      this.rpd = Infinity;
      return;
    }

    this.rpm = limits.rpm;
    this.tpm = limits.tpm;
    this.rpd = limits.rpd;
  }

  private resetMinute() {
    this.minuteStart = Date.now();
    this.requestsThisMinute = 0;
    this.tokensThisMinute = 0;
  }

  private resetDay() {
    this.lastDayReset = new Date().setHours(0, 0, 0, 0);
    this.requestsToday = 0;
  }

  getRetryDelay(tokens: number): number {
    const now = Date.now();

    if (now - this.lastDayReset > 24 * 60 * 60 * 1000) {
      this.resetDay();
    }
    if (this.requestsToday >= this.rpd) {
      const timeToWait = this.lastDayReset + 24 * 60 * 60 * 1000 - now;
      return timeToWait > 0 ? timeToWait : 0;
    }

    if (now - this.minuteStart > 60 * 1000) {
      this.resetMinute();
    }

    if (this.requestsThisMinute >= this.rpm) {
      const timeToWait = this.minuteStart + 60 * 1000 - now;
      return timeToWait > 0 ? timeToWait : 0;
    }

    if (this.tokensThisMinute + tokens > this.tpm) {
      const timeToWait = this.minuteStart + 60 * 1000 - now;
      return timeToWait > 0 ? timeToWait : 0;
    }

    return 0;
  }

  addRequest(tokens: number) {
    const now = Date.now();
    if (now - this.minuteStart > 60 * 1000) {
      this.resetMinute();
    }
    if (now - this.lastDayReset > 24 * 60 * 60 * 1000) {
      this.resetDay();
    }

    this.requestsThisMinute++;
    this.tokensThisMinute += tokens;
    this.requestsToday++;
  }
}

export class RateLimiterManager {
  private static limiters = new Map<string, RateLimiter>();

  static getLimiter(model: string, tier: AuthTier): RateLimiter {
    const key = `${model}:${tier}`;
    if (!this.limiters.has(key)) {
      this.limiters.set(key, new RateLimiter(model, tier));
    }
    return this.limiters.get(key)!;
  }

  static reset() {
    this.limiters.clear();
  }
}
