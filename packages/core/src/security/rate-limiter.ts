/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logRateLimitExceeded } from './security-audit-logger.js';

/**
 * Rate limiting for security operations to prevent DoS attacks.
 *
 * SECURITY NOTE: Rate limiting prevents attackers from overwhelming
 * the system with repeated failed validation attempts or brute force attacks.
 */

interface RateLimitEntry {
  count: number;
  firstAttempt: number;
  lastAttempt: number;
  blocked: boolean;
  blockUntil?: number;
}

/**
 * Token bucket rate limiter implementation.
 */
export class RateLimiter {
  private attempts: Map<string, RateLimitEntry> = new Map();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly maxAttempts: number = 10,
    private readonly windowMs: number = 60000, // 1 minute
    private readonly blockDurationMs: number = 300000, // 5 minutes
  ) {
    // Periodic cleanup of old entries
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      60000, // Clean up every minute
    );
  }

  /**
   * Checks if an operation should be allowed.
   *
   * @param identifier Unique identifier for the rate limit (e.g., server name, IP)
   * @returns true if allowed, false if rate limited
   */
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const entry = this.attempts.get(identifier);

    if (!entry) {
      // First attempt
      this.attempts.set(identifier, {
        count: 1,
        firstAttempt: now,
        lastAttempt: now,
        blocked: false,
      });
      return true;
    }

    // Check if currently blocked
    if (entry.blocked && entry.blockUntil) {
      if (now < entry.blockUntil) {
        // Still blocked
        logRateLimitExceeded(identifier, entry.count);
        return false;
      }
      // Block expired, reset
      entry.blocked = false;
      entry.count = 1;
      entry.firstAttempt = now;
      entry.lastAttempt = now;
      delete entry.blockUntil;
      return true;
    }

    // Check if window has expired
    if (now - entry.firstAttempt > this.windowMs) {
      // Window expired, reset
      entry.count = 1;
      entry.firstAttempt = now;
      entry.lastAttempt = now;
      return true;
    }

    // Increment count
    entry.count++;
    entry.lastAttempt = now;

    // Check if limit exceeded
    if (entry.count > this.maxAttempts) {
      entry.blocked = true;
      entry.blockUntil = now + this.blockDurationMs;
      logRateLimitExceeded(identifier, entry.count);
      return false;
    }

    return true;
  }

  /**
   * Records a successful operation (can be used to reset counter on success).
   */
  recordSuccess(identifier: string): void {
    const entry = this.attempts.get(identifier);
    if (entry && !entry.blocked) {
      // Reduce count on success to allow gradual recovery
      entry.count = Math.max(0, entry.count - 1);
    }
  }

  /**
   * Records a failed operation.
   */
  recordFailure(identifier: string): void {
    // isAllowed() already increments count, so this is a no-op
    // unless we want additional penalty
    const entry = this.attempts.get(identifier);
    if (entry) {
      // Additional penalty: double the weight of failures
      entry.count++;
    }
  }

  /**
   * Gets the current rate limit status for an identifier.
   */
  getStatus(identifier: string): {
    blocked: boolean;
    count: number;
    remaining: number;
    resetAt?: Date;
  } {
    const entry = this.attempts.get(identifier);

    if (!entry) {
      return {
        blocked: false,
        count: 0,
        remaining: this.maxAttempts,
      };
    }

    return {
      blocked: entry.blocked,
      count: entry.count,
      remaining: Math.max(0, this.maxAttempts - entry.count),
      resetAt: entry.blockUntil ? new Date(entry.blockUntil) : undefined,
    };
  }

  /**
   * Resets rate limit for an identifier.
   */
  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  /**
   * Cleans up expired entries.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [identifier, entry] of this.attempts.entries()) {
      // Remove entries that are old and not blocked
      if (
        !entry.blocked &&
        now - entry.lastAttempt > this.windowMs * 2
      ) {
        this.attempts.delete(identifier);
      }
      // Remove entries where block has expired
      if (entry.blocked && entry.blockUntil && now > entry.blockUntil) {
        this.attempts.delete(identifier);
      }
    }
  }

  /**
   * Stops the cleanup interval.
   */
  stop(): void {
    clearInterval(this.cleanupInterval);
  }

  /**
   * Gets statistics about rate limiting.
   */
  getStats(): {
    totalTracked: number;
    blocked: number;
    active: number;
  } {
    let blocked = 0;
    let active = 0;

    for (const entry of this.attempts.values()) {
      if (entry.blocked) {
        blocked++;
      } else if (entry.count > 0) {
        active++;
      }
    }

    return {
      totalTracked: this.attempts.size,
      blocked,
      active,
    };
  }
}

/**
 * Global rate limiter instances for different operations.
 */

// Rate limiter for MCP server validation failures
export const mcpServerRateLimiter = new RateLimiter(
  10, // 10 attempts
  60000, // per minute
  300000, // 5 minute block
);

// Rate limiter for credential decryption failures
export const credentialRateLimiter = new RateLimiter(
  5, // 5 attempts
  60000, // per minute
  600000, // 10 minute block
);

// Rate limiter for configuration loading failures
export const configRateLimiter = new RateLimiter(
  20, // 20 attempts
  60000, // per minute
  60000, // 1 minute block
);

/**
 * Cleanup all rate limiters on process exit.
 */
if (typeof process !== 'undefined') {
  process.on('beforeExit', () => {
    mcpServerRateLimiter.stop();
    credentialRateLimiter.stop();
    configRateLimiter.stop();
  });
}
