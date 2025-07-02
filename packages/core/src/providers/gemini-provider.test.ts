// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeminiProvider } from './gemini-provider.js';
import type { ChatRequest } from './types.js';
import { AuthType } from '../core/contentGenerator.js';

// Mock dependencies
vi.mock('@google/genai');
vi.mock('../core/modelCheck.js');
vi.mock('../config/models.js', () => ({
  DEFAULT_GEMINI_MODEL: 'gemini-2.5-pro',
  DEFAULT_GEMINI_FLASH_MODEL: 'gemini-2.5-flash'
}));

// Import mocked modules
import { GoogleGenAI } from '@google/genai';
import { getEffectiveModel } from '../core/modelCheck.js';

describe('GeminiProvider', () => {
  let provider: GeminiProvider;
  let mockGoogleGenAI: any;
  let mockModels: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Reset mocks
    vi.clearAllMocks();

    // Mock getEffectiveModel
    vi.mocked(getEffectiveModel).mockImplementation(async (_apiKey, model) => model);

    // Setup GoogleGenAI mock
    mockModels = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn()
    };

    mockGoogleGenAI = {
      models: mockModels
    };

    vi.mocked(GoogleGenAI).mockImplementation(() => mockGoogleGenAI);

    provider = new GeminiProvider();
  });

  afterEach(async () => {
    // Restore original env
    process.env = originalEnv;
    
    if (provider) {
      await provider.dispose();
    }
  });

  describe('initialize', () => {
    it('should initialize with API key from environment', async () => {
      process.env.GEMINI_API_KEY = 'test-api-key';

      await provider.initialize();

      expect(GoogleGenAI).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        vertexai: false,
        httpOptions: expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': expect.stringContaining('GeminiCopilot/')
          })
        })
      });
    });

    it('should initialize with API key from config', async () => {
      await provider.initialize({
        type: 'gemini',
        apiKey: 'config-api-key'
      });

      expect(GoogleGenAI).toHaveBeenCalledWith({
        apiKey: 'config-api-key',
        vertexai: false,
        httpOptions: expect.any(Object)
      });
    });

    it('should initialize for Vertex AI', async () => {
      process.env.GOOGLE_API_KEY = 'vertex-api-key';
      process.env.GOOGLE_CLOUD_PROJECT = 'test-project';
      process.env.GOOGLE_CLOUD_LOCATION = 'us-central1';

      await provider.initialize({
        type: 'gemini',
        authType: AuthType.USE_VERTEX_AI,
        vertexai: true
      });

      expect(GoogleGenAI).toHaveBeenCalledWith({
        apiKey: 'vertex-api-key',
        vertexai: true,
        httpOptions: expect.any(Object)
      });
    });

    it('should throw error if no API key for Gemini auth', async () => {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      await expect(provider.initialize({
        type: 'gemini',
        authType: AuthType.USE_GEMINI
      })).rejects.toThrow('GEMINI_API_KEY environment variable is required');
    });

    it('should throw error if missing Vertex AI config', async () => {
      delete process.env.GOOGLE_CLOUD_PROJECT;

      await expect(provider.initialize({
        type: 'gemini',
        authType: AuthType.USE_VERTEX_AI
      })).rejects.toThrow('GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION must be set');
    });

    it('should use custom model from config', async () => {
      process.env.GEMINI_API_KEY = 'test-key';

      await provider.initialize({
        type: 'gemini',
        model: 'gemini-custom'
      });

      expect(getEffectiveModel).toHaveBeenCalledWith('test-key', 'gemini-custom');
    });
  });

  describe('listModels', () => {
    it('should return known Gemini models', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      await provider.initialize();

      const models = await provider.listModels();

      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        vendor: 'google',
        family: 'gemini',
        version: '2.5',
        maxInputTokens: 2097152,
        maxOutputTokens: 8192
      });
      expect(models[1]).toEqual({
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        vendor: 'google',
        family: 'gemini',
        version: '2.5-flash',
        maxInputTokens: 1048576,
        maxOutputTokens: 8192
      });
    });

    it('should throw error if not initialized', async () => {
      await expect(provider.listModels()).rejects.toThrow('Provider not initialized');
    });
  });

  describe('chat', () => {
    beforeEach(async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      await provider.initialize();
    });

    it('should send chat request and return response', async () => {
      const request: ChatRequest = {
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      };

      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Hi there!' }]
          },
          finishReason: 'STOP'
        }],
        modelVersion: 'gemini-2.5-pro',
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30
        }
      };

      mockModels.generateContent.mockResolvedValue(mockResponse);

      const response = await provider.chat(request);

      expect(mockModels.generateContent).toHaveBeenCalledWith({
        contents: [{
          role: 'user',
          parts: [{ text: 'Hello' }]
        }],
        model: 'gemini-2.5-pro',
        config: {
          temperature: undefined,
          maxOutputTokens: undefined
        }
      });

      expect(response).toEqual({
        id: 'gemini-2.5-pro',
        choices: [{
          message: {
            content: 'Hi there!',
            role: 'assistant'
          },
          index: 0,
          finishReason: 'STOP'
        }],
        model: 'gemini-2.5-pro',
        created: expect.any(Number),
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      });
    });

    it('should handle system messages', async () => {
      const request: ChatRequest = {
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' }
        ]
      };

      mockModels.generateContent.mockResolvedValue({
        candidates: [{
          content: { parts: [{ text: 'Hi!' }] }
        }]
      });

      await provider.chat(request);

      expect(mockModels.generateContent).toHaveBeenCalledWith({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'System: You are helpful\n\nHello' }]
          }
        ],
        model: 'gemini-2.5-pro',
        config: {}
      });
    });

    it('should handle assistant messages', async () => {
      const request: ChatRequest = {
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
          { role: 'user', content: 'How are you?' }
        ]
      };

      mockModels.generateContent.mockResolvedValue({
        candidates: [{
          content: { parts: [{ text: 'I am fine!' }] }
        }]
      });

      await provider.chat(request);

      expect(mockModels.generateContent).toHaveBeenCalledWith({
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'Hi!' }] },
          { role: 'user', parts: [{ text: 'How are you?' }] }
        ],
        model: 'gemini-2.5-pro',
        config: {}
      });
    });

    it('should use custom parameters', async () => {
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gemini-2.5-flash',
        temperature: 0.5,
        maxTokens: 1000
      };

      mockModels.generateContent.mockResolvedValue({
        candidates: [{
          content: { parts: [{ text: 'Hi!' }] }
        }]
      });

      await provider.chat(request);

      expect(mockModels.generateContent).toHaveBeenCalledWith({
        contents: expect.any(Array),
        model: 'gemini-2.5-flash',
        config: {
          temperature: 0.5,
          maxOutputTokens: 1000
        }
      });
    });

    it('should handle API errors', async () => {
      mockModels.generateContent.mockRejectedValue(new Error('API Error'));

      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      await expect(provider.chat(request)).rejects.toThrow('Gemini API error: API Error');
    });

    it('should throw error when not initialized', async () => {
      const uninitializedProvider = new GeminiProvider();
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      await expect(uninitializedProvider.chat(request)).rejects.toThrow(
        'Provider not initialized'
      );
    });
  });

  describe('chatStream', () => {
    beforeEach(async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      await provider.initialize();
    });

    it('should stream chat responses', async () => {
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const mockResponses = [
        {
          candidates: [{
            content: { parts: [{ text: 'Hi' }] }
          }],
          modelVersion: 'gemini-2.5-pro'
        },
        {
          candidates: [{
            content: { parts: [{ text: ' there!' }] },
            finishReason: 'STOP'
          }],
          modelVersion: 'gemini-2.5-pro'
        }
      ];

      // Create async generator
      mockModels.generateContentStream.mockResolvedValue(
        (async function* () {
          for (const response of mockResponses) {
            yield response;
          }
        })()
      );

      const chunks: any[] = [];
      for await (const chunk of provider.chatStream(request)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({
        id: 'gemini-2.5-pro',
        choices: [{
          delta: { content: 'Hi', role: 'assistant' },
          index: 0,
          finishReason: undefined
        }],
        model: 'gemini-2.5-pro',
        created: expect.any(Number)
      });
      expect(chunks[1].choices[0].delta.content).toBe(' there!');
      expect(chunks[1].choices[0].finishReason).toBe('STOP');
    });

    it('should handle streaming errors', async () => {
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      mockModels.generateContentStream.mockRejectedValue(new Error('Stream error'));

      const generator = provider.chatStream(request);
      await expect(generator.next()).rejects.toThrow('Gemini API streaming error: Stream error');
    });
  });

  describe('healthCheck', () => {
    it('should return true when API is accessible', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      await provider.initialize();

      mockModels.countTokens.mockResolvedValue({
        totalTokens: 1
      });

      const healthy = await provider.healthCheck();

      expect(healthy).toBe(true);
      expect(mockModels.countTokens).toHaveBeenCalledWith({
        contents: expect.any(Array),
        model: 'gemini-2.5-pro'
      });
    });

    it('should return false when not initialized', async () => {
      const healthy = await provider.healthCheck();
      expect(healthy).toBe(false);
    });

    it('should return false on API error', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      await provider.initialize();

      mockModels.countTokens.mockRejectedValue(new Error('API error'));

      const healthy = await provider.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe('getName', () => {
    it('should return Gemini API name', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      await provider.initialize();

      expect(provider.getName()).toBe('Google Gemini API');
    });

    it('should return Vertex AI name when using Vertex', async () => {
      process.env.GOOGLE_API_KEY = 'vertex-key';
      process.env.GOOGLE_CLOUD_PROJECT = 'project';
      process.env.GOOGLE_CLOUD_LOCATION = 'location';
      
      await provider.initialize({
        type: 'gemini',
        authType: AuthType.USE_VERTEX_AI
      });

      expect(provider.getName()).toBe('Google Vertex AI');
    });
  });

  describe('dispose', () => {
    it('should clean up resources', async () => {
      process.env.GEMINI_API_KEY = 'test-key';
      await provider.initialize();

      await provider.dispose();

      // Try to use after dispose - should fail
      await expect(provider.chat({
        messages: [{ role: 'user', content: 'Hello' }]
      })).rejects.toThrow('Provider not initialized');
    });
  });
});