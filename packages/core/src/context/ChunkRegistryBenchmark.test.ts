/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ChunkRegistry } from './ChunkRegistry.js';
import type { ConversationChunk } from './types.js';

/**
 * Performance benchmarks for ChunkRegistry demonstrating O(1) operations.
 */
describe('ChunkRegistry Performance Benchmarks', () => {
  const createTestChunk = (id: string): ConversationChunk => ({
    id,
    role: 'user',
    content: `Test content for chunk ${id}`,
    tokens: 100,
    timestamp: Date.now(),
    metadata: {},
  });

  it('should demonstrate O(1) addChunk performance', () => {
    const registry = new ChunkRegistry();
    const chunkCounts = [100, 500, 1000, 2000];
    const timings: number[] = [];

    for (const count of chunkCounts) {
      const chunks = Array.from({ length: count }, (_, i) =>
        createTestChunk(`chunk-${i}`),
      );

      const startTime = performance.now();
      chunks.forEach((chunk) => registry.addChunk(chunk));
      const endTime = performance.now();

      timings.push(endTime - startTime);
      registry.clear();
    }

    // Log results for manual verification
    console.log(
      'Add Performance (ms):',
      timings
        .map((time, i) => `${chunkCounts[i]} chunks: ${time.toFixed(2)}ms`)
        .join(', '),
    );

    // Verify reasonable performance: should handle 2000 chunks in under 100ms
    expect(timings[3]).toBeLessThan(100);
  });

  it('should demonstrate O(1) removeChunk performance with large registry', () => {
    const registry = new ChunkRegistry();
    const chunkCount = 1000;

    // Pre-populate registry
    const chunks = Array.from({ length: chunkCount }, (_, i) =>
      createTestChunk(`chunk-${i}`),
    );
    chunks.forEach((chunk) => registry.addChunk(chunk));

    // Measure removal performance
    const removalTimings: number[] = [];
    const chunksToRemove = [
      'chunk-0',
      'chunk-500',
      'chunk-999',
      'chunk-250',
      'chunk-750',
    ];

    for (const chunkId of chunksToRemove) {
      const startTime = performance.now();
      const removed = registry.removeChunk(chunkId);
      const endTime = performance.now();

      expect(removed).toBe(true);
      removalTimings.push(endTime - startTime);
    }

    const avgRemovalTime =
      removalTimings.reduce((sum, time) => sum + time, 0) /
      removalTimings.length;

    console.log(
      `Average removal time from ${chunkCount} chunks: ${avgRemovalTime.toFixed(4)}ms`,
    );

    // Each removal should be very fast (under 1ms)
    expect(avgRemovalTime).toBeLessThan(1);
  });

  it('should demonstrate efficient chunk retrieval performance', () => {
    const registry = new ChunkRegistry();
    const chunkCount = 2000;

    // Pre-populate registry
    const chunks = Array.from({ length: chunkCount }, (_, i) =>
      createTestChunk(`chunk-${i}`),
    );
    chunks.forEach((chunk) => registry.addChunk(chunk));

    // Measure various retrieval operations
    const operations = [
      () => registry.getChunk('chunk-1000'),
      () => registry.getAllChunks(),
      () => registry.getChunksByRole('user'),
      () => registry.getTotalTokens(),
      () => registry.size(),
    ];

    const operationNames = [
      'getChunk',
      'getAllChunks',
      'getChunksByRole',
      'getTotalTokens',
      'size',
    ];

    for (let i = 0; i < operations.length; i++) {
      const startTime = performance.now();
      const result = operations[i]();
      const endTime = performance.now();

      const duration = endTime - startTime;
      console.log(
        `${operationNames[i]} with ${chunkCount} chunks: ${duration.toFixed(4)}ms`,
      );

      // Verify operation completed and was reasonably fast
      expect(result).toBeDefined();
      if (operationNames[i] === 'getChunk' || operationNames[i] === 'size') {
        // O(1) operations should be very fast
        expect(duration).toBeLessThan(1);
      } else {
        // O(n) operations should still be reasonable
        expect(duration).toBeLessThan(10);
      }
    }
  });

  it('should demonstrate linear scaling for O(n) operations', () => {
    const sizes = [500, 1000, 1500, 2000];
    const getAllChunksTimes: number[] = [];

    for (const size of sizes) {
      const registry = new ChunkRegistry();
      const chunks = Array.from({ length: size }, (_, i) =>
        createTestChunk(`chunk-${i}`),
      );
      chunks.forEach((chunk) => registry.addChunk(chunk));

      const startTime = performance.now();
      const allChunks = registry.getAllChunks();
      const endTime = performance.now();

      expect(allChunks.length).toBe(size);
      getAllChunksTimes.push(endTime - startTime);
    }

    console.log(
      'Linear scaling (getAllChunks):',
      getAllChunksTimes
        .map((time, i) => `${sizes[i]} chunks: ${time.toFixed(4)}ms`)
        .join(', '),
    );

    // Verify roughly linear scaling (time should not increase exponentially)
    const timePerChunk = getAllChunksTimes.map((time, i) => time / sizes[i]);
    const avgTimePerChunk =
      timePerChunk.reduce((sum, t) => sum + t, 0) / timePerChunk.length;

    // Time per chunk should be consistent (within 5x variance for CI robustness)
    // Also check that all times are reasonable (not negative or extremely large)
    for (const time of timePerChunk) {
      expect(time).toBeGreaterThanOrEqual(0);
      expect(time).toBeLessThan(avgTimePerChunk * 5);
    }

    // Additional check: the operation should complete in reasonable time for largest size
    const largestTime = getAllChunksTimes[getAllChunksTimes.length - 1];
    expect(largestTime).toBeLessThan(50); // Should complete within 50ms even for 2000 chunks
  });

  it('should maintain performance under concurrent operations', async () => {
    const registry = new ChunkRegistry();
    const operationsCount = 100;

    // Create concurrent operations
    const addOperations = Array.from(
      { length: operationsCount },
      (_, i) => () => registry.addChunk(createTestChunk(`add-${i}`)),
    );

    const removeOperations = Array.from(
      { length: operationsCount / 2 },
      (_, i) => () => registry.removeChunk(`add-${i}`),
    );

    const getOperations = Array.from(
      { length: operationsCount },
      () => () => registry.size(),
    );

    const allOperations = [
      ...addOperations,
      ...removeOperations,
      ...getOperations,
    ];

    const startTime = performance.now();

    // Execute operations concurrently
    await Promise.all(allOperations.map((op) => Promise.resolve(op())));

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    console.log(
      `${allOperations.length} concurrent operations completed in ${totalTime.toFixed(2)}ms`,
    );

    // All operations should complete quickly
    expect(totalTime).toBeLessThan(50);
    expect(registry.size()).toBeGreaterThan(0);
  });
});
