/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PerformanceMonitor } from './performanceMonitor.js';
import type { InferenceMetrics } from './types.js';
import os from 'os';

// Mock os module
vi.mock('os');

const mockOs = vi.mocked(os);

describe('PerformanceMonitor', () => {
  let performanceMonitor: PerformanceMonitor;

  beforeEach(() => {
    vi.clearAllMocks();
    performanceMonitor = new PerformanceMonitor();
    
    // Setup default os mocks
    mockOs.totalmem.mockReturnValue(16 * 1024 * 1024 * 1024); // 16GB
    mockOs.freemem.mockReturnValue(8 * 1024 * 1024 * 1024);   // 8GB free
    mockOs.cpus.mockReturnValue(new Array(8).fill({
      model: 'Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz',
      speed: 2600,
      times: {
        user: 1000000,
        nice: 0,
        sys: 500000,
        idle: 8000000,
        irq: 0
      }
    }));
    mockOs.loadavg.mockReturnValue([1.2, 1.5, 1.8]);
    mockOs.platform.mockReturnValue('linux');
    mockOs.arch.mockReturnValue('x64');
    mockOs.uptime.mockReturnValue(123456);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('system metrics', () => {
    it('should get system memory information', () => {
      const metrics = performanceMonitor.getSystemMetrics();

      expect(metrics.memoryUsage.total).toBe(16 * 1024 * 1024 * 1024); // 16GB in bytes
      expect(metrics.memoryUsage.available).toBe(8 * 1024 * 1024 * 1024); // 8GB in bytes
      expect(metrics.memoryUsage.used).toBe(8 * 1024 * 1024 * 1024); // 8GB in bytes
    });

    it('should get CPU information', () => {
      const metrics = performanceMonitor.getSystemMetrics();

      expect(typeof metrics.cpuUsage).toBe('number');
      expect(metrics.loadAverage).toEqual([1.2, 1.5, 1.8]);
    });

    it('should get platform information', () => {
      const metrics = performanceMonitor.getSystemMetrics();

      expect(metrics.platform).toBe('linux');
      expect(typeof metrics.uptime).toBe('number');
    });
  });

  describe('optimal model settings', () => {
    it('should recommend settings based on available RAM', () => {
      const settings = performanceMonitor.getOptimalModelSettings();

      expect(settings.recommendedRAM).toBeGreaterThan(0);
      expect(settings.maxContextSize).toBeGreaterThan(0);
      expect(['fast', 'medium', 'slow']).toContain(settings.estimatedSpeed);
      expect(typeof settings.preferredQuantization).toBe('string');
    });

    it('should provide conservative recommendations for low RAM', () => {
      mockOs.freemem.mockReturnValue(2 * 1024 * 1024 * 1024); // 2GB free

      const settings = performanceMonitor.getOptimalModelSettings();

      expect(settings.recommendedRAM).toBeLessThanOrEqual(2);
    });

    it('should provide aggressive recommendations for high RAM', () => {
      mockOs.freemem.mockReturnValue(32 * 1024 * 1024 * 1024); // 32GB free

      const settings = performanceMonitor.getOptimalModelSettings();

      expect(settings.recommendedRAM).toBeGreaterThan(4);
      expect(settings.maxContextSize).toBeGreaterThanOrEqual(8192);
    });
  });

  describe('inference metrics recording', () => {
    it('should record inference metrics', () => {
      const metrics: InferenceMetrics = {
        tokensPerSecond: 15.5,
        totalTokens: 100,
        inferenceTime: 6451.6, // ~6.45 seconds
        modelName: 'test-model',
        promptLength: 20,
        responseLength: 80,
        timestamp: new Date()
      };

      performanceMonitor.recordInference(metrics);

      const stats = performanceMonitor.getInferenceStats();
      expect(stats.totalInferences).toBe(1);
      expect(stats.averageTokensPerSecond).toBe(15.5);
      expect(stats.averageInferenceTime).toBe(6451.6);
    });

    it('should calculate average metrics across multiple inferences', () => {
      const metrics1: InferenceMetrics = {
        tokensPerSecond: 10,
        totalTokens: 50,
        inferenceTime: 5000,
        modelName: 'test-model',
        promptLength: 10,
        responseLength: 40,
        timestamp: new Date()
      };

      const metrics2: InferenceMetrics = {
        tokensPerSecond: 20,
        totalTokens: 100,
        inferenceTime: 5000,
        modelName: 'test-model',
        promptLength: 15,
        responseLength: 85,
        timestamp: new Date()
      };

      performanceMonitor.recordInference(metrics1);
      performanceMonitor.recordInference(metrics2);

      const stats = performanceMonitor.getInferenceStats();
      expect(stats.totalInferences).toBe(2);
      expect(stats.averageTokensPerSecond).toBe(15); // (10 + 20) / 2
      expect(stats.averageInferenceTime).toBe(5000); // (5000 + 5000) / 2
    });

    it('should track recent performance trends', () => {
      // Record multiple metrics with different performance levels
      for (let i = 0; i < 10; i++) {
        const metrics: InferenceMetrics = {
          tokensPerSecond: 10 + i, // Increasing performance
          totalTokens: 50,
          inferenceTime: 5000 - (i * 100), // Decreasing time
          modelName: 'test-model',
          promptLength: 10,
          responseLength: 40,
          timestamp: new Date()
        };
        performanceMonitor.recordInference(metrics);
      }

      const stats = performanceMonitor.getInferenceStats();
      expect(stats.totalInferences).toBe(10);
      expect(stats.averageTokensPerSecond).toBe(14.5); // Average of 10-19
    });
  });

  describe('performance analysis', () => {
    it('should identify performance bottlenecks', () => {
      // Record slow inference
      const slowMetrics: InferenceMetrics = {
        tokensPerSecond: 2,
        totalTokens: 100,
        inferenceTime: 50000, // 50 seconds - very slow
        modelName: 'large-model',
        promptLength: 1000,
        responseLength: 100,
        timestamp: new Date()
      };

      performanceMonitor.recordInference(slowMetrics);

      const stats = performanceMonitor.getInferenceStats();
      expect(stats.averageTokensPerSecond).toBeLessThan(5);
      expect(stats.averageInferenceTime).toBeGreaterThan(10000);
    });

    it('should track model-specific performance', () => {
      const model1Metrics: InferenceMetrics = {
        tokensPerSecond: 15,
        totalTokens: 100,
        inferenceTime: 6667,
        modelName: 'model-1',
        promptLength: 20,
        responseLength: 80,
        timestamp: new Date()
      };

      const model2Metrics: InferenceMetrics = {
        tokensPerSecond: 25,
        totalTokens: 100,
        inferenceTime: 4000,
        modelName: 'model-2',
        promptLength: 20,
        responseLength: 80,
        timestamp: new Date()
      };

      performanceMonitor.recordInference(model1Metrics);
      performanceMonitor.recordInference(model2Metrics);

      // Should track both models
      const stats = performanceMonitor.getInferenceStats();
      expect(stats.totalInferences).toBe(2);
    });
  });

  describe('memory monitoring', () => {
    it('should detect memory pressure', () => {
      mockOs.freemem.mockReturnValue(512 * 1024 * 1024); // 512MB free - very low

      const metrics = performanceMonitor.getSystemMetrics();
      const settings = performanceMonitor.getOptimalModelSettings();

      const usagePercentage = (metrics.memoryUsage.used / metrics.memoryUsage.total) * 100;
      expect(usagePercentage).toBeGreaterThan(90);
      expect(settings.recommendedRAM).toBeLessThanOrEqual(1);
    });

    it('should recommend model downgrades under memory pressure', () => {
      mockOs.freemem.mockReturnValue(1024 * 1024 * 1024); // 1GB free

      const settings = performanceMonitor.getOptimalModelSettings();

      expect(settings.estimatedSpeed).toBe('slow');
      expect(settings.recommendedRAM).toBeLessThanOrEqual(1);
    });
  });

  describe('CPU monitoring', () => {
    it('should factor in CPU load for recommendations', () => {
      mockOs.loadavg.mockReturnValue([8.0, 8.5, 9.0]); // High load

      const metrics = performanceMonitor.getSystemMetrics();

      expect(metrics.loadAverage[0]).toBeGreaterThan(7);
    });

    it('should consider CPU cores for parallel processing', () => {
      mockOs.cpus.mockReturnValue(new Array(16).fill({
        model: 'High-end CPU',
        speed: 3600,
        times: { user: 1000000, nice: 0, sys: 500000, idle: 8000000, irq: 0 }
      }));
      // Also need enough RAM for fast performance
      mockOs.freemem.mockReturnValue(32 * 1024 * 1024 * 1024); // 32GB free

      const settings = performanceMonitor.getOptimalModelSettings();

      // With 16 cores and good RAM, should be fast
      expect(settings.estimatedSpeed).toBe('fast');
    });
  });

  describe('inference statistics', () => {
    it('should provide zero stats when no inferences recorded', () => {
      const stats = performanceMonitor.getInferenceStats();

      expect(stats.totalInferences).toBe(0);
      expect(stats.averageTokensPerSecond).toBe(0);
      expect(stats.averageInferenceTime).toBe(0);
    });

    it('should maintain statistics integrity with edge cases', () => {
      // Test with zero values
      const edgeMetrics: InferenceMetrics = {
        tokensPerSecond: 0,
        totalTokens: 0,
        inferenceTime: 0,
        modelName: 'test-model',
        promptLength: 0,
        responseLength: 0,
        timestamp: new Date()
      };

      performanceMonitor.recordInference(edgeMetrics);

      const stats = performanceMonitor.getInferenceStats();
      expect(stats.totalInferences).toBe(1);
      expect(stats.averageTokensPerSecond).toBe(0);
      expect(stats.averageInferenceTime).toBe(0);
    });
  });

  describe('real-time monitoring', () => {
    it('should provide consistent real-time metrics', () => {
      const metrics1 = performanceMonitor.getSystemMetrics();
      const metrics2 = performanceMonitor.getSystemMetrics();

      // Should be consistent for same system state
      expect(metrics1.memoryUsage.total).toBe(metrics2.memoryUsage.total);
      expect(metrics1.platform).toBe(metrics2.platform);
    });

    it('should update recommendations based on current state', () => {
      const settings1 = performanceMonitor.getOptimalModelSettings();

      // Simulate memory pressure
      mockOs.freemem.mockReturnValue(512 * 1024 * 1024);

      const settings2 = performanceMonitor.getOptimalModelSettings();

      expect(settings2.recommendedRAM).toBeLessThan(settings1.recommendedRAM);
    });
  });
});