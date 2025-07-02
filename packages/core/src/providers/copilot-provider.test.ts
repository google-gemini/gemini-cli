// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import WebSocket from 'ws';
import { CopilotProvider } from './copilot-provider.js';
import type { ChatRequest } from './types.js';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios, true);

// Mock WebSocket
vi.mock('ws');
const MockedWebSocket = vi.mocked(WebSocket, true);

describe('CopilotProvider', () => {
  let provider: CopilotProvider;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup axios mock
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      defaults: { baseURL: '' }
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    mockedAxios.isAxiosError = axios.isAxiosError;

    provider = new CopilotProvider();
  });

  afterEach(async () => {
    if (provider) {
      await provider.dispose();
    }
  });

  describe('initialize', () => {
    it('should initialize successfully when bridge is healthy', async () => {
      // Mock health check
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url === '/health') {
          return Promise.resolve({ 
            data: { status: 'ok', copilot: 'available' } 
          });
        }
        if (url === '/models') {
          return Promise.resolve({ 
            data: { 
              models: [{
                id: 'gpt-4',
                name: 'GPT-4',
                vendor: 'copilot',
                family: 'gpt'
              }]
            }
          });
        }
      });

      await provider.initialize();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health', { timeout: 5000 });
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/models');
    });

    it('should throw error when bridge is not available', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Connection refused'));

      await expect(provider.initialize()).rejects.toThrow(
        'VSCode bridge is not available'
      );
    });

    it('should throw error when no models are available', async () => {
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url === '/health') {
          return Promise.resolve({ 
            data: { status: 'ok', copilot: 'available' } 
          });
        }
        if (url === '/models') {
          return Promise.resolve({ data: { models: [] } });
        }
      });

      await expect(provider.initialize()).rejects.toThrow(
        'No Copilot models available'
      );
    });

    it('should use custom bridge URL from config', async () => {
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url === '/health') {
          return Promise.resolve({ 
            data: { status: 'ok', copilot: 'available' } 
          });
        }
        if (url === '/models') {
          return Promise.resolve({ 
            data: { models: [{ id: 'gpt-4', name: 'GPT-4', vendor: 'copilot', family: 'gpt' }] }
          });
        }
      });

      await provider.initialize({ 
        type: 'copilot',
        bridgeUrl: 'http://localhost:8080' 
      });

      expect(mockAxiosInstance.defaults.baseURL).toBe('http://localhost:8080');
    });
  });

  describe('listModels', () => {
    it('should return models from bridge', async () => {
      const expectedModels = [
        { id: 'gpt-4', name: 'GPT-4', vendor: 'copilot', family: 'gpt' },
        { id: 'gpt-3.5', name: 'GPT-3.5', vendor: 'copilot', family: 'gpt' }
      ];

      mockAxiosInstance.get.mockResolvedValue({ 
        data: { models: expectedModels } 
      });

      const models = await provider.listModels();

      expect(models).toEqual(expectedModels);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/models');
    });

    it('should throw error when connection refused', async () => {
      const error: any = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      mockAxiosInstance.get.mockRejectedValue(error);

      await expect(provider.listModels()).rejects.toThrow(
        'Cannot connect to VSCode bridge'
      );
    });
  });

  describe('chat', () => {
    beforeEach(async () => {
      // Initialize provider first
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url === '/health') {
          return Promise.resolve({ 
            data: { status: 'ok', copilot: 'available' } 
          });
        }
        if (url === '/models') {
          return Promise.resolve({ 
            data: { models: [{ id: 'gpt-4', name: 'GPT-4', vendor: 'copilot', family: 'gpt' }] }
          });
        }
      });
      await provider.initialize();
    });

    it('should send chat request and return response', async () => {
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4'
      };

      const expectedResponse = {
        choices: [{
          message: { content: 'Hi there!', role: 'assistant' },
          index: 0
        }],
        model: 'gpt-4'
      };

      mockAxiosInstance.post.mockResolvedValue({ 
        data: expectedResponse 
      });

      const response = await provider.chat(request);

      expect(response).toEqual(expectedResponse);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/chat', {
        ...request,
        stream: false
      });
    });

    it('should throw error when not initialized', async () => {
      const uninitializedProvider = new CopilotProvider();
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      await expect(uninitializedProvider.chat(request)).rejects.toThrow(
        'Provider not initialized'
      );
    });

    it('should handle connection errors', async () => {
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      const error: any = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      mockAxiosInstance.post.mockRejectedValue(error);

      await expect(provider.chat(request)).rejects.toThrow(
        'Lost connection to VSCode bridge'
      );
    });
  });

  describe('chatStream', () => {
    let mockWs: any;

    beforeEach(async () => {
      // Initialize provider first
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url === '/health') {
          return Promise.resolve({ 
            data: { status: 'ok', copilot: 'available' } 
          });
        }
        if (url === '/models') {
          return Promise.resolve({ 
            data: { models: [{ id: 'gpt-4', name: 'GPT-4', vendor: 'copilot', family: 'gpt' }] }
          });
        }
      });
      await provider.initialize();

      // Setup WebSocket mock
      mockWs = {
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
        readyState: WebSocket.OPEN
      };

      MockedWebSocket.mockImplementation(() => mockWs as any);
    });

    it('should stream chat responses via WebSocket', async () => {
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      // Simulate WebSocket behavior
      mockWs.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'open') {
          // Immediately call open handler
          setTimeout(() => handler(), 0);
        }
        if (event === 'message') {
          // Simulate receiving chunks
          setTimeout(() => {
            handler(JSON.stringify({
              type: 'chat_chunk',
              data: {
                choices: [{
                  delta: { content: 'Hello' },
                  index: 0
                }],
                model: 'gpt-4'
              }
            }));
            handler(JSON.stringify({
              type: 'chat_chunk',
              data: {
                choices: [{
                  delta: { content: ' world!' },
                  index: 0
                }],
                model: 'gpt-4'
              }
            }));
            handler(JSON.stringify({ type: 'chat_done' }));
          }, 10);
        }
      });

      const chunks: any[] = [];
      for await (const chunk of provider.chatStream(request)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0].choices[0].delta.content).toBe('Hello');
      expect(chunks[1].choices[0].delta.content).toBe(' world!');
      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'chat',
        data: { ...request, stream: true }
      }));
    });

    it('should handle WebSocket errors', async () => {
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }]
      };

      mockWs.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'error') {
          setTimeout(() => handler(new Error('WebSocket error')), 0);
        }
      });

      const generator = provider.chatStream(request);
      await expect(generator.next()).rejects.toThrow('WebSocket error');
    });
  });

  describe('healthCheck', () => {
    it('should return true when bridge is healthy', async () => {
      mockAxiosInstance.get.mockResolvedValue({ 
        data: { status: 'ok', copilot: 'available' } 
      });

      const healthy = await provider.healthCheck();

      expect(healthy).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health', { timeout: 5000 });
    });

    it('should return false when bridge is unhealthy', async () => {
      mockAxiosInstance.get.mockResolvedValue({ 
        data: { status: 'ok', copilot: 'unavailable' } 
      });

      const healthy = await provider.healthCheck();

      expect(healthy).toBe(false);
    });

    it('should return false on error', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      const healthy = await provider.healthCheck();

      expect(healthy).toBe(false);
    });
  });

  describe('getName', () => {
    it('should return provider name', () => {
      expect(provider.getName()).toBe('GitHub Copilot (via VSCode)');
    });
  });

  describe('dispose', () => {
    it('should clean up resources', async () => {
      // Initialize first
      mockAxiosInstance.get.mockImplementation((url: string) => {
        if (url === '/health') {
          return Promise.resolve({ 
            data: { status: 'ok', copilot: 'available' } 
          });
        }
        if (url === '/models') {
          return Promise.resolve({ 
            data: { models: [{ id: 'gpt-4', name: 'GPT-4', vendor: 'copilot', family: 'gpt' }] }
          });
        }
      });
      await provider.initialize();

      // Dispose
      await provider.dispose();

      // Try to chat - should fail
      const request: ChatRequest = {
        messages: [{ role: 'user', content: 'Hello' }]
      };
      await expect(provider.chat(request)).rejects.toThrow(
        'Provider not initialized'
      );
    });
  });
});