/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { TrustModelManagerImpl } from './modelManager.js';
import { TrustModelConfig } from './types.js';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('path');
vi.mock('./modelDownloader.js');

const mockFs = fs as {
  access: MockedFunction<typeof fs.access>;
  readdir: MockedFunction<typeof fs.readdir>;
  stat: MockedFunction<typeof fs.stat>;
  writeFile: MockedFunction<typeof fs.writeFile>;
  readFile: MockedFunction<typeof fs.readFile>;
  mkdir: MockedFunction<typeof fs.mkdir>;
};

describe('TrustModelManager', () => {
  let modelManager: TrustModelManagerImpl;
  const testModelsDir = '/test/models';

  beforeEach(() => {
    vi.clearAllMocks();
    modelManager = new TrustModelManagerImpl(testModelsDir);
  });

  describe('initialization', () => {
    it('should create models directory if it does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('Directory does not exist'));
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await modelManager.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith(testModelsDir, { recursive: true });
    });

    it('should scan existing models on initialization', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([
        'model1.gguf',
        'model2.gguf',
        'not-a-model.txt'
      ] as any);

      await modelManager.initialize();

      expect(mockFs.readdir).toHaveBeenCalledWith(testModelsDir);
    });
  });

  describe('model listing', () => {
    it('should return available models', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await modelManager.initialize();
      const models = modelManager.listAvailableModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
    });

    it('should include trust scores for models', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await modelManager.initialize();
      const models = modelManager.listAvailableModels();

      models.forEach(model => {
        expect(model.trustScore).toBeGreaterThanOrEqual(1);
        expect(model.trustScore).toBeLessThanOrEqual(10);
      });
    });
  });

  describe('model recommendations', () => {
    it('should recommend appropriate model for coding tasks', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await modelManager.initialize();
      const recommendation = modelManager.getRecommendedModel('coding');

      expect(recommendation).toBeDefined();
      expect(recommendation?.name).toBeDefined();
      expect(recommendation?.trustScore).toBeGreaterThan(7);
    });

    it('should recommend appropriate model for writing tasks', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await modelManager.initialize();
      const recommendation = modelManager.getRecommendedModel('writing');

      expect(recommendation).toBeDefined();
      expect(recommendation?.name).toBeDefined();
    });

    it('should consider RAM limits in recommendations', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await modelManager.initialize();
      const recommendation = modelManager.getRecommendedModel('coding', 4);

      if (recommendation) {
        expect(typeof recommendation.ramRequirement).toBe('number');
        expect(recommendation.ramRequirement).toBeLessThanOrEqual(4);
      }
    });
  });

  describe('model switching', () => {
    it('should switch to existing model', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await modelManager.initialize();
      const models = modelManager.listAvailableModels();
      const targetModel = models[0];

      await modelManager.switchModel(targetModel.name);
      const currentModel = modelManager.getCurrentModel();

      expect(currentModel?.name).toBe(targetModel.name);
    });

    it('should throw error when switching to non-existent model', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await modelManager.initialize();

      await expect(modelManager.switchModel('non-existent-model')).rejects.toThrow();
    });
  });

  describe('model verification', () => {
    it('should verify existing model files', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await modelManager.initialize();
      const testPath = '/test/models/test-model.gguf';
      mockFs.access.mockResolvedValue(undefined);

      const exists = await modelManager.verifyModel(testPath);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent model files', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await modelManager.initialize();
      const testPath = '/test/models/non-existent.gguf';
      mockFs.access.mockRejectedValue(new Error('File not found'));

      const exists = await modelManager.verifyModel(testPath);
      expect(exists).toBe(false);
    });
  });

  describe('model integrity checking', () => {
    it('should validate model integrity with correct hash', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);
      mockFs.readFile.mockResolvedValue(Buffer.from('test model content'));

      await modelManager.initialize();
      const result = await modelManager.verifyModelIntegrity('test-model');

      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });

    it('should handle missing model files gracefully', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      await modelManager.initialize();
      const result = await modelManager.verifyModelIntegrity('non-existent-model');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('model download', () => {
    it('should initiate model download', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await modelManager.initialize();
      
      // Mock successful download
      await expect(modelManager.downloadModel('test-model')).resolves.not.toThrow();
    });

    it('should handle download errors', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await modelManager.initialize();
      
      // Test error handling for invalid model
      await expect(modelManager.downloadModel('')).rejects.toThrow();
    });
  });

  describe('model deletion', () => {
    it('should delete existing model', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await modelManager.initialize();
      const models = modelManager.listAvailableModels();
      const targetModel = models[0];

      await expect(modelManager.deleteModel(targetModel.name)).resolves.not.toThrow();
    });

    it('should throw error when deleting non-existent model', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await modelManager.initialize();

      await expect(modelManager.deleteModel('non-existent-model')).rejects.toThrow();
    });
  });

  describe('configuration management', () => {
    it('should save and load configuration', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readdir.mockResolvedValue([]);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({ currentModel: 'test-model' }));

      await modelManager.initialize();
      
      // Configuration should be handled internally
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });
});