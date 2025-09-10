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

// Global activity detector instance
let globalActivityDetector: ActivityDetector | null = null;

/**
 * Initialize global activity detector
 */
export function initializeActivityDetector(
  idleThresholdMs: number = 30000,
): ActivityDetector {
  if (!globalActivityDetector) {
    globalActivityDetector = new ActivityDetector(idleThresholdMs);
  }
  return globalActivityDetector;
}

/**
 * Get global activity detector instance
 */
export function getActivityDetector(): ActivityDetector | null {
  return globalActivityDetector;
}

/**
 * Record user activity (convenience function for CLI to call)
 */
export function recordUserActivity(): void {
  // Do not implicitly initialize here to avoid locking in default timeout
  // when a custom timeout may be set later via initializeActivityDetector().
  globalActivityDetector?.recordActivity();
}

/**
 * Check if user is currently active (convenience function)
 */
export function isUserActive(): boolean {
  const detector = globalActivityDetector;
  return detector ? detector.isUserActive() : false;
}

/**
 * Reset global activity detector (for testing)
 */
export function resetGlobalActivityDetector(): void {
  globalActivityDetector = null;
}
