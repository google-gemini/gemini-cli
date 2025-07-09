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
import type { GenerateContentParameters, CountTokensParameters } from '@google/genai';

// Mock dependencies
vi.mock('./modelManager.js');
vi.mock('./nodeLlamaClient.js');
vi.mock('../config/trustConfig.js');
vi.mock('./ollamaContentGenerator.js');

const MockTrustModelManager = vi.mocked(TrustModelManagerImpl);
const MockTrustNodeLlamaClient = vi.mocked(TrustNodeLlamaClient);
const MockTrustConfiguration = vi.mocked(TrustConfiguration);
const MockOllamaContentGenerator = vi.mocked(OllamaContentGenerator);

describe('TrustContentGenerator', () => {
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
      getFallbackOrder: vi.fn().mockReturnValue(['trust-local', 'ollama', 'cloud']), // Trust Local first for these tests
      isFallbackEnabled: vi.fn().mockReturnValue(true),
      isBackendEnabled: vi.fn().mockReturnValue(true),
      getTrustLocalConfig: vi.fn().mockReturnValue({
        enabled: true,
        gbnfFunctions: true,
      }),
      getOllamaConfig: vi.fn().mockReturnValue({
        baseUrl: 'http://localhost:11434',
        defaultModel: 'qwen2.5:1.5b',
        timeout: 120000,
        maxToolCalls: 3,
      }),
      getCloudConfig: vi.fn().mockReturnValue({
        enabled: false,
        provider: 'google',
      }),
    };

    mockOllamaGenerator = {
      initialize: vi.fn().mockRejectedValue(new Error('Ollama not available for these tests')),
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
    };

    MockTrustModelManager.mockImplementation(() => mockModelManager);
    MockTrustNodeLlamaClient.mockImplementation(() => mockModelClient);
    MockTrustConfiguration.mockImplementation(() => mockTrustConfig);
    MockOllamaContentGenerator.mockImplementation(() => mockOllamaGenerator);

    contentGenerator = new TrustContentGenerator('/test/models');
  });

  describe('initialization', () => {
    it('should initialize configuration and backend based on fallback order', async () => {
      mockModelManager.getCurrentModel.mockReturnValue(null);

      await contentGenerator.initialize();

      expect(mockTrustConfig.initialize).toHaveBeenCalled();
      expect(mockTrustConfig.getFallbackOrder).toHaveBeenCalled();
      expect(mockModelManager.initialize).toHaveBeenCalled(); // Trust Local is first in fallback order
    });

    it('should load default model if available', async () => {
      const mockModel = {
        name: 'test-model',
        path: '/test/models/test-model.gguf',
        type: 'gguf',
        parameters: '1.5B',
        contextSize: 4096,
        quantization: 'Q4_K_M',
        trustScore: 8,
        ramRequirement: 2,
        tasks: ['coding', 'writing']
      };

      mockModelManager.getCurrentModel.mockReturnValue(mockModel);
      mockModelClient.loadModel.mockResolvedValue(undefined);

      await contentGenerator.initialize();

      expect(mockModelClient.loadModel).toHaveBeenCalledWith(mockModel.path, mockModel);
    });

    it('should fall back to recommended model if default fails', async () => {
      const mockModel = {
        name: 'test-model',
        path: '/test/models/test-model.gguf',
        type: 'gguf',
        parameters: '1.5B',
        contextSize: 4096,
        quantization: 'Q4_K_M',
        trustScore: 8,
        ramRequirement: 2,
        tasks: ['coding', 'writing']
      };

      const recommendedModel = {
        name: 'fallback-model',
        path: '/test/models/fallback.gguf',
        type: 'gguf',
        parameters: '1.5B',
        contextSize: 4096,
        quantization: 'Q4_K_M',
        trustScore: 9,
        ramRequirement: 2,
        tasks: ['coding', 'writing']
      };

      mockModelManager.getCurrentModel.mockReturnValue(mockModel);
      mockModelClient.loadModel
        .mockRejectedValueOnce(new Error('Failed to load'))
        .mockResolvedValueOnce(undefined);
      mockModelManager.getRecommendedModel.mockReturnValue(recommendedModel);
      mockModelManager.switchModel.mockResolvedValue(undefined);

      await contentGenerator.initialize();

      expect(mockModelClient.loadModel).toHaveBeenCalledWith(recommendedModel.path, recommendedModel);
      expect(mockModelManager.switchModel).toHaveBeenCalledWith(recommendedModel.name);
    });
  });

  describe('content generation', () => {
    beforeEach(async () => {
      mockModelManager.getCurrentModel.mockReturnValue(null);
      mockModelClient.isModelLoaded.mockReturnValue(true);
      await contentGenerator.initialize();
    });

    it('should generate content from text prompt', async () => {
      const request: GenerateContentParameters = {
        model: 'test-model',
        contents: [{
          parts: [{ text: 'Hello, how are you?' }],
          role: 'user'
        }]
      };

      const mockResponse = 'Hello! I am doing well, thank you for asking.';
      mockModelClient.generateText.mockResolvedValue(mockResponse);

      const result = await contentGenerator.generateContent(request);

      expect(mockModelClient.generateText).toHaveBeenCalled();
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates?.[0]?.content?.parts?.[0]?.text).toBe(mockResponse);
      expect(result.candidates?.[0]?.content?.role).toBe('model');
    });

    it('should handle conversation history', async () => {
      const request: GenerateContentParameters = {
        model: 'test-model',
        contents: [
          {
            parts: [{ text: 'What is 2+2?' }],
            role: 'user'
          },
          {
            parts: [{ text: '2+2 equals 4.' }],
            role: 'model'
          },
          {
            parts: [{ text: 'What about 3+3?' }],
            role: 'user'
          }
        ]
      };

      const mockResponse = '3+3 equals 6.';
      mockModelClient.generateText.mockResolvedValue(mockResponse);

      const result = await contentGenerator.generateContent(request);

      const callArgs = mockModelClient.generateText.mock.calls[0][0];
      expect(callArgs).toContain('User: What is 2+2?');
      expect(callArgs).toContain('Assistant: 2+2 equals 4.');
      expect(callArgs).toContain('User: What about 3+3?');
    });

    it('should handle system instructions', async () => {
      const request: GenerateContentParameters = {
        model: 'test-model',
        contents: [{
          parts: [{ text: 'Hello!' }],
          role: 'user'
        }],
        config: {
          systemInstruction: {
            parts: [{ text: 'You are a helpful assistant.' }]
          }
        }
      };

      mockModelClient.generateText.mockResolvedValue('Hello there!');

      await contentGenerator.generateContent(request);

      const callArgs = mockModelClient.generateText.mock.calls[0][0];
      expect(callArgs).toContain('You are a helpful assistant.');
    });

    it('should throw error when no model is loaded', async () => {
      mockModelClient.isModelLoaded.mockReturnValue(false);

      const request: GenerateContentParameters = {
        model: 'test-model',
        contents: [{
          parts: [{ text: 'Hello!' }],
          role: 'user'
        }]
      };

      await expect(contentGenerator.generateContent(request)).rejects.toThrow(
        'No AI backend available. Please install Ollama or download Trust Local models.'
      );
    });

    it('should use generation options from config', async () => {
      const request: GenerateContentParameters = {
        model: 'test-model',
        contents: [{
          parts: [{ text: 'Hello!' }],
          role: 'user'
        }],
        config: {
          temperature: 0.8,
          topP: 0.95
        }
      };

      mockModelClient.generateText.mockResolvedValue('Response');

      await contentGenerator.generateContent(request);

      const callArgs = mockModelClient.generateText.mock.calls[0];
      expect(callArgs[1]).toMatchObject({
        temperature: 0.8,
        topP: 0.95,
        maxTokens: 512
      });
    });
  });

  describe('streaming generation', () => {
    beforeEach(async () => {
      mockModelManager.getCurrentModel.mockReturnValue(null);
      mockModelClient.isModelLoaded.mockReturnValue(true);
      await contentGenerator.initialize();
    });

    it('should generate streaming content', async () => {
      const request: GenerateContentParameters = {
        model: 'test-model',
        contents: [{
          parts: [{ text: 'Tell me a story' }],
          role: 'user'
        }]
      };

      const mockChunks = ['Once', ' upon', ' a', ' time...'];
      mockModelClient.generateStream.mockImplementation(async function* () {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      });

      const generator = await contentGenerator.generateContentStream(request);
      const chunks = [];
      
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      // Verify the structure of streaming chunks
      chunks.forEach(chunk => {
        expect(chunk).toHaveProperty('candidates');
        expect(chunk.candidates?.[0]).toHaveProperty('content');
        expect(chunk.candidates?.[0]?.content).toHaveProperty('parts');
      });
    });

    it('should handle streaming errors', async () => {
      const request: GenerateContentParameters = {
        model: 'test-model',
        contents: [{
          parts: [{ text: 'Hello!' }],
          role: 'user'
        }]
      };

      mockModelClient.generateStream.mockImplementation(async function* () {
        throw new Error('Streaming failed');
      });

      const generator = await contentGenerator.generateContentStream(request);
      
      await expect(async () => {
        for await (const chunk of generator) {
          // Should throw error
        }
      }).rejects.toThrow('Streaming failed');
    });
  });

  describe('token counting', () => {
    beforeEach(async () => {
      mockModelManager.getCurrentModel.mockReturnValue(null);
      await contentGenerator.initialize();
    });

    it('should estimate token count for simple text', async () => {
      const request: CountTokensParameters = {
        model: 'test-model',
        contents: [{
          parts: [{ text: 'This is a test message with some words.' }],
          role: 'user'
        }]
      };

      const result = await contentGenerator.countTokens(request);

      expect(result.totalTokens).toBeGreaterThan(0);
      expect(typeof result.totalTokens).toBe('number');
    });

    it('should handle empty content', async () => {
      const request: CountTokensParameters = {
        model: 'test-model',
        contents: []
      };

      const result = await contentGenerator.countTokens(request);

      expect(result.totalTokens).toBe(0);
    });
  });

  describe('model management', () => {
    beforeEach(async () => {
      mockModelManager.getCurrentModel.mockReturnValue(null);
      await contentGenerator.initialize();
    });

    it('should switch models', async () => {
      const newModel = {
        name: 'new-model',
        path: '/test/models/new-model.gguf',
        type: 'gguf',
        parameters: '7B',
        contextSize: 8192,
        quantization: 'Q4_K_M',
        trustScore: 9,
        ramRequirement: 4,
        tasks: ['coding']
      };

      mockModelManager.switchModel.mockResolvedValue(undefined);
      mockModelManager.getCurrentModel.mockReturnValue(newModel);
      mockModelClient.loadModel.mockResolvedValue(undefined);

      await contentGenerator.switchModel('new-model');

      expect(mockModelManager.switchModel).toHaveBeenCalledWith('new-model');
      expect(mockModelClient.loadModel).toHaveBeenCalledWith(newModel.path, newModel);
    });

    it('should download models', async () => {
      mockModelManager.downloadModel.mockResolvedValue(undefined);

      await contentGenerator.downloadModel('test-model-id');

      expect(mockModelManager.downloadModel).toHaveBeenCalledWith('test-model-id');
    });

    it('should list available models', () => {
      const mockModels = [
        {
          name: 'model1',
          path: '/test/model1.gguf',
          type: 'gguf',
          parameters: '1.5B',
          contextSize: 4096,
          quantization: 'Q4_K_M',
          trustScore: 8,
          ramRequirement: 2,
          tasks: ['coding']
        }
      ];

      mockModelManager.listAvailableModels.mockReturnValue(mockModels);

      const result = contentGenerator.listAvailableModels();

      expect(result).toEqual(mockModels);
    });

    it('should get current model', () => {
      const mockModel = {
        name: 'current-model',
        path: '/test/current.gguf',
        type: 'gguf',
        parameters: '3B',
        contextSize: 4096,
        quantization: 'Q4_K_M',
        trustScore: 8,
        ramRequirement: 3,
        tasks: ['writing']
      };

      mockModelManager.getCurrentModel.mockReturnValue(mockModel);

      const result = contentGenerator.getCurrentModel();

      expect(result).toEqual(mockModel);
    });

    it('should get model metrics', () => {
      const mockMetrics = {
        modelLoaded: true,
        modelName: 'test-model',
        lastInferenceTime: 1500,
        totalInferences: 10,
        averageInferenceTime: 1200,
        tokensPerSecond: 15.5
      };

      mockModelClient.getMetrics.mockReturnValue(mockMetrics);

      const result = contentGenerator.getModelMetrics();

      expect(result).toEqual(mockMetrics);
    });

    it('should get recommended model', () => {
      const mockModel = {
        name: 'recommended-model',
        path: '/test/recommended.gguf',
        type: 'gguf',
        parameters: '1.5B',
        contextSize: 4096,
        quantization: 'Q4_K_M',
        trustScore: 9,
        ramRequirement: 2,
        tasks: ['coding']
      };

      mockModelManager.getRecommendedModel.mockReturnValue(mockModel);

      const result = contentGenerator.getRecommendedModel('coding', 4);

      expect(result).toEqual(mockModel);
      expect(mockModelManager.getRecommendedModel).toHaveBeenCalledWith('coding', 4);
    });
  });
});