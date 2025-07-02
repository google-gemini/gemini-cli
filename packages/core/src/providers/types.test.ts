// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0

import { describe, it, expect } from 'vitest';
import type { 
  Model, 
  ChatMessage, 
  ChatRequest, 
  ChatResponse, 
  ChatResponseChunk,
  IModelProvider 
} from './types.js';

describe('Provider Types', () => {
  describe('Model Interface', () => {
    it('should accept valid model objects', () => {
      const model: Model = {
        id: 'gpt-4',
        name: 'GPT-4',
        vendor: 'copilot',
        family: 'gpt',
        version: '4.0',
        maxInputTokens: 8192,
        maxOutputTokens: 4096,
        maxRequestsPerMinute: 60
      };

      expect(model.id).toBe('gpt-4');
      expect(model.vendor).toBe('copilot');
    });

    it('should accept minimal model objects', () => {
      const model: Model = {
        id: 'gemini-pro',
        name: 'Gemini Pro',
        vendor: 'google',
        family: 'gemini'
      };

      expect(model.version).toBeUndefined();
      expect(model.maxInputTokens).toBeUndefined();
    });
  });

  describe('ChatMessage Interface', () => {
    it('should accept all valid role types', () => {
      const userMessage: ChatMessage = {
        role: 'user',
        content: 'Hello'
      };

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: 'Hi there!'
      };

      const systemMessage: ChatMessage = {
        role: 'system',
        content: 'You are a helpful assistant'
      };

      expect(userMessage.role).toBe('user');
      expect(assistantMessage.role).toBe('assistant');
      expect(systemMessage.role).toBe('system');
    });
  });

  describe('ChatRequest Interface', () => {
    it('should accept minimal chat request', () => {
      const request: ChatRequest = {
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      };

      expect(request.messages).toHaveLength(1);
      expect(request.model).toBeUndefined();
      expect(request.stream).toBeUndefined();
    });

    it('should accept full chat request', () => {
      const request: ChatRequest = {
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' }
        ],
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
        stream: true
      };

      expect(request.messages).toHaveLength(2);
      expect(request.model).toBe('gpt-4');
      expect(request.stream).toBe(true);
    });
  });

  describe('ChatResponse Interface', () => {
    it('should accept valid chat response', () => {
      const response: ChatResponse = {
        id: 'chatcmpl-123',
        choices: [{
          message: {
            content: 'Hello! How can I help you?',
            role: 'assistant'
          },
          index: 0,
          finishReason: 'stop'
        }],
        model: 'gpt-4',
        created: Date.now(),
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };

      expect(response.choices).toHaveLength(1);
      expect(response.choices[0].message.content).toBe('Hello! How can I help you?');
      expect(response.usage?.totalTokens).toBe(30);
    });
  });

  describe('ChatResponseChunk Interface', () => {
    it('should accept valid streaming chunk', () => {
      const chunk: ChatResponseChunk = {
        id: 'chatcmpl-123',
        choices: [{
          delta: {
            content: 'Hello',
            role: 'assistant'
          },
          index: 0
        }],
        model: 'gpt-4',
        created: Date.now()
      };

      expect(chunk.choices[0].delta.content).toBe('Hello');
      expect(chunk.choices[0].finishReason).toBeUndefined();
    });
  });
});