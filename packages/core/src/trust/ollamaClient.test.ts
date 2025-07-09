/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OllamaClient } from './ollamaClient.js';
import OpenAI from 'openai';

// Mock dependencies
vi.mock('openai');
const MockOpenAI = vi.mocked(OpenAI);

// Mock fetch
global.fetch = vi.fn();

describe('OllamaClient', () => {
  let client: OllamaClient;
  let mockOpenAIClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockOpenAIClient = {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    };

    MockOpenAI.mockImplementation(() => mockOpenAIClient as any);
    
    client = new OllamaClient();
  });

  describe('initialization', () => {
    it('should initialize with default configuration', () => {
      expect(client.getModel()).toBe('qwen2.5:1.5b');
    });

    it('should initialize with custom configuration', () => {
      const customClient = new OllamaClient({
        model: 'llama3.2:3b',
        baseUrl: 'http://custom:11434',
        timeout: 60000,
      });
      
      expect(customClient.getModel()).toBe('llama3.2:3b');
    });
  });

  describe('connection checking', () => {
    it('should return true when Ollama is running', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
      });

      const isConnected = await client.checkConnection();

      expect(isConnected).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:11434/api/tags');
    });

    it('should return false when Ollama is not running', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Connection refused'));

      const isConnected = await client.checkConnection();

      expect(isConnected).toBe(false);
    });
  });

  describe('model management', () => {
    it('should list available models', async () => {
      const mockModels = {
        models: [
          { name: 'qwen2.5:1.5b' },
          { name: 'llama3.2:3b' },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockModels,
      });

      const models = await client.listModels();

      expect(models).toEqual(['qwen2.5:1.5b', 'llama3.2:3b']);
    });

    it('should check if a model is available', async () => {
      const mockModels = {
        models: [
          { name: 'qwen2.5:1.5b' },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockModels,
      });

      const isAvailable = await client.isModelAvailable('qwen2.5:1.5b');

      expect(isAvailable).toBe(true);
    });

    it('should switch models', () => {
      client.setModel('llama3.2:3b');
      expect(client.getModel()).toBe('llama3.2:3b');
    });
  });

  describe('chat completion', () => {
    it('should generate chat completion with tool calling', async () => {
      const mockCompletion = {
        choices: [{
          message: {
            content: 'Hello!',
            tool_calls: [{
              id: 'call_123',
              type: 'function',
              function: {
                name: 'read_file',
                arguments: '{"path": "test.txt"}',
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      mockOpenAIClient.chat.completions.create.mockResolvedValueOnce(mockCompletion);

      const messages = [
        { role: 'user', content: 'Read test.txt' },
      ];
      const tools = [{
        type: 'function' as const,
        function: {
          name: 'read_file',
          description: 'Read a file',
          parameters: {
            type: 'object' as const,
            properties: {
              path: { type: 'string' },
            },
            required: ['path'],
          },
        },
      }];

      const result = await client.chatCompletion(messages, tools);

      expect(result.content).toBe('Hello!');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        name: 'read_file',
        args: { path: 'test.txt' },
        id: 'call_123',
      });
      expect(result.finishReason).toBe('tool_calls');
    });

    it('should handle completion without tool calls', async () => {
      const mockCompletion = {
        choices: [{
          message: {
            content: 'Hello, how can I help you?',
          },
          finish_reason: 'stop',
        }],
      };

      mockOpenAIClient.chat.completions.create.mockResolvedValueOnce(mockCompletion);

      const messages = [
        { role: 'user', content: 'Hello' },
      ];

      const result = await client.chatCompletion(messages);

      expect(result.content).toBe('Hello, how can I help you?');
      expect(result.toolCalls).toHaveLength(0);
      expect(result.finishReason).toBe('stop');
    });

    it('should handle errors gracefully', async () => {
      mockOpenAIClient.chat.completions.create.mockRejectedValueOnce(
        new Error('API error')
      );

      const messages = [
        { role: 'user', content: 'Hello' },
      ];

      await expect(client.chatCompletion(messages)).rejects.toThrow(
        'Ollama chat completion failed: API error'
      );
    });
  });

  describe('model pulling', () => {
    it('should pull a model with progress updates', async () => {
      const progressUpdates: string[] = [];
      const onProgress = (msg: string) => progressUpdates.push(msg);

      const mockResponse = {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"status": "Downloading..."}\n'));
            controller.enqueue(new TextEncoder().encode('{"status": "Extracting..."}\n'));
            controller.close();
          },
        }),
      };

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      const success = await client.pullModel('qwen2.5:1.5b', onProgress);

      expect(success).toBe(true);
      expect(progressUpdates).toContain('Pulling model qwen2.5:1.5b...');
      expect(progressUpdates).toContain('Downloading...');
      expect(progressUpdates).toContain('Extracting...');
      expect(progressUpdates).toContain('Model qwen2.5:1.5b pulled successfully');
    });

    it('should handle pull failures', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      const success = await client.pullModel('invalid-model');

      expect(success).toBe(false);
    });
  });

  describe('status and system prompt', () => {
    it('should get client status', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({ ok: true }) // checkConnection
        .mockResolvedValueOnce({ // listModels
          ok: true,
          json: async () => ({ models: [{ name: 'qwen2.5:1.5b' }] }),
        })
        .mockResolvedValueOnce({ // listModels again for isModelAvailable
          ok: true,
          json: async () => ({ models: [{ name: 'qwen2.5:1.5b' }] }),
        });

      const status = await client.getStatus();

      expect(status).toEqual({
        connected: true,
        model: 'qwen2.5:1.5b',
        availableModels: ['qwen2.5:1.5b'],
        modelLoaded: true,
      });
    });

    it('should create system prompt with available tools', () => {
      const tools = [{
        type: 'function' as const,
        function: {
          name: 'read_file',
          description: 'Read a file from the filesystem',
          parameters: {
            type: 'object' as const,
            properties: {},
          },
        },
      }];

      const prompt = client.createSystemPrompt(tools);

      expect(prompt).toContain('AVAILABLE TOOLS:');
      expect(prompt).toContain('- read_file: Read a file from the filesystem');
      expect(prompt).toContain('TOOL USAGE RULES:');
      expect(prompt).toContain(process.cwd());
    });
  });
});