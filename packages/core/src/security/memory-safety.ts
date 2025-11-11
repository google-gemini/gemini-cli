/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logConfigTamperingDetected } from './security-audit-logger.js';

/**
 * Memory Safety Utilities - Prevents memory-related security vulnerabilities.
 *
 * SECURITY NOTE: Memory safety issues can lead to:
 * - Buffer overflows (less common in Node.js but possible with native modules)
 * - Memory exhaustion/DoS attacks
 * - Information leakage through uninitialized memory
 * - Memory corruption
 * - Use-after-free vulnerabilities
 *
 * This module provides safe memory operations and monitoring.
 */

/**
 * Error thrown when memory operation is unsafe.
 */
export class MemorySafetyError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'MemorySafetyError';
  }
}

/**
 * Memory usage thresholds.
 */
export const MEMORY_LIMITS = {
  /** Maximum heap size (1GB) */
  MAX_HEAP_SIZE: 1024 * 1024 * 1024,
  /** Warn threshold (75% of max) */
  WARN_THRESHOLD: 768 * 1024 * 1024,
  /** Maximum string length (100MB) */
  MAX_STRING_SIZE: 100 * 1024 * 1024,
  /** Maximum buffer size (500MB) */
  MAX_BUFFER_SIZE: 500 * 1024 * 1024,
  /** Maximum array length */
  MAX_ARRAY_LENGTH: 10_000_000,
};

/**
 * Gets current memory usage statistics.
 *
 * @returns Memory usage information
 */
export function getMemoryUsage(): {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  percentage: number;
  safe: boolean;
} {
  const usage = process.memoryUsage();

  const percentage = (usage.heapUsed / usage.heapTotal) * 100;
  const safe = usage.heapUsed < MEMORY_LIMITS.WARN_THRESHOLD;

  if (!safe) {
    logConfigTamperingDetected(
      'Memory usage',
      `High memory usage: ${Math.round(usage.heapUsed / 1024 / 1024)}MB (${Math.round(percentage)}%)`,
    );
  }

  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss,
    percentage,
    safe,
  };
}

/**
 * Checks if allocating additional memory would be safe.
 *
 * @param bytes Number of bytes to allocate
 * @returns True if safe to allocate
 */
export function canAllocate(bytes: number): boolean {
  const current = process.memoryUsage();
  const projected = current.heapUsed + bytes;

  if (projected > MEMORY_LIMITS.MAX_HEAP_SIZE) {
    logConfigTamperingDetected(
      'Memory allocation',
      `Allocation would exceed memory limit: ${bytes} bytes`,
    );
    return false;
  }

  return true;
}

/**
 * Creates a safe buffer with size validation.
 *
 * @param size Buffer size in bytes
 * @param fill Optional fill value
 * @returns Safe buffer
 */
export function createSafeBuffer(size: number, fill?: number | string): Buffer {
  // Validate size
  if (size < 0) {
    throw new MemorySafetyError('Buffer size cannot be negative', 'INVALID_SIZE');
  }

  if (size > MEMORY_LIMITS.MAX_BUFFER_SIZE) {
    logConfigTamperingDetected(
      'Buffer creation',
      `Attempted to create oversized buffer: ${size} bytes`,
    );
    throw new MemorySafetyError(
      `Buffer size ${size} exceeds maximum ${MEMORY_LIMITS.MAX_BUFFER_SIZE}`,
      'SIZE_EXCEEDED',
    );
  }

  // Check if we can allocate
  if (!canAllocate(size)) {
    throw new MemorySafetyError(
      'Insufficient memory to allocate buffer',
      'INSUFFICIENT_MEMORY',
    );
  }

  try {
    if (fill !== undefined) {
      return Buffer.alloc(size, fill);
    }
    return Buffer.alloc(size); // Use alloc (zeroed) not allocUnsafe
  } catch (error) {
    throw new MemorySafetyError(
      `Failed to create buffer: ${(error as Error).message}`,
      'ALLOCATION_FAILED',
    );
  }
}

/**
 * Safely concatenates buffers with size validation.
 *
 * @param buffers Array of buffers to concatenate
 * @param maxSize Maximum allowed result size
 * @returns Concatenated buffer
 */
export function safeConcatBuffers(
  buffers: Buffer[],
  maxSize: number = MEMORY_LIMITS.MAX_BUFFER_SIZE,
): Buffer {
  // Calculate total size
  const totalSize = buffers.reduce((sum, buf) => sum + buf.length, 0);

  if (totalSize > maxSize) {
    logConfigTamperingDetected(
      'Buffer concatenation',
      `Total buffer size ${totalSize} exceeds maximum ${maxSize}`,
    );
    throw new MemorySafetyError(
      `Total buffer size ${totalSize} exceeds maximum ${maxSize}`,
      'SIZE_EXCEEDED',
    );
  }

  if (!canAllocate(totalSize)) {
    throw new MemorySafetyError(
      'Insufficient memory for buffer concatenation',
      'INSUFFICIENT_MEMORY',
    );
  }

  return Buffer.concat(buffers);
}

/**
 * Safely slices a buffer with bounds checking.
 *
 * @param buffer Buffer to slice
 * @param start Start index
 * @param end End index
 * @returns Sliced buffer
 */
export function safeSliceBuffer(
  buffer: Buffer,
  start: number,
  end?: number,
): Buffer {
  // Validate indices
  if (start < 0 || start > buffer.length) {
    throw new MemorySafetyError(
      `Start index ${start} out of bounds (buffer length: ${buffer.length})`,
      'INDEX_OUT_OF_BOUNDS',
    );
  }

  const actualEnd = end ?? buffer.length;

  if (actualEnd < start || actualEnd > buffer.length) {
    throw new MemorySafetyError(
      `End index ${actualEnd} out of bounds (buffer length: ${buffer.length})`,
      'INDEX_OUT_OF_BOUNDS',
    );
  }

  return buffer.subarray(start, actualEnd); // Use subarray (doesn't copy) instead of slice
}

/**
 * Securely zeros out a buffer (clears sensitive data).
 *
 * @param buffer Buffer to zero
 */
export function zeroBuffer(buffer: Buffer): void {
  buffer.fill(0);
}

/**
 * Safely reads a string with size validation.
 *
 * @param buffer Buffer to read from
 * @param encoding Encoding to use
 * @param start Start offset
 * @param end End offset
 * @returns Decoded string
 */
export function safeBufferToString(
  buffer: Buffer,
  encoding: BufferEncoding = 'utf8',
  start?: number,
  end?: number,
): string {
  const actualStart = start ?? 0;
  const actualEnd = end ?? buffer.length;
  const size = actualEnd - actualStart;

  if (size > MEMORY_LIMITS.MAX_STRING_SIZE) {
    logConfigTamperingDetected(
      'String decode',
      `Attempted to decode oversized string: ${size} bytes`,
    );
    throw new MemorySafetyError(
      `String size ${size} exceeds maximum ${MEMORY_LIMITS.MAX_STRING_SIZE}`,
      'SIZE_EXCEEDED',
    );
  }

  try {
    return buffer.toString(encoding, actualStart, actualEnd);
  } catch (error) {
    throw new MemorySafetyError(
      `Failed to decode buffer: ${(error as Error).message}`,
      'DECODE_FAILED',
    );
  }
}

/**
 * Validates array size before operations.
 *
 * @param array Array to validate
 * @param maxSize Maximum allowed size
 * @returns True if valid
 */
export function validateArraySize<T>(
  array: T[],
  maxSize: number = MEMORY_LIMITS.MAX_ARRAY_LENGTH,
): boolean {
  if (array.length > maxSize) {
    logConfigTamperingDetected(
      'Array size',
      `Array size ${array.length} exceeds maximum ${maxSize}`,
    );
    throw new MemorySafetyError(
      `Array size ${array.length} exceeds maximum ${maxSize}`,
      'SIZE_EXCEEDED',
    );
  }
  return true;
}

/**
 * Safely pushes items to an array with size checking.
 *
 * @param array Array to push to
 * @param items Items to push
 * @param maxSize Maximum allowed array size
 * @returns New array length
 */
export function safePush<T>(
  array: T[],
  items: T[],
  maxSize: number = MEMORY_LIMITS.MAX_ARRAY_LENGTH,
): number {
  const newLength = array.length + items.length;

  if (newLength > maxSize) {
    logConfigTamperingDetected(
      'Array push',
      `Array push would exceed maximum size: ${newLength} > ${maxSize}`,
    );
    throw new MemorySafetyError(
      `Array push would exceed maximum size: ${newLength} > ${maxSize}`,
      'SIZE_EXCEEDED',
    );
  }

  return array.push(...items);
}

/**
 * Monitors memory usage and triggers cleanup if needed.
 *
 * @param threshold Threshold percentage (default: 75%)
 * @returns True if cleanup was triggered
 */
export function monitorMemory(threshold: number = 75): boolean {
  const usage = getMemoryUsage();

  if (usage.percentage > threshold) {
    logConfigTamperingDetected(
      'Memory monitor',
      `Memory usage above threshold: ${Math.round(usage.percentage)}% > ${threshold}%`,
    );

    // Trigger garbage collection if available
    if (global.gc) {
      console.warn(`Triggering garbage collection (memory at ${Math.round(usage.percentage)}%)`);
      global.gc();
      return true;
    } else {
      console.warn(
        `High memory usage (${Math.round(usage.percentage)}%) but gc() not available. ` +
        'Run with --expose-gc to enable manual GC.',
      );
    }
  }

  return false;
}

/**
 * Creates a memory monitor that periodically checks usage.
 *
 * @param interval Check interval in milliseconds
 * @param callback Callback when threshold exceeded
 * @returns Stop function
 */
export function createMemoryMonitor(
  interval: number = 60000, // 1 minute
  callback?: (usage: ReturnType<typeof getMemoryUsage>) => void,
): () => void {
  const timer = setInterval(() => {
    const usage = getMemoryUsage();

    if (!usage.safe) {
      console.warn(
        `Memory usage: ${Math.round(usage.heapUsed / 1024 / 1024)}MB ` +
        `(${Math.round(usage.percentage)}%)`,
      );

      if (callback) {
        callback(usage);
      }

      // Trigger GC if available
      if (global.gc) {
        global.gc();
      }
    }
  }, interval);

  // Return stop function
  return () => clearInterval(timer);
}

/**
 * Estimates memory size of a JavaScript object.
 *
 * @param obj Object to measure
 * @param seen Set of already seen objects (for circular reference handling)
 * @returns Estimated size in bytes
 */
export function estimateObjectSize(
  obj: any,
  seen: WeakSet<object> = new WeakSet(),
): number {
  if (obj === null || obj === undefined) {
    return 0;
  }

  const type = typeof obj;

  // Primitives
  if (type === 'boolean') return 4;
  if (type === 'number') return 8;
  if (type === 'string') return obj.length * 2; // UTF-16
  if (type === 'symbol') return 8;
  if (type === 'bigint') return 8; // Approximate

  // Objects
  if (type === 'object') {
    // Circular reference check
    if (seen.has(obj)) {
      return 0;
    }
    seen.add(obj);

    let size = 0;

    // Buffer
    if (Buffer.isBuffer(obj)) {
      return obj.length;
    }

    // Array
    if (Array.isArray(obj)) {
      size = 4; // Array header
      for (const item of obj) {
        size += estimateObjectSize(item, seen);
      }
      return size;
    }

    // Regular object
    size = 4; // Object header
    for (const [key, value] of Object.entries(obj)) {
      size += key.length * 2; // Key size
      size += estimateObjectSize(value, seen);
    }

    return size;
  }

  return 0;
}

/**
 * Checks if object size is within safe limits.
 *
 * @param obj Object to check
 * @param maxSize Maximum allowed size in bytes
 * @returns True if safe
 */
export function validateObjectMemorySize(
  obj: any,
  maxSize: number = 10 * 1024 * 1024, // 10MB
): boolean {
  const size = estimateObjectSize(obj);

  if (size > maxSize) {
    logConfigTamperingDetected(
      'Object size',
      `Object memory size ${size} bytes exceeds maximum ${maxSize} bytes`,
    );
    throw new MemorySafetyError(
      `Object memory size ${size} bytes exceeds maximum ${maxSize} bytes`,
      'SIZE_EXCEEDED',
    );
  }

  return true;
}

/**
 * Creates a limited-size cache to prevent memory exhaustion.
 */
export class BoundedCache<K, V> extends Map<K, V> {
  constructor(private readonly maxSize: number = 1000) {
    super();
  }

  public override set(key: K, value: V): this {
    // If at capacity, remove oldest entry (FIFO)
    if (this.size >= this.maxSize) {
      const firstKey = this.keys().next().value;
      this.delete(firstKey);

      logConfigTamperingDetected(
        'Cache eviction',
        `Cache full (${this.maxSize} entries), evicting oldest entry`,
      );
    }

    return super.set(key, value);
  }
}

/**
 * Safe JSON.parse with size validation.
 *
 * @param json JSON string to parse
 * @param maxSize Maximum allowed JSON string size
 * @returns Parsed object
 */
export function safeJSONParseWithSizeCheck(
  json: string,
  maxSize: number = 10 * 1024 * 1024, // 10MB
): any {
  if (json.length > maxSize) {
    logConfigTamperingDetected(
      'JSON parse',
      `JSON string size ${json.length} exceeds maximum ${maxSize}`,
    );
    throw new MemorySafetyError(
      `JSON string size ${json.length} exceeds maximum ${maxSize}`,
      'SIZE_EXCEEDED',
    );
  }

  try {
    const obj = JSON.parse(json);

    // Validate parsed object size
    validateObjectMemorySize(obj);

    return obj;
  } catch (error) {
    if (error instanceof MemorySafetyError) {
      throw error;
    }
    throw new MemorySafetyError(
      `Failed to parse JSON: ${(error as Error).message}`,
      'PARSE_FAILED',
    );
  }
}

/**
 * Detects potential memory leaks by tracking object retention.
 *
 * @param interval Check interval in milliseconds
 * @returns Stop function
 */
export function createMemoryLeakDetector(interval: number = 300000): () => void {
  let previousHeapUsed = process.memoryUsage().heapUsed;
  let increasingCount = 0;

  const timer = setInterval(() => {
    const current = process.memoryUsage();

    if (current.heapUsed > previousHeapUsed * 1.1) {
      // Heap grew by more than 10%
      increasingCount++;

      if (increasingCount >= 5) {
        // Heap has been increasing for 5 consecutive checks
        logConfigTamperingDetected(
          'Memory leak',
          `Possible memory leak detected: heap grew from ${Math.round(previousHeapUsed / 1024 / 1024)}MB to ${Math.round(current.heapUsed / 1024 / 1024)}MB`,
        );
        console.warn(
          `WARNING: Possible memory leak detected. Heap usage: ${Math.round(current.heapUsed / 1024 / 1024)}MB`,
        );
        increasingCount = 0; // Reset to avoid spamming
      }
    } else {
      increasingCount = 0;
    }

    previousHeapUsed = current.heapUsed;
  }, interval);

  return () => clearInterval(timer);
}

/**
 * Gets memory safety recommendations based on current usage.
 *
 * @returns Array of recommendations
 */
export function getMemorySafetyRecommendations(): string[] {
  const recommendations: string[] = [];
  const usage = getMemoryUsage();

  if (usage.percentage > 90) {
    recommendations.push('CRITICAL: Memory usage above 90% - immediate action required');
    recommendations.push('Consider restarting the process');
  } else if (usage.percentage > 75) {
    recommendations.push('WARNING: Memory usage above 75%');
    recommendations.push('Enable garbage collection with --expose-gc');
    recommendations.push('Review memory-intensive operations');
  }

  if (usage.external > 100 * 1024 * 1024) {
    recommendations.push(`External memory usage is high: ${Math.round(usage.external / 1024 / 1024)}MB`);
    recommendations.push('Check for large buffers or native module memory usage');
  }

  if (!global.gc) {
    recommendations.push('Manual GC not available - run with --expose-gc flag');
  }

  return recommendations;
}
