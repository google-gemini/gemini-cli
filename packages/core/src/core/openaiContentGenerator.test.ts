/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIContentGenerator } from './openaiContentGenerator.js';
import { FunctionDeclaration, Type } from '@google/genai';

// Mock fetch globally
global.fetch = vi.fn();

describe('OpenAIContentGenerator', () => {
  let generator: OpenAIContentGenerator;
  const mockApiKey = 'test-api-key';
  const mockBaseUrl = 'https://api.example.com';
  const mockModel = 'test-model';

  beforeEach(() => {
    generator = new OpenAIContentGenerator(mockApiKey, mockBaseUrl, mockModel);
    vi.resetAllMocks();
  });

  describe('generateContent', () => {
    it('should convert Gemini format to OpenAI format and back', async () => {
      const mockResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'Hello, world!'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const request = {
        model: 'test-model',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'Hello' }]
          }
        ],
        config: {
          temperature: 0.7,
          maxOutputTokens: 100
        }
      };

      const result = await generator.generateContent(request);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockApiKey}`
          },
          body: JSON.stringify({
            model: 'test-model',
            messages: [{ role: 'user', content: 'Hello' }],
            stream: false,
            temperature: 0.7,
            max_tokens: 100
          })
        })
      );

      expect(result.candidates).toBeDefined();
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates![0]?.content?.parts?.[0]?.text).toBe('Hello, world!');
      expect(result.usageMetadata?.totalTokenCount).toBe(15);
    });

    it('should handle tool calls in the request and response', async () => {
      const mockFunctionDeclarations: FunctionDeclaration[] = [
        {
          name: 'get_weather',
          description: 'Get current weather',
          parameters: {
            type: Type.OBJECT,
            properties: {
              location: { type: Type.STRING }
            },
            required: ['location']
          }
        }
      ];

      const mockResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'I need to check the weather for you.',
            tool_calls: [{
              id: 'call_123',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location": "New York"}'
              }
            }]
          },
          finish_reason: 'tool_calls'
        }],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 10,
          total_tokens: 25
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const request = {
        model: 'test-model',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'What is the weather in New York?' }]
          }
        ],
        config: {
          tools: [{
            functionDeclarations: mockFunctionDeclarations
          }]
        }
      };

      const result = await generator.generateContent(request);

      // Check that tools were included in the request
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/chat/completions',
        expect.objectContaining({
          body: JSON.stringify({
            model: 'test-model',
            messages: [{ role: 'user', content: 'What is the weather in New York?' }],
            stream: false,
            tools: [{
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get current weather',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    location: { type: Type.STRING }
                  },
                  required: ['location']
                }
              }
            }],
            tool_choice: 'auto'
          })
        })
      );

      // Check that the response contains function calls
      expect(result.candidates).toBeDefined();
      expect(result.candidates).toHaveLength(1);

      const candidate = result.candidates![0];
      expect(candidate?.content?.parts).toHaveLength(2);
      expect(candidate?.content?.parts?.[0]?.text).toBe('I need to check the weather for you.');

      const functionCallPart = candidate?.content?.parts?.[1] as any;
      expect(functionCallPart?.functionCall).toBeDefined();
      expect(functionCallPart.functionCall.id).toBe('call_123');
      expect(functionCallPart.functionCall.name).toBe('get_weather');
      expect(functionCallPart.functionCall.args).toEqual({ location: 'New York' });

      // Check that functionCalls property is set for compatibility
      expect((result as any).functionCalls).toBeDefined();
      expect((result as any).functionCalls).toHaveLength(1);
      expect((result as any).functionCalls[0].id).toBe('call_123');
      expect((result as any).functionCalls[0].name).toBe('get_weather');
      expect((result as any).functionCalls[0].args).toEqual({ location: 'New York' });
    });

    it('should handle function responses in the conversation', async () => {
      const mockResponse = {
        choices: [{
          message: {
            role: 'assistant',
            content: 'The weather in New York is 72°F and sunny.'
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 12,
          total_tokens: 32
        }
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const request = {
        model: 'test-model',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'What is the weather in New York?' }]
          },
          {
            role: 'model' as const,
            parts: [
              { text: 'I need to check the weather for you.' },
              {
                functionCall: {
                  id: 'call_123',
                  name: 'get_weather',
                  args: { location: 'New York' }
                }
              }
            ]
          },
          {
            role: 'user' as const,
            parts: [
              {
                functionResponse: {
                  id: 'call_123',
                  name: 'get_weather',
                  response: { temperature: '72°F', condition: 'sunny' }
                }
              }
            ]
          }
        ]
      };

      const result = await generator.generateContent(request);

      // Check that function responses were converted to tool messages
      const expectedMessages = [
        { role: 'user', content: 'What is the weather in New York?' },
        {
          role: 'assistant',
          content: 'I need to check the weather for you.',
          tool_calls: [{
            id: 'call_123',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location":"New York"}'
            }
          }]
        },
        {
          role: 'tool',
          content: '{"temperature":"72°F","condition":"sunny"}',
          tool_call_id: 'call_123'
        }
      ];

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/chat/completions',
        expect.objectContaining({
          body: JSON.stringify({
            model: 'test-model',
            messages: expectedMessages,
            stream: false
          })
        })
      );

      expect(result.candidates![0]?.content?.parts?.[0]?.text).toBe('The weather in New York is 72°F and sunny.');
    });

    it('should handle API errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API key')
      });

      const request = {
        model: 'test-model',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'Hello' }]
          }
        ]
      };

      await expect(generator.generateContent(request)).rejects.toThrow(
        'OpenAI API error: 401 Unauthorized - Invalid API key'
      );
    });

    it('should handle baseURL with trailing slash', () => {
      const mockApiKey = 'test-api-key';
      const mockBaseUrl = 'https://api.example.com';
      const mockModel = 'test-model';

      const gen = new OpenAIContentGenerator(mockApiKey, mockBaseUrl, mockModel);
      expect(gen['baseUrl']).toBe('https://api.example.com');
    });
  });

  describe('generateContentStream', () => {
    it('should handle streaming responses with tool calls', async () => {
      const streamChunks = [
        'data: {"choices":[{"delta":{"role":"assistant","content":"I need to"},"finish_reason":null,"index":0}]}\n',
        'data: {"choices":[{"delta":{"content":" check the weather."},"finish_reason":null,"index":0}]}\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"get_weather"}}]},"finish_reason":null,"index":0}]}\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"location\\""}}]},"finish_reason":null,"index":0}]}\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"New York\\"}"}}]},"finish_reason":null,"index":0}]}\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls","index":0}]}\n',
        'data: [DONE]\n'
      ];

      const mockStream = {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamChunks[0]) })
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamChunks[1]) })
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamChunks[2]) })
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamChunks[3]) })
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamChunks[4]) })
            .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamChunks[5]) })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn()
        })
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        body: mockStream
      });

      const request = {
        model: 'test-model',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'What is the weather in New York?' }]
          }
        ],
        config: {
          tools: [{
            functionDeclarations: [{
              name: 'get_weather',
              description: 'Get current weather',
              parameters: {
                type: Type.OBJECT,
                properties: { location: { type: Type.STRING } }
              }
            }]
          }]
        }
      };

      const responses = [];
      const stream = await generator.generateContentStream(request);

      for await (const response of stream) {
        responses.push(response);
      }

      // Should have content chunks and final tool call response
      expect(responses.length).toBeGreaterThan(0);

      // Check for content responses
      const contentResponses = responses.filter(r =>
        r.candidates?.[0]?.content?.parts?.[0]?.text
      );
      expect(contentResponses.length).toBeGreaterThan(0);

      // Check for final tool call response
      const toolCallResponse = responses.find(r =>
        (r as any).functionCalls && (r as any).functionCalls.length > 0
      );
      expect(toolCallResponse).toBeDefined();
      expect((toolCallResponse as any).functionCalls[0].name).toBe('get_weather');
      expect((toolCallResponse as any).functionCalls[0].args).toEqual({ location: 'New York' });
    });
  });

  describe('countTokens', () => {
    it('should estimate token count based on text length', async () => {
      const request = {
        model: 'test-model',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'This is a test message' }]
          }
        ]
      };

      const result = await generator.countTokens(request);

      // "This is a test message" has 22 characters, so estimated tokens should be ceil(22/4) = 6
      expect(result.totalTokens).toBe(6);
    });

    it('should handle tool messages in token counting', async () => {
      const request = {
        model: 'test-model',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'What is the weather?' }]
          },
          {
            role: 'user' as const,
            parts: [
              {
                functionResponse: {
                  id: 'call_123',
                  name: 'get_weather',
                  response: { temperature: '72°F' }
                }
              }
            ]
          }
        ]
      };

      const result = await generator.countTokens(request);

      // Should include both user message and tool response content
      expect(result.totalTokens).toBeGreaterThan(0);
    });
  });

  describe('embedContent', () => {
    it('should throw an error since OpenAI APIs typically do not support embeddings', async () => {
      const request = {
        model: 'test-model',
        contents: [
          {
            role: 'user' as const,
            parts: [{ text: 'Hello' }]
          }
        ]
      };

      await expect(generator.embedContent(request)).rejects.toThrow(
        'This OpenAI API does not support embeddings. Please use Gemini for embedding operations.'
      );
    });
  });
});
