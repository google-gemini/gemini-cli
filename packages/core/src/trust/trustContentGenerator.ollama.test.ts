/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { TrustContentGenerator } from './trustContentGenerator.js';
import { TrustModelManagerImpl } from './modelManager.js';
import { TrustNodeLlamaClient } from './nodeLlamaClient.js';
import { TrustConfiguration } from '../config/trustConfig.js';
import { OllamaContentGenerator } from './ollamaContentGenerator.js';
import type { GenerateContentParameters } from '@google/genai';

// Mock dependencies
vi.mock('./modelManager.js');
vi.mock('./nodeLlamaClient.js');
vi.mock('../config/trustConfig.js');
vi.mock('./ollamaContentGenerator.js');

const MockTrustModelManager = vi.mocked(TrustModelManagerImpl);
const MockTrustNodeLlamaClient = vi.mocked(TrustNodeLlamaClient);
const MockTrustConfiguration = vi.mocked(TrustConfiguration);
const MockOllamaContentGenerator = vi.mocked(OllamaContentGenerator);

describe('TrustContentGenerator with Ollama', () => {
  let contentGenerator: TrustContentGenerator;
  let mockModelManager: any;
  let mockModelClient: any;
  let mockTrustConfig: any;
  let mockOllamaGenerator: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockModelManager = {
      initialize: vi.fn(),
      getCurrentModel: vi.fn(),
      getRecommendedModel: vi.fn(),
      switchModel: vi.fn(),
      downloadModel: vi.fn(),
      listAvailableModels: vi.fn(),
      verifyModel: vi.fn(),
      verifyModelIntegrity: vi.fn(),
      deleteModel: vi.fn(),
    };

    mockModelClient = {
      loadModel: vi.fn(),
      isModelLoaded: vi.fn(),
      generateText: vi.fn(),
      generateStream: vi.fn(),
      getMetrics: vi.fn(),
    };

    mockTrustConfig = {
      initialize: vi.fn(),
      getFallbackOrder: vi.fn().mockReturnValue(['ollama', 'trust-local', 'cloud']),
      isFallbackEnabled: vi.fn().mockReturnValue(true),
      isBackendEnabled: vi.fn().mockReturnValue(true),
      getOllamaConfig: vi.fn().mockReturnValue({
        baseUrl: 'http://localhost:11434',
        defaultModel: 'qwen2.5:1.5b',
        timeout: 120000,
        maxToolCalls: 3,
      }),
      getTrustLocalConfig: vi.fn().mockReturnValue({
        enabled: true,
        gbnfFunctions: true,
      }),
      getCloudConfig: vi.fn().mockReturnValue({
        enabled: false,
        provider: 'google',
      }),
      save: vi.fn(),
      setPreferredBackend: vi.fn(),
      setFallbackOrder: vi.fn(),
    };

    mockOllamaGenerator = {
      initialize: vi.fn(),
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
    };

    MockTrustModelManager.mockImplementation(() => mockModelManager);
    MockTrustNodeLlamaClient.mockImplementation(() => mockModelClient);
    MockTrustConfiguration.mockImplementation(() => mockTrustConfig);
    MockOllamaContentGenerator.mockImplementation(() => mockOllamaGenerator);

    contentGenerator = new TrustContentGenerator('/test/models');
  });

  describe('Ollama-first initialization', () => {
    it('should try Ollama first when available', async () => {
      mockOllamaGenerator.initialize.mockResolvedValue(undefined);

      await contentGenerator.initialize();

      expect(mockTrustConfig.initialize).toHaveBeenCalled();
      expect(mockTrustConfig.getFallbackOrder).toHaveBeenCalled();
      expect(mockOllamaGenerator.initialize).toHaveBeenCalled();
      expect(mockModelManager.initialize).not.toHaveBeenCalled(); // Should not fall back
    });

    it('should fall back to Trust Local when Ollama unavailable', async () => {
      mockOllamaGenerator.initialize.mockRejectedValue(new Error('Ollama not running'));
      mockModelManager.getCurrentModel.mockReturnValue({
        name: 'test-model',
        path: '/test/models/test-model.gguf',
        type: 'gguf',
      });
      mockModelClient.loadModel.mockResolvedValue(undefined);

      await contentGenerator.initialize();

      expect(mockOllamaGenerator.initialize).toHaveBeenCalled();
      expect(mockModelManager.initialize).toHaveBeenCalled();
      expect(mockModelClient.loadModel).toHaveBeenCalled();
    });

    it('should respect fallback order configuration', async () => {
      mockTrustConfig.getFallbackOrder.mockReturnValue(['trust-local', 'ollama', 'cloud']);
      mockModelManager.getCurrentModel.mockReturnValue(null);
      mockOllamaGenerator.initialize.mockResolvedValue(undefined);

      await contentGenerator.initialize();

      // Should try Trust Local first based on config
      expect(mockModelManager.initialize).toHaveBeenCalled();
    });

    it('should respect disabled backends', async () => {
      mockTrustConfig.isBackendEnabled.mockImplementation((backend: string) => {
        return backend !== 'ollama'; // Ollama disabled
      });
      mockModelManager.getCurrentModel.mockReturnValue(null);

      await contentGenerator.initialize();

      expect(mockOllamaGenerator.initialize).not.toHaveBeenCalled();
      expect(mockModelManager.initialize).toHaveBeenCalled();
    });

    it('should stop trying backends when fallback disabled', async () => {
      mockTrustConfig.isFallbackEnabled.mockReturnValue(false);
      mockOllamaGenerator.initialize.mockRejectedValue(new Error('Ollama not running'));

      await contentGenerator.initialize();

      expect(mockOllamaGenerator.initialize).toHaveBeenCalled();
      expect(mockModelManager.initialize).not.toHaveBeenCalled(); // No fallback
    });
  });

  describe('content generation with Ollama', () => {
    beforeEach(async () => {
      mockOllamaGenerator.initialize.mockResolvedValue(undefined);
      await contentGenerator.initialize();
    });

    it('should use Ollama for content generation when available', async () => {
      const request: GenerateContentParameters = {
        model: 'test-model',
        contents: [{
          parts: [{ text: 'Hello, how are you?' }],
          role: 'user'
        }]
      };

      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Hello! I am doing well, thank you!' }],
            role: 'model'
          },
          finishReason: 'STOP',
          index: 0,
        }],
        text: 'Hello! I am doing well, thank you!',
      };

      mockOllamaGenerator.generateContent.mockResolvedValue(mockResponse);

      const result = await contentGenerator.generateContent(request);

      expect(mockOllamaGenerator.generateContent).toHaveBeenCalledWith(request);
      expect(result).toEqual(mockResponse);
      expect(mockModelClient.generateText).not.toHaveBeenCalled();
    });

    it('should use Ollama for streaming when available', async () => {
      const request: GenerateContentParameters = {
        model: 'test-model',
        contents: [{
          parts: [{ text: 'Tell me a story' }],
          role: 'user'
        }]
      };

      const mockGenerator = (async function* () {
        yield { text: 'Once' };
        yield { text: ' upon' };
        yield { text: ' a time...' };
      })();

      mockOllamaGenerator.generateContentStream.mockReturnValue(mockGenerator);

      const result = await contentGenerator.generateContentStream(request);

      expect(mockOllamaGenerator.generateContentStream).toHaveBeenCalledWith(request);
      expect(result).toBe(mockGenerator);
    });
  });

  describe('configuration management', () => {
    it('should return trust configuration', () => {
      const config = contentGenerator.getTrustConfig();
      expect(config).toBe(mockTrustConfig);
    });

    it('should save configuration', async () => {
      await contentGenerator.saveConfig();
      expect(mockTrustConfig.save).toHaveBeenCalled();
    });

    it('should update backend preference and reinitialize', async () => {
      mockOllamaGenerator.initialize.mockResolvedValue(undefined);
      
      await contentGenerator.setBackendPreference('trust-local');

      expect(mockTrustConfig.setPreferredBackend).toHaveBeenCalledWith('trust-local');
      expect(mockTrustConfig.save).toHaveBeenCalled();
      expect(mockTrustConfig.initialize).toHaveBeenCalledWith(); // Called during reinit
    });

    it('should update fallback order and reinitialize', async () => {
      mockOllamaGenerator.initialize.mockResolvedValue(undefined);
      
      await contentGenerator.setFallbackOrder(['trust-local', 'ollama', 'cloud']);

      expect(mockTrustConfig.setFallbackOrder).toHaveBeenCalledWith(['trust-local', 'ollama', 'cloud']);
      expect(mockTrustConfig.save).toHaveBeenCalled();
      expect(mockTrustConfig.initialize).toHaveBeenCalledWith(); // Called during reinit
    });

    it('should report current backend correctly', async () => {
      mockOllamaGenerator.initialize.mockResolvedValue(undefined);
      await contentGenerator.initialize();

      const backend = contentGenerator.getCurrentBackend();
      expect(backend).toBe('ollama');
    });

    it('should report backend status correctly', async () => {
      mockOllamaGenerator.initialize.mockResolvedValue(undefined);
      mockModelClient.isModelLoaded.mockReturnValue(false);
      await contentGenerator.initialize();

      const status = contentGenerator.getBackendStatus();
      expect(status).toEqual({
        ollama: true,
        'trust-local': false,
        cloud: false,
      });
    });
  });

  describe('error handling', () => {
    it('should handle initialization errors gracefully', async () => {
      mockOllamaGenerator.initialize.mockRejectedValue(new Error('Network error'));
      mockModelManager.initialize.mockRejectedValue(new Error('No models'));
      mockTrustConfig.getCloudConfig.mockReturnValue({ enabled: false });

      await contentGenerator.initialize();

      // Should complete initialization even if all backends fail
      expect(mockTrustConfig.initialize).toHaveBeenCalled();
    });

    it('should throw error when no backend available for generation', async () => {
      mockOllamaGenerator.initialize.mockRejectedValue(new Error('Not available'));
      mockModelClient.isModelLoaded.mockReturnValue(false);
      await contentGenerator.initialize();

      const request: GenerateContentParameters = {
        model: 'test-model',
        contents: [{
          parts: [{ text: 'Hello' }],
          role: 'user'
        }]
      };

      await expect(contentGenerator.generateContent(request)).rejects.toThrow(
        'No AI backend available'
      );
    });
  });
});