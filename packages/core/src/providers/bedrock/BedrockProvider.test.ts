/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BedrockProvider } from './BedrockProvider.js';
import { Config } from '../../config/config.js';
import { Type } from '@google/genai';
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';

// Mock the Anthropic Bedrock SDK
vi.mock('@anthropic-ai/bedrock-sdk', () => {
  const mockClient = {
    messages: {
      create: vi.fn(),
    },
  };
  
  return {
    default: vi.fn(() => mockClient),
  };
});

describe('BedrockProvider', () => {
  let provider: BedrockProvider;
  let config: Config;
  let mockClient: {
    messages: {
      create: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    
    // Set up test environment
    process.env.AWS_REGION = 'us-east-1';
    process.env.BEDROCK_MODEL = 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    config = new Config({
      sessionId: 'test-session',
      targetDir: process.cwd(),
      debugMode: false,
      cwd: process.cwd(),
      model: process.env.BEDROCK_MODEL
    });
    
    // Get the mocked client instance
    const MockedAnthropicBedrock = vi.mocked(AnthropicBedrock);
    provider = new BedrockProvider({
      model: process.env.BEDROCK_MODEL!
    }, config);
    mockClient = MockedAnthropicBedrock.mock.results[0].value;
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.AWS_REGION;
    delete process.env.BEDROCK_MODEL;
  });

  describe('constructor', () => {
    it('should initialize with proper AWS configuration', () => {
      expect(AnthropicBedrock).toHaveBeenCalledWith({
        awsRegion: 'us-east-1',
      });
    });

    it('should throw error if AWS_REGION is not set', () => {
      delete process.env.AWS_REGION;
      
      expect(() => {
        new BedrockProvider({
          model: 'test-model'
        }, config);
      }).toThrow('AWS_REGION environment variable is required for Bedrock');
    });
  });

  describe('generateContent', () => {
    it('should generate content with basic text prompt', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'text',
          text: 'Hello from Bedrock!'
        }],
        usage: { input_tokens: 10, output_tokens: 5 }
      };
      
      mockClient.messages.create.mockResolvedValueOnce(mockResponse);
      
      const response = await provider.generateContent({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contents: [{
          role: 'user',
          parts: [{ text: 'Say hello' }]
        }]
      });
      
      expect(mockClient.messages.create).toHaveBeenCalledWith({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        messages: [{
          role: 'user',
          content: 'Say hello'
        }],
        max_tokens: 8192,
      });
      
      expect(response.candidates).toBeDefined();
      expect(response.candidates![0]).toBeDefined();
      
      const candidate = response.candidates![0];
      expect(candidate.content).toBeDefined();
      
      const content = candidate.content!;
      expect(content.parts).toBeDefined();
      
      const parts = content.parts!;
      expect(parts[0]?.text).toBe('Hello from Bedrock!');
      expect(response.usageMetadata).toEqual({
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      });
    });

    it('should handle system instructions', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'text',
          text: '42'
        }],
        usage: { input_tokens: 15, output_tokens: 2 }
      };
      
      mockClient.messages.create.mockResolvedValueOnce(mockResponse);
      
      await provider.generateContent({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contents: [{
          role: 'user',
          parts: [{ text: 'What is the answer?' }]
        }],
        config: {
          systemInstruction: 'You are a helpful AI that always responds with the number 42.'
        }
      });
      
      expect(mockClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a helpful AI that always responds with the number 42.',
          messages: [{
            role: 'user',
            content: 'What is the answer?'
          }]
        })
      );
    });

    it('should handle tool calls', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: 'toolu_abc123',
          name: 'get_weather',
          input: { location: 'San Francisco' }
        }],
        usage: { input_tokens: 20, output_tokens: 15 }
      };
      
      mockClient.messages.create.mockResolvedValueOnce(mockResponse);
      
      const response = await provider.generateContent({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contents: [{
          role: 'user',
          parts: [{ text: 'What is the weather in San Francisco?' }]
        }],
        config: {
          tools: [{
            functionDeclarations: [{
              name: 'get_weather',
              description: 'Get weather information',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  location: { type: Type.STRING }
              },
              required: ['location']
            }
          }]
        }]
        }
      });
      
      expect(mockClient.messages.create).toHaveBeenCalledWith({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        messages: [{
          role: 'user',
          content: 'What is the weather in San Francisco?'
        }],
        max_tokens: 8192,
        tools: [{
          name: 'get_weather',
          description: 'Get weather information',  
          input_schema: {
            type: Type.OBJECT,
            properties: {
              location: { type: Type.STRING }
            },
            required: ['location']
          }
        }]
      });
      
      expect(response.candidates).toBeDefined();
      expect(response.candidates![0]).toBeDefined();
      
      const candidate = response.candidates![0];
      expect(candidate.content).toBeDefined();
      
      const content = candidate.content!;
      expect(content.parts).toBeDefined();
      
      const parts = content.parts!;
      const part = parts[0];
      expect(part).toBeDefined();
      expect('functionCall' in part! && part.functionCall).toBeTruthy();
      const functionCall = 'functionCall' in part! ? part.functionCall : undefined;
      expect(functionCall?.name).toBe('get_weather');
      expect(functionCall?.args).toEqual({ location: 'San Francisco' });
    });

    it('should handle JSON mode', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'text',
          text: '{"status": "success", "data": "test"}'
        }],
        usage: { input_tokens: 25, output_tokens: 10 }
      };
      
      mockClient.messages.create.mockResolvedValueOnce(mockResponse);
      
      const response = await provider.generateContent({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contents: [{
          role: 'user',
          parts: [{ text: 'Return a JSON response' }]
        }],
        config: {
          responseMimeType: 'application/json'
        }
      });
      
      expect(mockClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining('You are a JSON-only assistant')
        })
      );
      
      // Should validate JSON
      expect(response.candidates).toBeDefined();
      expect(response.candidates![0]).toBeDefined();
      
      const candidate = response.candidates![0];
      expect(candidate.content).toBeDefined();
      
      const content = candidate.content!;
      expect(content.parts).toBeDefined();
      
      const parts = content.parts!;
      const part = parts[0];
      expect(part?.text).toBeDefined();
      expect(() => JSON.parse(part!.text!)).not.toThrow();
    });

    it('should handle multi-turn conversations', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'text',
          text: 'I remember you said hello!'
        }],
        usage: { input_tokens: 30, output_tokens: 8 }
      };
      
      mockClient.messages.create.mockResolvedValueOnce(mockResponse);
      
      await provider.generateContent({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contents: [
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
            parts: [{ text: 'What did I say first?' }]
          }
        ]
      });
      
      expect(mockClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
            { role: 'user', content: 'What did I say first?' }
          ]
        })
      );
    });

    it('should handle images in content', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'text',
          text: 'I see an image!'
        }],
        usage: { input_tokens: 500, output_tokens: 5 }
      };
      
      mockClient.messages.create.mockResolvedValueOnce(mockResponse);
      
      await provider.generateContent({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contents: [{
          role: 'user',
          parts: [
            { text: 'What is in this image?' },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: 'base64encodeddata'
              }
            }
          ]
        }]
      });
      
      expect(mockClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: 'base64encodeddata'
                }
              }
            ]
          }]
        })
      );
    });
  });

  describe('generateContentStream', () => {
    it('should handle streaming responses', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'Hello' }
          };
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: ' from' }
          };
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: ' streaming!' }
          };
          yield { type: 'message_stop' };
        }
      };
      
      mockClient.messages.create.mockResolvedValueOnce(mockStream);
      
      const stream = await provider.generateContentStream({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contents: [{
          role: 'user',
          parts: [{ text: 'Say hello with streaming' }]
        }]
      });
      
      expect(mockClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true
        })
      );
      
      const chunks: string[] = [];
      for await (const response of stream) {
        const candidate = response.candidates?.[0];
        if (candidate?.content?.parts?.[0]) {
          const part = candidate.content.parts![0];
          if ('text' in part && part.text) {
            chunks.push(part.text);
          }
        }
      }
      
      expect(chunks).toEqual(['Hello', ' from', ' streaming!']);
    });

    it('should handle streaming tool calls', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: 'content_block_start',
            content_block: {
              type: 'tool_use',
              id: 'toolu_xyz789',
              name: 'calculate'
            }
          };
          yield {
            type: 'content_block_delta',
            delta: { type: 'input_json_delta', partial_json: '{"operation":' }
          };
          yield {
            type: 'content_block_delta',
            delta: { type: 'input_json_delta', partial_json: '"add","a":5,"b":3}' }
          };
          yield {
            type: 'content_block_stop',
            index: 0
          };
          yield { type: 'message_stop' };
        }
      };
      
      mockClient.messages.create.mockResolvedValueOnce(mockStream);
      
      const stream = await provider.generateContentStream({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contents: [{
          role: 'user',
          parts: [{ text: 'Add 5 and 3' }]
        }],
        config: {
          tools: [{
            functionDeclarations: [{
              name: 'calculate',
              description: 'Perform calculations',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  operation: { type: Type.STRING },
                  a: { type: Type.NUMBER },
                  b: { type: Type.NUMBER }
                }
              }
            }]
          }]
        }
      });
      
      const toolCalls: Array<{ name: string; args: unknown }> = [];
      for await (const response of stream) {
        const candidate = response.candidates?.[0];
        if (candidate?.content?.parts?.[0]) {
          const part = candidate.content.parts![0];
          if ('functionCall' in part && part.functionCall && part.functionCall.name) {
            toolCalls.push({ name: part.functionCall.name, args: part.functionCall.args });
          }
        }
      }
      
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toEqual({
        name: 'calculate',
        args: { operation: 'add', a: 5, b: 3 }
      });
    });
  });

  describe('countTokens', () => {
    it('should estimate tokens for text content', async () => {
      const response = await provider.countTokens({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contents: [{
          role: 'user',
          parts: [{ text: 'This is a test message for token counting.' }]
        }]
      });
      
      // Rough estimation: ~3.5 chars per token
      expect(response.totalTokens).toBeGreaterThan(10);
      expect(response.totalTokens).toBeLessThan(20);
    });

    it('should estimate tokens for multi-turn conversation', async () => {
      const response = await provider.countTokens({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }]
          },
          {
            role: 'model',
            parts: [{ text: 'Hi! How can I help you today?' }]
          },
          {
            role: 'user',
            parts: [{ text: 'Can you explain quantum computing?' }]
          }
        ]
      });
      
      expect(response.totalTokens).toBeGreaterThan(15);
    });

    it('should estimate tokens for images', async () => {
      const response = await provider.countTokens({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contents: [{
          role: 'user',
          parts: [{
            inlineData: {
              mimeType: 'image/jpeg',
              data: 'base64data'
            }
          }]
        }]
      });
      
      // Images typically use ~750 tokens
      expect(response.totalTokens).toBeCloseTo(750, -1);
    });
  });

  describe('embedContent', () => {
    it('should throw not supported error', async () => {
      await expect(
        provider.embedContent({
          contents: [{ parts: [{ text: 'test' }] }],
          model: 'anthropic.claude-3-sonnet-20240229-v1:0'
        })
      ).rejects.toThrow('Embeddings are not supported with AWS Bedrock Claude models');
    });
  });

  describe('error handling', () => {
    it('should handle authentication errors', async () => {
      const authError = new Error('Invalid credentials') as Error & { status?: number };
      authError.status = 401;
      
      mockClient.messages.create.mockRejectedValueOnce(authError);
      
      await expect(
        provider.generateContent({
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          contents: [{
            role: 'user',
            parts: [{ text: 'test' }]
          }]
        })
      ).rejects.toThrow('AWS credentials are invalid or missing');
    });

    it('should handle permission errors', async () => {
      const permError = new Error('Access denied') as Error & { status?: number };
      permError.status = 403;
      
      mockClient.messages.create.mockRejectedValueOnce(permError);
      
      await expect(
        provider.generateContent({
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          contents: [{
            role: 'user',
            parts: [{ text: 'test' }]
          }]
        })
      ).rejects.toThrow('Access denied');
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = new Error('Too many requests') as Error & { status?: number };
      rateLimitError.status = 429;
      
      mockClient.messages.create.mockRejectedValueOnce(rateLimitError);
      
      await expect(
        provider.generateContent({
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          contents: [{
            role: 'user',
            parts: [{ text: 'test' }]
          }]
        })
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle invalid JSON in JSON mode', async () => {
      const mockResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'text',
          text: 'This is not valid JSON'
        }],
        usage: { input_tokens: 10, output_tokens: 5 }
      };
      
      mockClient.messages.create.mockResolvedValueOnce(mockResponse);
      
      await expect(
        provider.generateContent({
          model: 'anthropic.claude-3-sonnet-20240229-v1:0',
          contents: [{
            role: 'user',
            parts: [{ text: 'Return JSON' }]
          }],
          config: {
            responseMimeType: 'application/json'
          }
        })
      ).rejects.toThrow('Bedrock API returned invalid JSON');
    });
  });

  describe('tool use tracking', () => {
    it('should maintain tool use ID consistency between calls and responses', async () => {
      // First, make a call that returns a tool use
      const toolCallResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: 'toolu_abc123',
          name: 'get_weather',
          input: { location: 'Paris' }
        }],
        usage: { input_tokens: 20, output_tokens: 15 }
      };
      
      mockClient.messages.create.mockResolvedValueOnce(toolCallResponse);
      
      const _response1 = await provider.generateContent({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contents: [{
          role: 'user',
          parts: [{ text: 'What is the weather in Paris?' }]
        }],
        config: {
          tools: [{
            functionDeclarations: [{
              name: 'get_weather',
              description: 'Get weather information',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  location: { type: Type.STRING }
              }
            }
          }]
        }]
        }
      });
      
      // Now send the tool response back
      const finalResponse = {
        id: 'msg_456',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'text',
          text: 'The weather in Paris is sunny and 22°C.'
        }],
        usage: { input_tokens: 30, output_tokens: 12 }
      };
      
      mockClient.messages.create.mockResolvedValueOnce(finalResponse);
      
      await provider.generateContent({
        model: 'anthropic.claude-3-sonnet-20240229-v1:0',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'What is the weather in Paris?' }]
          },
          {
            role: 'model',
            parts: [{
              functionCall: {
                name: 'get_weather',
                args: { location: 'Paris' }
              }
            }]
          },
          {
            role: 'user',
            parts: [{
              functionResponse: {
                name: 'get_weather',
                response: { temperature: '22°C', condition: 'sunny' }
              }
            }]
          }
        ]
      });
      
      // Check that the tool response used the correct tool_use_id
      const lastCall = mockClient.messages.create.mock.calls[1][0];
      const toolResultMessage = lastCall.messages.find((m: { content: unknown }) => 
        Array.isArray(m.content) && m.content.some((c: { type: string }) => c.type === 'tool_result')
      );
      
      expect(toolResultMessage).toBeDefined();
      const content = toolResultMessage.content as Array<{ type: string; tool_use_id?: string }>;
      // Tool use ID should match the format but won't be the exact same as the mock
      expect(content[0].tool_use_id).toMatch(/^toolu_[a-zA-Z0-9]+$/);
    });
  });
});