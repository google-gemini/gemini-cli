/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BedrockMessageConverter, ToolUseTracker } from './BedrockMessageConverter.js';
import { Content, Part } from '@google/genai';
import { BedrockMessage } from './BedrockTypes.js';

describe('BedrockMessageConverter', () => {
  let converter: BedrockMessageConverter;

  beforeEach(() => {
    converter = new BedrockMessageConverter();
  });

  describe('convertToBedrockMessages', () => {
    it('should convert simple text message from user', () => {
      const contents: Content[] = [{
        role: 'user',
        parts: [{ text: 'Hello, how are you?' }]
      }];

      const result = converter.convertToBedrockMessages(contents);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'user',
        content: 'Hello, how are you?'
      });
    });

    it('should convert simple text message from model', () => {
      const contents: Content[] = [{
        role: 'model',
        parts: [{ text: 'I am doing well, thank you!' }]
      }];

      const result = converter.convertToBedrockMessages(contents);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'assistant',
        content: 'I am doing well, thank you!'
      });
    });

    it('should convert multi-part message to content blocks', () => {
      const contents: Content[] = [{
        role: 'user',
        parts: [
          { text: 'Here is an image:' },
          { text: 'What do you see?' }
        ]
      }];

      const result = converter.convertToBedrockMessages(contents);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'user',
        content: [
          { type: 'text', text: 'Here is an image:' },
          { type: 'text', text: 'What do you see?' }
        ]
      });
    });

    it('should convert inline image data', () => {
      const contents: Content[] = [{
        role: 'user',
        parts: [{
          inlineData: {
            mimeType: 'image/jpeg',
            data: 'base64encodeddata'
          }
        }]
      }];

      const result = converter.convertToBedrockMessages(contents);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'user',
        content: [{
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: 'base64encodeddata'
          }
        }]
      });
    });

    it('should handle function calls with tool use ID tracking', () => {
      const contents: Content[] = [{
        role: 'model',
        parts: [{
          functionCall: {
            name: 'get_weather',
            args: { location: 'San Francisco' }
          }
        }]
      }];

      const result = converter.convertToBedrockMessages(contents);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('assistant');
      expect(Array.isArray(result[0].content)).toBe(true);
      
      const content = result[0].content as Array<{ type: string; name?: string; input?: unknown; id?: string }>;
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe('tool_use');
      expect(content[0].name).toBe('get_weather');
      expect(content[0].input).toEqual({ location: 'San Francisco' });
      expect(content[0].id).toMatch(/^toolu_[a-zA-Z0-9]+$/);
    });

    it('should use tracked tool use ID for function responses', () => {
      // First, simulate a function call to establish the ID
      const callContents: Content[] = [{
        role: 'model',
        parts: [{
          functionCall: {
            name: 'get_weather',
            args: { location: 'Paris' }
          }
        }]
      }];

      converter.convertToBedrockMessages(callContents);

      // Now convert the function response
      const responseContents: Content[] = [{
        role: 'user',
        parts: [{
          functionResponse: {
            name: 'get_weather',
            response: { temperature: '22°C', condition: 'sunny' }
          }
        }]
      }];

      const result = converter.convertToBedrockMessages(responseContents);

      expect(result).toHaveLength(1);
      const content = result[0].content as Array<{ type: string; tool_use_id?: string; content?: string }>;
      expect(content[0].type).toBe('tool_result');
      expect(content[0].tool_use_id).toMatch(/^toolu_[a-zA-Z0-9]+$/);
      expect(content[0].content).toBe(JSON.stringify({ temperature: '22°C', condition: 'sunny' }));
    });

    it('should handle multi-turn conversation', () => {
      const contents: Content[] = [
        {
          role: 'user',
          parts: [{ text: 'Hello' }]
        },
        {
          role: 'model',
          parts: [{ text: 'Hi there!' }]
        },
        {
          role: 'user',
          parts: [{ text: 'How are you?' }]
        }
      ];

      const result = converter.convertToBedrockMessages(contents);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
      expect(result[2]).toEqual({ role: 'user', content: 'How are you?' });
    });

    it('should handle empty parts array', () => {
      const contents: Content[] = [{
        role: 'user',
        parts: []
      }];

      const result = converter.convertToBedrockMessages(contents);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        role: 'user',
        content: []
      });
    });

    it('should skip unsupported roles', () => {
      const contents: Content[] = [
        {
          role: 'user',
          parts: [{ text: 'Hello' }]
        },
        {
          role: 'system' as 'user' | 'model', // Using type assertion to test unsupported role
          parts: [{ text: 'System message' }]
        },
        {
          role: 'model',
          parts: [{ text: 'Hi!' }]
        }
      ];

      const result = converter.convertToBedrockMessages(contents);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(result[1]).toEqual({ role: 'assistant', content: 'Hi!' });
    });
  });

  describe('convertFromBedrockResponse', () => {
    it('should convert text response', () => {
      const message: BedrockMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'text',
          text: 'Hello from Bedrock!'
        }]
      } as BedrockMessage;

      const result = converter.convertFromBedrockResponse(message);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ text: 'Hello from Bedrock!' });
    });

    it('should convert tool use response', () => {
      const message: BedrockMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: 'toolu_abc123',
          name: 'calculate',
          input: { operation: 'add', a: 5, b: 3 }
        }]
      } as BedrockMessage;

      const result = converter.convertFromBedrockResponse(message);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        functionCall: {
          name: 'calculate',
          args: { operation: 'add', a: 5, b: 3 }
        }
      });
    });

    it('should handle multiple content blocks', () => {
      const message: BedrockMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Let me calculate that for you.'
          },
          {
            type: 'tool_use',
            id: 'toolu_xyz789',
            name: 'calculate',
            input: { operation: 'multiply', a: 10, b: 5 }
          },
          {
            type: 'text',
            text: 'The result is 50.'
          }
        ]
      } as BedrockMessage;

      const result = converter.convertFromBedrockResponse(message);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ text: 'Let me calculate that for you.' });
      expect(result[1]).toEqual({
        functionCall: {
          name: 'calculate',
          args: { operation: 'multiply', a: 10, b: 5 }
        }
      });
      expect(result[2]).toEqual({ text: 'The result is 50.' });
    });

    it('should handle non-array content', () => {
      const message: BedrockMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [],  // Content should be an array, not a string
        model: 'test-model',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { 
          input_tokens: 0, 
          output_tokens: 0,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          server_tool_use: null,
          service_tier: null
        }
      } as BedrockMessage;

      const result = converter.convertFromBedrockResponse(message);

      expect(result).toHaveLength(0);
    });

    it('should validate JSON in JSON mode', () => {
      const validJsonMessage: BedrockMessage = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'text',
          text: '{"status": "success", "data": 123}'
        }]
      } as BedrockMessage;

      const result = converter.convertFromBedrockResponse(validJsonMessage, true);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ text: '{"status": "success", "data": 123}' });

      const invalidJsonMessage: BedrockMessage = {
        id: 'msg_456',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'text',
          text: 'This is not JSON'
        }]
      } as BedrockMessage;

      expect(() => {
        converter.convertFromBedrockResponse(invalidJsonMessage, true);
      }).toThrow('Bedrock API returned invalid JSON');
    });
  });

  describe('extractSystemInstruction', () => {
    it('should extract string instruction', () => {
      const result = BedrockMessageConverter.extractSystemInstruction('You are a helpful assistant.');
      expect(result).toBe('You are a helpful assistant.');
    });

    it('should extract text from Content object', () => {
      const content: Content = {
        role: 'system',
        parts: [
          { text: 'You are an AI assistant.' },
          { text: 'Be helpful and accurate.' }
        ]
      };

      const result = BedrockMessageConverter.extractSystemInstruction(content);
      expect(result).toBe('You are an AI assistant.\nBe helpful and accurate.');
    });

    it('should handle empty parts', () => {
      const content: Content = {
        role: 'system',
        parts: []
      };

      const result = BedrockMessageConverter.extractSystemInstruction(content);
      expect(result).toBe('');
    });

    it('should skip non-text parts', () => {
      const content: Content = {
        role: 'system',
        parts: [
          { text: 'Instructions:' },
          { inlineData: { mimeType: 'image/png', data: 'data' } } as Part,
          { text: 'Be helpful.' }
        ]
      };

      const result = BedrockMessageConverter.extractSystemInstruction(content);
      expect(result).toBe('Instructions:\n\nBe helpful.');
    });
  });

  describe('clearToolUseTracker', () => {
    it('should clear tool use mappings', () => {
      // Create a function call to establish tracking
      const contents: Content[] = [{
        role: 'model',
        parts: [{
          functionCall: {
            name: 'test_tool',
            args: {}
          }
        }]
      }];

      converter.convertToBedrockMessages(contents);

      // Clear the tracker
      converter.clearToolUseTracker();

      // Try to use a function response - should get a new ID
      const responseContents: Content[] = [{
        role: 'user',
        parts: [{
          functionResponse: {
            name: 'test_tool',
            response: {}
          }
        }]
      }];

      const result = converter.convertToBedrockMessages(responseContents);
      const content = result[0].content as Array<{ tool_use_id: string }>;
      
      // Should have a fallback ID since the tracker was cleared
      expect(content[0].tool_use_id).toBe('unknown_test_tool');
    });
  });
});

describe('ToolUseTracker', () => {
  let tracker: ToolUseTracker;

  beforeEach(() => {
    tracker = new ToolUseTracker();
  });

  it('should store and retrieve tool use IDs', () => {
    tracker.setToolUseId('get_weather', 'toolu_123');
    expect(tracker.getToolUseId('get_weather')).toBe('toolu_123');
  });

  it('should return undefined for unknown tools', () => {
    expect(tracker.getToolUseId('unknown_tool')).toBeUndefined();
  });

  it('should overwrite existing IDs', () => {
    tracker.setToolUseId('calculate', 'toolu_abc');
    tracker.setToolUseId('calculate', 'toolu_xyz');
    expect(tracker.getToolUseId('calculate')).toBe('toolu_xyz');
  });

  it('should clear all mappings', () => {
    tracker.setToolUseId('tool1', 'id1');
    tracker.setToolUseId('tool2', 'id2');
    
    tracker.clear();
    
    expect(tracker.getToolUseId('tool1')).toBeUndefined();
    expect(tracker.getToolUseId('tool2')).toBeUndefined();
  });
});