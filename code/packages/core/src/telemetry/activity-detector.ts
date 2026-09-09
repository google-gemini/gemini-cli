/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tracks user activity state to determine when memory monitoring should be active
 */
export class ActivityDetector {
  private lastActivityTime: number = Date.now();
  private readonly idleThresholdMs: number;

  constructor(idleThresholdMs: number = 30000) {
    this.idleThresholdMs = idleThresholdMs;
  }

  /**
   * Record user activity (called by CLI when user types, adds messages, etc.)
   */
  recordActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Check if user is currently active (activity within idle threshold)
   */
  isUserActive(): boolean {
    const timeSinceActivity = Date.now() - this.lastActivityTime;
    return timeSinceActivity < this.idleThresholdMs;
  }

  /**
   * Get time since last activity in milliseconds
   */
  getTimeSinceLastActivity(): number {
    return Date.now() - this.lastActivityTime;
  }

  /**
   * Get last activity timestamp
   */
  getLastActivityTime(): number {
    return this.lastActivityTime;
  }
}

// Global activity detector instance (eagerly created with default threshold)
const globalActivityDetector: ActivityDetector = new ActivityDetector();

/**
 * Get global activity detector instance
 */
export function getActivityDetector(): ActivityDetector {
  return globalActivityDetector;
}

/**
 * Record user activity (convenience function for CLI to call)
 */
export function recordUserActivity(): void {
  globalActivityDetector.recordActivity();
}

/**
 * Check if user is currently active (convenience function)
 */
export function isUserActive(): boolean {
  return globalActivityDetector.isUserActive();
}
