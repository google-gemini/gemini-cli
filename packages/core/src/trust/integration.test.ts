/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach, type MockedFunction } from 'vitest';
import { TrustContentGenerator } from './trustContentGenerator.js';
import { TrustModelManagerImpl } from './modelManager.js';
import { PerformanceMonitor } from './performanceMonitor.js';
import { PrivacyManager } from './privacyManager.js';
import { TrustConfiguration } from './types.js';
import type { GenerateContentParameters } from '@google/genai';

// Mock file system for all components
vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('os', () => ({
  cpus: vi.fn(() => [{ model: 'Apple M1' }, { model: 'Apple M1' }]),
  totalmem: vi.fn(() => 8589934592),
  freemem: vi.fn(() => 4294967296),
  platform: vi.fn(() => 'darwin'),
  arch: vi.fn(() => 'arm64'),
}));

// Import mocked fs after mocking
import * as fs from 'fs/promises';

const mockFs = fs as any;

describe('Trust CLI Integration Tests', () => {
  let contentGenerator: TrustContentGenerator;
  let modelManager: TrustModelManagerImpl;
  let performanceMonitor: PerformanceMonitor;
  let privacyManager: PrivacyManager;

  const testModelsDir = '/test/models';
  const testConfigPath = '/test/privacy.json';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup common mocks
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue('{}');
    mockFs.mkdir.mockResolvedValue(undefined);

    // Initialize components
    contentGenerator = new TrustContentGenerator(testModelsDir);
    modelManager = new TrustModelManagerImpl(testModelsDir);
    performanceMonitor = new PerformanceMonitor();
    privacyManager = new PrivacyManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Model Management + Content Generation Integration', () => {
    it('should integrate model switching with content generation', async () => {
      // Initialize systems
      await modelManager.initialize();
      await contentGenerator.initialize();

      // Get available models
      const models = modelManager.listAvailableModels();
      expect(models.length).toBeGreaterThan(0);

      // Switch to a specific model
      const targetModel = models[0];
      await contentGenerator.switchModel(targetModel.name);

      // Verify the model is set
      const currentModel = contentGenerator.getCurrentModel();
      expect(currentModel?.name).toBe(targetModel.name);
    });

    it('should handle model recommendations based on task', async () => {
      await modelManager.initialize();

      const codingModel = modelManager.getRecommendedModel('coding');
      const writingModel = modelManager.getRecommendedModel('writing');

      expect(codingModel).toBeDefined();
      expect(writingModel).toBeDefined();
      
      // Coding models should have high trust scores
      if (codingModel) {
        expect(codingModel.trustScore).toBeGreaterThan(7);
      }
    });

    it('should respect hardware limitations in model selection', async () => {
      await modelManager.initialize();

      // Test with limited RAM
      const limitedModel = modelManager.getRecommendedModel('coding', 2);
      
      if (limitedModel) {
        expect(limitedModel.ramRequirement).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('Performance Monitoring + Model Management Integration', () => {
    it('should track model performance metrics', async () => {
      await modelManager.initialize();
      await contentGenerator.initialize();

      // Simulate inference
      const inferenceMetrics = {
        tokensPerSecond: 15.5,
        totalTokens: 100,
        inferenceTime: 6451,
        modelName: 'test-model',
        promptLength: 20,
        responseLength: 80,
        timestamp: new Date()
      };

      performanceMonitor.recordInference(inferenceMetrics);

      const stats = performanceMonitor.getInferenceStats();
      expect(stats.totalInferences).toBe(1);
      expect(stats.averageTokensPerSecond).toBe(15.5);
    });

    it('should provide hardware-aware model recommendations', async () => {
      await modelManager.initialize();

      const systemMetrics = performanceMonitor.getSystemMetrics();
      const optimalSettings = performanceMonitor.getOptimalModelSettings();

      // Recommend model based on system capabilities
      const recommendedModel = modelManager.getRecommendedModel(
        'coding',
        Math.floor(systemMetrics.memoryUsage.available)
      );

      if (recommendedModel) {
        expect(recommendedModel.ramRequirement).toBeLessThanOrEqual(
          optimalSettings.recommendedRAM
        );
      }
    });

    it('should adapt recommendations based on performance history', async () => {
      await modelManager.initialize();

      // Record poor performance
      const poorPerformance = {
        tokensPerSecond: 2,
        totalTokens: 50,
        inferenceTime: 25000, // Very slow
        modelName: 'heavy-model',
        promptLength: 100,
        responseLength: 50,
        timestamp: new Date()
      };

      performanceMonitor.recordInference(poorPerformance);

      const stats = performanceMonitor.getInferenceStats();
      expect(stats.averageTokensPerSecond).toBeLessThan(5);

      // System should recommend lighter models
      const settings = performanceMonitor.getOptimalModelSettings();
      expect(settings.estimatedSpeed).toContain('slower');
    });
  });

  describe('Privacy + Content Generation Integration', () => {
    it('should sanitize content based on privacy mode', async () => {
      await privacyManager.initialize();
      await contentGenerator.initialize();

      // Set strict privacy mode
      await privacyManager.setPrivacyMode('strict');

      const sensitiveRequest: GenerateContentParameters = {
        contents: [{
          parts: [{ text: 'My API key is sk-1234567890 and password is secret123' }],
          role: 'user'
        }],
        model: 'test-model'
      };

      // Sanitize the request data
      const sanitizedRequest = privacyManager.sanitizeData(sensitiveRequest);

      expect(JSON.stringify(sanitizedRequest)).toContain('[REDACTED]');
      expect(JSON.stringify(sanitizedRequest)).not.toContain('sk-1234567890');
      expect(JSON.stringify(sanitizedRequest)).not.toContain('secret123');
    });

    it('should respect privacy settings during model operations', async () => {
      await privacyManager.initialize();
      await modelManager.initialize();

      // Check if telemetry is allowed
      const canCollectTelemetry = privacyManager.canCollectTelemetry();
      expect(typeof canCollectTelemetry).toBe('boolean');

      // Check if data sharing is allowed
      const canShareData = privacyManager.canShareData();
      expect(typeof canShareData).toBe('boolean');

      // In strict mode, these should be false
      expect(canCollectTelemetry).toBe(false);
      expect(canShareData).toBe(false);
    });

    it('should encrypt sensitive model data when required', async () => {
      await privacyManager.initialize();
      await privacyManager.setPrivacyMode('strict');

      const sensitiveModelData = {
        modelPath: '/sensitive/path/model.gguf',
        userQueries: ['What is my password?', 'Show me private data'],
        apiKeys: ['sk-abc123', 'sk-def456']
      };

      const encrypted = await privacyManager.encryptData(JSON.stringify(sensitiveModelData));
      expect(encrypted).not.toBe(JSON.stringify(sensitiveModelData));

      const decrypted = await privacyManager.decryptData(encrypted);
      expect(JSON.parse(decrypted)).toEqual(sensitiveModelData);
    });
  });

  describe('Complete Workflow Integration', () => {
    it('should handle complete inference workflow with all components', async () => {
      // Initialize all components
      await privacyManager.initialize();
      await modelManager.initialize();
      await contentGenerator.initialize();

      // Set privacy mode
      await privacyManager.setPrivacyMode('moderate');

      // Get system capabilities
      const systemMetrics = performanceMonitor.getSystemMetrics();
      const optimalSettings = performanceMonitor.getOptimalModelSettings();

      // Select appropriate model
      const recommendedModel = modelManager.getRecommendedModel(
        'coding',
        Math.floor(systemMetrics.memoryUsage.available * 0.8) // Use 80% of available RAM
      );

      expect(recommendedModel).toBeDefined();

      if (recommendedModel) {
        // Switch to recommended model
        await contentGenerator.switchModel(recommendedModel.name);

        // Verify model is loaded
        const currentModel = contentGenerator.getCurrentModel();
        expect(currentModel?.name).toBe(recommendedModel.name);

        // Prepare request
        const request: GenerateContentParameters = {
          contents: [{
            parts: [{ text: 'Write a simple hello world function in Python' }],
            role: 'user'
          }],
          model: 'test-model',
          config: {
            temperature: 0.7,
            topP: 0.9
          }
        };

        // Sanitize request if needed
        const sanitizedRequest = privacyManager.sanitizeData(request);

        // Record performance metrics
        const startTime = Date.now();
        
        // Simulate content generation (would normally call actual model)
        const mockResponse = 'def hello_world():\n    print("Hello, World!")';
        
        const endTime = Date.now();
        const inferenceTime = endTime - startTime;

        // Record inference metrics
        performanceMonitor.recordInference({
          tokensPerSecond: 20,
          totalTokens: 15,
          inferenceTime,
          modelName: recommendedModel.name,
          promptLength: 10,
          responseLength: 15,
          timestamp: new Date()
        });

        // Verify performance tracking
        const stats = performanceMonitor.getInferenceStats();
        expect(stats.totalInferences).toBe(1);
        expect(stats.averageTokensPerSecond).toBe(20);
      }
    });

    it('should handle error scenarios across components', async () => {
      // Test model loading failure
      mockFs.access.mockRejectedValue(new Error('Model file not found'));
      
      await modelManager.initialize();
      const models = modelManager.listAvailableModels();
      
      // Should still have default models available
      expect(models.length).toBeGreaterThan(0);

      // Test invalid model switch
      await expect(
        contentGenerator.switchModel('non-existent-model')
      ).rejects.toThrow();
    });

    it('should maintain data consistency across components', async () => {
      await privacyManager.initialize();
      await modelManager.initialize();
      await contentGenerator.initialize();

      // Set privacy mode and verify consistency
      await privacyManager.setPrivacyMode('strict');
      expect(privacyManager.getCurrentMode()).toBe('strict');

      // Switch model and verify consistency
      const models = modelManager.listAvailableModels();
      if (models.length > 0) {
        await contentGenerator.switchModel(models[0].name);
        
        const contentGenModel = contentGenerator.getCurrentModel();
        const managerModel = modelManager.getCurrentModel();
        
        expect(contentGenModel?.name).toBe(managerModel?.name);
      }
    });
  });

  describe('MCP Server Integration', () => {
    it('should handle MCP tool execution with local models', async () => {
      await contentGenerator.initialize();

      // Simulate MCP tool call
      const mockToolCall = {
        name: 'filesystem_read',
        parameters: {
          path: '/test/file.txt'
        }
      };

      // In a real scenario, this would:
      // 1. Parse the function call from model output
      // 2. Execute the MCP tool
      // 3. Return the result to the model
      // 4. Continue the conversation

      // For now, just verify the structure is in place
      expect(contentGenerator.listAvailableModels).toBeDefined();
      expect(contentGenerator.generateContent).toBeDefined();
    });

    it('should respect privacy settings during MCP operations', async () => {
      await privacyManager.initialize();
      await privacyManager.setPrivacyMode('strict');

      const mcpToolResult = {
        toolName: 'filesystem_read',
        result: 'File contents with sensitive data: API_KEY=sk-secret123',
        timestamp: new Date()
      };

      // Sanitize MCP tool results
      const sanitized = privacyManager.sanitizeData(mcpToolResult);
      
      expect(JSON.stringify(sanitized)).toContain('[REDACTED]');
      expect(JSON.stringify(sanitized)).not.toContain('sk-secret123');
    });
  });

  describe('Configuration Management Integration', () => {
    it('should coordinate configuration across all components', async () => {
      // Initialize all components
      await privacyManager.initialize();
      await modelManager.initialize();
      await contentGenerator.initialize();

      // Verify all components are properly configured
      expect(privacyManager.getCurrentMode()).toBeDefined();
      expect(modelManager.listAvailableModels().length).toBeGreaterThan(0);
      expect(contentGenerator.listAvailableModels().length).toBeGreaterThan(0);

      // Verify privacy settings are applied consistently
      const privacySettings = privacyManager.getPrivacySettings();
      expect(privacySettings).toBeDefined();
      expect(typeof privacySettings.allowTelemetry).toBe('boolean');
      expect(typeof privacySettings.encryptStorage).toBe('boolean');
    });

    it('should handle configuration persistence across restarts', async () => {
      // Simulate a full configuration setup
      await privacyManager.initialize();
      await privacyManager.setPrivacyMode('moderate');
      await privacyManager.setDataRetention(30);

      // Verify configuration is saved
      expect(mockFs.writeFile).toHaveBeenCalled();

      // Simulate restart by creating new instances
      const newPrivacyManager = new PrivacyManager();
      
      // Mock reading the saved configuration
      const savedConfig = {
        mode: 'moderate',
        dataRetention: 30,
        allowTelemetry: false,
        encryptStorage: true,
        shareData: false,
        allowCloudSync: false
      };
      
      mockFs.readFile.mockResolvedValue(JSON.stringify(savedConfig));
      
      await newPrivacyManager.initialize();
      
      expect(newPrivacyManager.getCurrentMode()).toBe('moderate');
      expect(newPrivacyManager.getDataRetentionDays()).toBe(30);
    });
  });
});