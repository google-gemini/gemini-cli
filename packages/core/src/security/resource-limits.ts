/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logConfigTamperingDetected } from './security-audit-logger.js';

/**
 * Resource limitation utilities to prevent DoS attacks.
 *
 * SECURITY NOTE: Uncontrolled resource allocation can lead to Denial of Service
 * attacks where attackers exhaust system resources (memory, CPU, file descriptors).
 *
 * Common resource exhaustion vectors:
 * - Unlimited setTimeout/setInterval timers
 * - Memory leaks from untracked resources
 * - Excessive concurrent operations
 * - Unbounded arrays/objects
 * - Recursive function calls
 * - Large file operations
 *
 * This module provides safe wrappers with automatic cleanup and limits.
 */

/**
 * Global configuration for resource limits.
 */
const RESOURCE_LIMITS = {
  /** Maximum number of active timers */
  MAX_TIMERS: 1000,
  /** Maximum timer duration (24 hours) */
  MAX_TIMER_DURATION: 24 * 60 * 60 * 1000,
  /** Maximum array size */
  MAX_ARRAY_SIZE: 1_000_000,
  /** Maximum object keys */
  MAX_OBJECT_KEYS: 10_000,
  /** Maximum string length */
  MAX_STRING_LENGTH: 10_000_000, // 10MB
  /** Maximum recursion depth */
  MAX_RECURSION_DEPTH: 100,
  /** Maximum concurrent operations */
  MAX_CONCURRENT_OPS: 100,
};

/**
 * Timer tracking to prevent exhaustion.
 */
class TimerTracker {
  private activeTimers = new Set<NodeJS.Timeout>();
  private timerCount = 0;

  /**
   * Registers a new timer.
   */
  public register(timer: NodeJS.Timeout): void {
    if (this.activeTimers.size >= RESOURCE_LIMITS.MAX_TIMERS) {
      logConfigTamperingDetected(
        'Timer creation',
        `Attempted to create timer when ${RESOURCE_LIMITS.MAX_TIMERS} timers already active`,
      );
      throw new Error(
        `Maximum number of timers (${RESOURCE_LIMITS.MAX_TIMERS}) exceeded`,
      );
    }

    this.activeTimers.add(timer);
    this.timerCount++;
  }

  /**
   * Unregisters a timer.
   */
  public unregister(timer: NodeJS.Timeout): void {
    this.activeTimers.delete(timer);
  }

  /**
   * Gets the number of active timers.
   */
  public getActiveCount(): number {
    return this.activeTimers.size;
  }

  /**
   * Gets the total number of timers created.
   */
  public getTotalCount(): number {
    return this.timerCount;
  }

  /**
   * Clears all active timers.
   */
  public clearAll(): void {
    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
  }
}

/**
 * Global timer tracker instance.
 */
const globalTimerTracker = new TimerTracker();

/**
 * Safe setTimeout replacement with automatic tracking and cleanup.
 *
 * @param callback Function to execute
 * @param delay Delay in milliseconds
 * @returns Timer ID
 */
export function safeSetTimeout(
  callback: () => void,
  delay: number,
): NodeJS.Timeout {
  // Validate delay
  if (delay < 0) {
    throw new Error('Delay must be non-negative');
  }

  if (delay > RESOURCE_LIMITS.MAX_TIMER_DURATION) {
    logConfigTamperingDetected(
      'Timer creation',
      `Attempted to create timer with excessive duration: ${delay}ms`,
    );
    throw new Error(
      `Timer duration ${delay}ms exceeds maximum ${RESOURCE_LIMITS.MAX_TIMER_DURATION}ms`,
    );
  }

  // Create timer with automatic cleanup
  const timer = setTimeout(() => {
    try {
      callback();
    } finally {
      globalTimerTracker.unregister(timer);
    }
  }, delay);

  // Register timer
  globalTimerTracker.register(timer);

  return timer;
}

/**
 * Safe setInterval replacement with automatic tracking and cleanup.
 *
 * @param callback Function to execute
 * @param delay Delay in milliseconds
 * @returns Timer ID
 */
export function safeSetInterval(
  callback: () => void,
  delay: number,
): NodeJS.Timeout {
  // Validate delay
  if (delay < 0) {
    throw new Error('Delay must be non-negative');
  }

  if (delay > RESOURCE_LIMITS.MAX_TIMER_DURATION) {
    logConfigTamperingDetected(
      'Interval creation',
      `Attempted to create interval with excessive duration: ${delay}ms`,
    );
    throw new Error(
      `Interval duration ${delay}ms exceeds maximum ${RESOURCE_LIMITS.MAX_TIMER_DURATION}ms`,
    );
  }

  // Create interval
  const timer = setInterval(() => {
    callback();
  }, delay);

  // Register timer
  globalTimerTracker.register(timer);

  return timer;
}

/**
 * Safe clearTimeout that also unregisters the timer.
 *
 * @param timer Timer to clear
 */
export function safeClearTimeout(timer: NodeJS.Timeout): void {
  clearTimeout(timer);
  globalTimerTracker.unregister(timer);
}

/**
 * Safe clearInterval that also unregisters the timer.
 *
 * @param timer Timer to clear
 */
export function safeClearInterval(timer: NodeJS.Timeout): void {
  clearInterval(timer);
  globalTimerTracker.unregister(timer);
}

/**
 * Gets timer statistics.
 */
export function getTimerStats(): {
  active: number;
  total: number;
  limit: number;
} {
  return {
    active: globalTimerTracker.getActiveCount(),
    total: globalTimerTracker.getTotalCount(),
    limit: RESOURCE_LIMITS.MAX_TIMERS,
  };
}

/**
 * Clears all active timers (use with caution).
 */
export function clearAllTimers(): void {
  globalTimerTracker.clearAll();
}

/**
 * Validates array size to prevent memory exhaustion.
 *
 * @param array Array to validate
 * @param maxSize Maximum allowed size
 */
export function validateArraySize<T>(
  array: T[],
  maxSize: number = RESOURCE_LIMITS.MAX_ARRAY_SIZE,
): void {
  if (array.length > maxSize) {
    logConfigTamperingDetected(
      'Array size validation',
      `Array size ${array.length} exceeds limit ${maxSize}`,
    );
    throw new Error(`Array size ${array.length} exceeds maximum ${maxSize}`);
  }
}

/**
 * Validates object size to prevent memory exhaustion.
 *
 * @param obj Object to validate
 * @param maxKeys Maximum allowed keys
 */
export function validateObjectSize(
  obj: Record<string, unknown>,
  maxKeys: number = RESOURCE_LIMITS.MAX_OBJECT_KEYS,
): void {
  const keyCount = Object.keys(obj).length;
  if (keyCount > maxKeys) {
    logConfigTamperingDetected(
      'Object size validation',
      `Object has ${keyCount} keys, exceeds limit ${maxKeys}`,
    );
    throw new Error(`Object has ${keyCount} keys, exceeds maximum ${maxKeys}`);
  }
}

/**
 * Validates string length to prevent memory exhaustion.
 *
 * @param str String to validate
 * @param maxLength Maximum allowed length
 */
export function validateStringLength(
  str: string,
  maxLength: number = RESOURCE_LIMITS.MAX_STRING_LENGTH,
): void {
  if (str.length > maxLength) {
    logConfigTamperingDetected(
      'String length validation',
      `String length ${str.length} exceeds limit ${maxLength}`,
    );
    throw new Error(
      `String length ${str.length} exceeds maximum ${maxLength}`,
    );
  }
}

/**
 * Recursion depth tracker to prevent stack overflow.
 */
export class RecursionGuard {
  private depth = 0;
  private readonly maxDepth: number;

  constructor(maxDepth: number = RESOURCE_LIMITS.MAX_RECURSION_DEPTH) {
    this.maxDepth = maxDepth;
  }

  /**
   * Enters a recursive call.
   */
  public enter(): void {
    this.depth++;
    if (this.depth > this.maxDepth) {
      logConfigTamperingDetected(
        'Recursion guard',
        `Recursion depth ${this.depth} exceeds limit ${this.maxDepth}`,
      );
      throw new Error(
        `Maximum recursion depth (${this.maxDepth}) exceeded`,
      );
    }
  }

  /**
   * Exits a recursive call.
   */
  public exit(): void {
    this.depth--;
  }

  /**
   * Gets current recursion depth.
   */
  public getDepth(): number {
    return this.depth;
  }

  /**
   * Wraps a recursive function with depth tracking.
   */
  public wrap<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: Parameters<T>): ReturnType<T> => {
      this.enter();
      try {
        return fn(...args);
      } finally {
        this.exit();
      }
    }) as T;
  }
}

/**
 * Concurrent operation limiter to prevent resource exhaustion.
 */
export class ConcurrencyLimiter {
  private activeOps = 0;
  private readonly maxOps: number;
  private readonly queue: Array<() => void> = [];

  constructor(maxOps: number = RESOURCE_LIMITS.MAX_CONCURRENT_OPS) {
    this.maxOps = maxOps;
  }

  /**
   * Acquires a slot for an operation.
   */
  public async acquire(): Promise<() => void> {
    if (this.activeOps >= this.maxOps) {
      // Wait for a slot to become available
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }

    this.activeOps++;

    // Return release function
    return () => {
      this.activeOps--;
      const next = this.queue.shift();
      if (next) {
        next();
      }
    };
  }

  /**
   * Wraps an async function with concurrency limiting.
   */
  public wrap<T extends (...args: any[]) => Promise<any>>(
    fn: T,
  ): T {
    return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
      const release = await this.acquire();
      try {
        return await fn(...args);
      } finally {
        release();
      }
    }) as T;
  }

  /**
   * Gets current concurrency statistics.
   */
  public getStats(): { active: number; queued: number; limit: number } {
    return {
      active: this.activeOps,
      queued: this.queue.length,
      limit: this.maxOps,
    };
  }
}

/**
 * Creates a safe Promise.race with timeout.
 *
 * @param promises Promises to race
 * @param timeout Timeout in milliseconds
 * @returns Result of first promise or timeout error
 */
export async function safeRace<T>(
  promises: Promise<T>[],
  timeout: number,
): Promise<T> {
  if (timeout > RESOURCE_LIMITS.MAX_TIMER_DURATION) {
    throw new Error(
      `Timeout ${timeout}ms exceeds maximum ${RESOURCE_LIMITS.MAX_TIMER_DURATION}ms`,
    );
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = safeSetTimeout(() => {
      reject(new Error(`Operation timed out after ${timeout}ms`));
    }, timeout);
  });

  return Promise.race([...promises, timeoutPromise]);
}

/**
 * Creates a resource-limited array that prevents excessive growth.
 */
export class LimitedArray<T> extends Array<T> {
  constructor(
    private readonly maxSize: number = RESOURCE_LIMITS.MAX_ARRAY_SIZE,
  ) {
    super();
  }

  public override push(...items: T[]): number {
    if (this.length + items.length > this.maxSize) {
      logConfigTamperingDetected(
        'LimitedArray',
        `Attempted to exceed array size limit of ${this.maxSize}`,
      );
      throw new Error(
        `Cannot add items: would exceed maximum size of ${this.maxSize}`,
      );
    }
    return super.push(...items);
  }

  public override unshift(...items: T[]): number {
    if (this.length + items.length > this.maxSize) {
      logConfigTamperingDetected(
        'LimitedArray',
        `Attempted to exceed array size limit of ${this.maxSize}`,
      );
      throw new Error(
        `Cannot add items: would exceed maximum size of ${this.maxSize}`,
      );
    }
    return super.unshift(...items);
  }
}

/**
 * Gets current resource usage statistics.
 */
export function getResourceStats(): {
  timers: { active: number; total: number; limit: number };
  limits: typeof RESOURCE_LIMITS;
} {
  return {
    timers: getTimerStats(),
    limits: RESOURCE_LIMITS,
  };
}
