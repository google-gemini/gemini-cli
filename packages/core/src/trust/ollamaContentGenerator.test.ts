/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OllamaContentGenerator } from './ollamaContentGenerator.js';
import { OllamaClient } from './ollamaClient.js';
import { OllamaToolRegistry } from './ollamaToolRegistry.js';
import type { Config } from '../config/config.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { GenerateContentParameters } from '@google/genai';

// Mock dependencies
vi.mock('./ollamaClient.js');
vi.mock('./ollamaToolRegistry.js');

const MockOllamaClient = vi.mocked(OllamaClient);
const MockOllamaToolRegistry = vi.mocked(OllamaToolRegistry);

describe('OllamaContentGenerator', () => {
  let generator: OllamaContentGenerator;
  let mockConfig: Config;
  let mockToolRegistry: ToolRegistry;
  let mockOllamaClient: any;
  let mockOllamaToolRegistry: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockConfig = {} as Config;
    mockToolRegistry = {} as ToolRegistry;
    
    mockOllamaClient = {
      checkConnection: vi.fn().mockResolvedValue(true),
      isModelAvailable: vi.fn().mockResolvedValue(true),
      pullModel: vi.fn().mockResolvedValue(true),
      getModel: vi.fn().mockReturnValue('qwen2.5:1.5b'),
      createSystemPrompt: vi.fn().mockReturnValue('System prompt'),
      chatCompletion: vi.fn(),
      getStatus: vi.fn(),
      setModel: vi.fn(),
    };
    
    mockOllamaToolRegistry = {
      getToolDefinitions: vi.fn().mockReturnValue([]),
      executeTool: vi.fn(),
    };
    
    MockOllamaClient.mockImplementation(() => mockOllamaClient);
    MockOllamaToolRegistry.mockImplementation(() => mockOllamaToolRegistry);
    
    generator = new OllamaContentGenerator(mockConfig, mockToolRegistry);
  });

  describe('initialization', () => {
    it('should initialize successfully when Ollama is running', async () => {
      await generator.initialize();

      expect(mockOllamaClient.checkConnection).toHaveBeenCalled();
      expect(mockOllamaClient.isModelAvailable).toHaveBeenCalledWith('qwen2.5:1.5b');
      expect(mockOllamaClient.createSystemPrompt).toHaveBeenCalled();
    });

    it('should throw error when Ollama is not running', async () => {
      mockOllamaClient.checkConnection.mockResolvedValueOnce(false);

      await expect(generator.initialize()).rejects.toThrow(
        'Ollama is not running. Please start Ollama with: ollama serve'
      );
    });

    it('should pull model if not available', async () => {
      mockOllamaClient.isModelAvailable.mockResolvedValueOnce(false);

      await generator.initialize();

      expect(mockOllamaClient.pullModel).toHaveBeenCalledWith(
        'qwen2.5:1.5b',
        expect.any(Function)
      );
    });

    it('should throw error if model pull fails', async () => {
      mockOllamaClient.isModelAvailable.mockResolvedValueOnce(false);
      mockOllamaClient.pullModel.mockResolvedValueOnce(false);

      await expect(generator.initialize()).rejects.toThrow(
        'Failed to pull model qwen2.5:1.5b. Please run: ollama pull qwen2.5:1.5b'
      );
    });
  });

  describe('content generation', () => {
    beforeEach(async () => {
      await generator.initialize();
    });

    it('should generate content without tool calls', async () => {
      const request: GenerateContentParameters = {
        model: 'test',
        contents: [{
          role: 'user',
          parts: [{ text: 'Hello, how are you?' }],
        }],
      };

      mockOllamaClient.chatCompletion.mockResolvedValueOnce({
        content: 'I am doing well, thank you!',
        toolCalls: [],
        finishReason: 'stop',
      });

      const response = await generator.generateContent(request);

      expect(response.text).toBe('I am doing well, thank you!');
      expect(response.functionCalls).toHaveLength(0);
      expect(mockOllamaClient.chatCompletion).toHaveBeenCalledTimes(1);
    });

    it('should handle tool calls in generation', async () => {
      const request: GenerateContentParameters = {
        model: 'test',
        contents: [{
          role: 'user',
          parts: [{ text: 'Read the file test.txt' }],
        }],
      };

      // First response with tool call
      mockOllamaClient.chatCompletion.mockResolvedValueOnce({
        content: '',
        toolCalls: [{
          name: 'read_file',
          args: { path: 'test.txt' },
          id: 'call_123',
        }],
        finishReason: 'tool_calls',
      });

      // Tool execution result
      mockOllamaToolRegistry.executeTool.mockResolvedValueOnce({
        success: true,
        result: 'File contents: Hello World',
      });

      // Second response after tool execution
      mockOllamaClient.chatCompletion.mockResolvedValueOnce({
        content: 'The file test.txt contains: Hello World',
        toolCalls: [],
        finishReason: 'stop',
      });

      const response = await generator.generateContent(request);

      expect(response.text).toBe('The file test.txt contains: Hello World');
      expect(response.functionCalls).toHaveLength(1);
      expect(response.functionCalls![0].name).toBe('read_file');
      expect(mockOllamaClient.chatCompletion).toHaveBeenCalledTimes(2);
      expect(mockOllamaToolRegistry.executeTool).toHaveBeenCalledWith('read_file', { path: 'test.txt' });
    });

    it('should handle tool execution errors', async () => {
      const request: GenerateContentParameters = {
        model: 'test',
        contents: [{
          role: 'user',
          parts: [{ text: 'Read a nonexistent file' }],
        }],
      };

      mockOllamaClient.chatCompletion.mockResolvedValueOnce({
        content: '',
        toolCalls: [{
          name: 'read_file',
          args: { path: 'nonexistent.txt' },
          id: 'call_456',
        }],
        finishReason: 'tool_calls',
      });

      mockOllamaToolRegistry.executeTool.mockResolvedValueOnce({
        success: false,
        error: 'File not found',
      });

      mockOllamaClient.chatCompletion.mockResolvedValueOnce({
        content: 'Sorry, the file could not be found.',
        toolCalls: [],
        finishReason: 'stop',
      });

      const response = await generator.generateContent(request);

      expect(response.text).toBe('Sorry, the file could not be found.');
      expect(mockOllamaToolRegistry.executeTool).toHaveBeenCalled();
    });

    it('should respect max tool calls limit', async () => {
      const customGenerator = new OllamaContentGenerator(mockConfig, mockToolRegistry, {
        maxToolCalls: 2,
      });
      await customGenerator.initialize();

      const request: GenerateContentParameters = {
        model: 'test',
        contents: [{
          role: 'user',
          parts: [{ text: 'Do multiple operations' }],
        }],
      };

      // Mock continuous tool calls
      for (let i = 0; i < 3; i++) {
        mockOllamaClient.chatCompletion.mockResolvedValueOnce({
          content: '',
          toolCalls: [{
            name: `tool_${i}`,
            args: {},
            id: `call_${i}`,
          }],
          finishReason: 'tool_calls',
        });

        mockOllamaToolRegistry.executeTool.mockResolvedValueOnce({
          success: true,
          result: `Result ${i}`,
        });
      }

      const response = await customGenerator.generateContent(request);

      // Should stop after 2 tool calls
      expect(mockOllamaClient.chatCompletion).toHaveBeenCalledTimes(2);
      expect(mockOllamaToolRegistry.executeTool).toHaveBeenCalledTimes(2);
    });

    it('should handle generation errors', async () => {
      const request: GenerateContentParameters = {
        model: 'test',
        contents: [{
          role: 'user',
          parts: [{ text: 'Hello' }],
        }],
      };

      mockOllamaClient.chatCompletion.mockRejectedValueOnce(new Error('API error'));

      const response = await generator.generateContent(request);

      expect(response.text).toContain('Error: API error');
      expect(response.candidates![0].finishReason).toBe('OTHER');
    });
  });

  describe('content generation streaming', () => {
    beforeEach(async () => {
      await generator.initialize();
    });

    it('should generate content stream', async () => {
      const request: GenerateContentParameters = {
        model: 'test',
        contents: [{
          role: 'user',
          parts: [{ text: 'Tell me a story' }],
        }],
      };

      mockOllamaClient.chatCompletion.mockResolvedValueOnce({
        content: 'Once upon a time...',
        toolCalls: [],
        finishReason: 'stop',
      });

      const stream = await generator.generateContentStream(request);
      const chunks = [];
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe('Once upon a time...');
    });
  });

  describe('utility methods', () => {
    beforeEach(async () => {
      await generator.initialize();
    });

    it('should get model info', async () => {
      mockOllamaClient.getStatus.mockResolvedValueOnce({
        connected: true,
        model: 'qwen2.5:1.5b',
        availableModels: ['qwen2.5:1.5b', 'llama3.2:3b'],
        modelLoaded: true,
      });

      const info = await generator.getModelInfo();

      expect(info).toEqual({
        model: 'qwen2.5:1.5b',
        connected: true,
        availableModels: ['qwen2.5:1.5b', 'llama3.2:3b'],
      });
    });

    it('should count tokens', async () => {
      const request = {
        contents: [{
          role: 'user',
          parts: [{ text: 'Hello world' }],
        }],
      };

      const result = await generator.countTokens(request);

      expect(result.totalTokens).toBeGreaterThan(0);
    });

    it('should get conversation history', () => {
      const history = generator.getConversationHistory();
      
      expect(history).toHaveLength(1); // System message
      expect(history[0].role).toBe('system');
    });

    it('should clear conversation history', () => {
      generator.clearConversationHistory();
      const history = generator.getConversationHistory();
      
      expect(history).toHaveLength(1); // System message remains
    });

    it('should throw error for embedding', async () => {
      await expect(generator.embedContent({} as any)).rejects.toThrow(
        'Embedding not supported by Ollama content generator'
      );
    });
  });

  describe('model switching', () => {
    beforeEach(async () => {
      await generator.initialize();
    });

    it('should switch to available model', async () => {
      mockOllamaClient.isModelAvailable.mockResolvedValueOnce(true);

      await generator.switchModel('llama3.2:3b');

      expect(mockOllamaClient.setModel).toHaveBeenCalledWith('llama3.2:3b');
    });

    it('should pull model if not available when switching', async () => {
      mockOllamaClient.isModelAvailable.mockResolvedValueOnce(false);
      mockOllamaClient.pullModel.mockResolvedValueOnce(true);

      await generator.switchModel('llama3.2:3b');

      expect(mockOllamaClient.pullModel).toHaveBeenCalledWith(
        'llama3.2:3b',
        expect.any(Function)
      );
      expect(mockOllamaClient.setModel).toHaveBeenCalledWith('llama3.2:3b');
    });

    it('should throw error if model pull fails when switching', async () => {
      mockOllamaClient.isModelAvailable.mockResolvedValueOnce(false);
      mockOllamaClient.pullModel.mockResolvedValueOnce(false);

      await expect(generator.switchModel('invalid-model')).rejects.toThrow(
        'Failed to pull model invalid-model'
      );
    });
  });
});