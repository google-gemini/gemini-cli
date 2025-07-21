/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BedrockProvider } from './BedrockProvider.js';
import { BedrockToolConverter } from './BedrockToolConverter.js';
import { Config } from '../../config/config.js';
import { Tool, Type } from '@google/genai';
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

describe('Bedrock MCP Integration', () => {
  let provider: BedrockProvider;
  let config: Config;

  beforeEach(() => {
    // Set up test environment
    process.env.AWS_REGION = 'us-east-1';
    process.env.BEDROCK_MODEL = 'anthropic.claude-3-sonnet-20240229-v1:0';
    
    config = new Config({
      sessionId: 'test-session',
      targetDir: process.cwd(),
      debugMode: true,
      cwd: process.cwd(),
      model: process.env.BEDROCK_MODEL || 'anthropic.claude-3-sonnet-20240229-v1:0'
    });
    
    provider = new BedrockProvider({
      model: process.env.BEDROCK_MODEL
    }, config);
  });

  describe('MCP Tool Format Conversion', () => {
    it('should convert simple MCP tools to Bedrock format', () => {
      const mcpTool: Tool = {
        functionDeclarations: [{
          name: 'get_weather',
          description: 'Get the current weather for a location',
          parameters: {
            type: Type.OBJECT,
            properties: {
              location: {
                type: Type.STRING,
                description: 'The city and state, e.g. San Francisco, CA'
              },
              unit: {
                type: Type.STRING,
                enum: ['celsius', 'fahrenheit'],
                description: 'Temperature unit'
              }
            },
            required: ['location']
          }
        }]
      };

      const bedrockTools = BedrockToolConverter.convertToBedrockTools([mcpTool]);
      
      expect(bedrockTools).toHaveLength(1);
      expect(bedrockTools[0]).toEqual({
        name: 'get_weather',
        description: 'Get the current weather for a location',
        input_schema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA'
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit'],
              description: 'Temperature unit'
            }
          },
          required: ['location']
        }
      });
    });

    it('should handle complex nested MCP tools', () => {
      const complexTool: Tool = {
        functionDeclarations: [{
          name: 'database_query',
          description: 'Execute a database query',
          parameters: {
            type: Type.OBJECT,
            properties: {
              query: {
                type: Type.STRING,
                description: 'SQL query to execute'
              },
              parameters: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    value: { 
                      anyOf: [
                        { type: Type.STRING },
                        { type: Type.NUMBER },
                        { type: Type.BOOLEAN }
                      ]
                    }
                  }
                }
              },
              options: {
                type: Type.OBJECT,
                properties: {
                  timeout: { type: Type.NUMBER },
                  readonly: { type: Type.BOOLEAN }
                },
                // additionalProperties: false // Not supported in Schema type
              }
            },
            required: ['query']
          }
        }]
      };

      const bedrockTools = BedrockToolConverter.convertToBedrockTools([complexTool]);
      
      expect(bedrockTools).toHaveLength(1);
      const convertedTool = bedrockTools[0];
      
      expect(convertedTool.name).toBe('database_query');
      expect(convertedTool.input_schema.type).toBe('object');
      const properties = convertedTool.input_schema.properties as Record<string, { type?: string }>;
      expect(properties?.parameters?.type).toBe('array');
      // additionalProperties check removed as it's not part of Schema type
    });

    it('should handle MCP tools with missing optional fields', () => {
      const minimalTool: Tool = {
        functionDeclarations: [{
          name: 'simple_tool',
          description: 'A simple tool',
          parameters: {
            type: Type.OBJECT,
            properties: {
              input: { type: Type.STRING }
            }
          }
        }]
      };

      const bedrockTools = BedrockToolConverter.convertToBedrockTools([minimalTool]);
      
      expect(bedrockTools).toHaveLength(1);
      expect(bedrockTools[0].input_schema.required).toBeUndefined();
    });

    it('should handle all valid tool schemas', () => {
      const tools: Tool[] = [
        {
          functionDeclarations: [{
            name: 'valid_tool',
            description: 'Valid tool',
            parameters: {
              type: Type.OBJECT,
              properties: {
                input: { type: Type.STRING }
              }
            }
          }]
        },
        {
          functionDeclarations: [{
            name: 'tool_with_minimal_params',
            description: 'Tool with minimal parameters',
            parameters: {
              type: Type.OBJECT,
              properties: {
                input: { type: Type.STRING }
              }
            }
          }]
        },
        {
          functionDeclarations: [{
            name: 'tool_with_array_params',
            description: 'Tool with array parameters',
            parameters: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }]
        }
      ];

      const bedrockTools = BedrockToolConverter.convertToBedrockTools(tools);
      
      // The converter normalizes all schemas to have type: 'object'
      expect(bedrockTools).toHaveLength(3);
      expect(bedrockTools[0].name).toBe('valid_tool');
      expect(bedrockTools[1].name).toBe('tool_with_minimal_params');
      expect(bedrockTools[2].name).toBe('tool_with_array_params');
      // All should have object type after normalization
      expect(bedrockTools[2].input_schema.type).toBe('object');
    });
  });

  describe('Tool Execution Flow', () => {
    it('should generate unique tool use IDs', () => {
      const id1 = BedrockToolConverter.generateToolUseId();
      const id2 = BedrockToolConverter.generateToolUseId();
      
      expect(id1).toMatch(/^toolu_[a-zA-Z0-9]+$/);
      expect(id2).toMatch(/^toolu_[a-zA-Z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should maintain tool use ID consistency in conversations', async () => {
      // Get the mocked client instance
      const MockedAnthropicBedrock = vi.mocked(AnthropicBedrock);
      const mockClient = MockedAnthropicBedrock.mock.results[0]?.value;
      
      // Set up the mock response
      mockClient.messages.create.mockResolvedValueOnce({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: 'toolu_abc123',
          name: 'get_weather',
          input: { location: 'San Francisco, CA' }
        }],
        usage: { input_tokens: 10, output_tokens: 20 }
      });

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

      expect(response.candidates).toBeDefined();
      expect(response.candidates![0]).toBeDefined();
      expect(response.candidates![0].content).toBeDefined();
      const parts = response.candidates![0].content!.parts;
      expect(parts).toBeDefined();
      expect(parts).toHaveLength(1);
      const functionCall = parts![0]?.functionCall;
      expect(functionCall).toBeDefined();
      expect(functionCall?.name).toBe('get_weather');
    });
  });

  describe('MCP Server Integration Patterns', () => {
    it('should handle filesystem MCP server tool formats', () => {
      const fileSystemTools: Tool[] = [
        {
          functionDeclarations: [{
            name: 'read_file',
            description: 'Read contents of a file',
            parameters: {
              type: Type.OBJECT,
              properties: {
                path: {
                  type: Type.STRING,
                  description: 'Path to the file'
                }
              },
              required: ['path']
            }
          }]
        },
        {
          functionDeclarations: [{
            name: 'write_file',
            description: 'Write contents to a file',
            parameters: {
              type: Type.OBJECT,
              properties: {
                path: {
                  type: Type.STRING,
                  description: 'Path to the file'
                },
                content: {
                  type: Type.STRING,
                  description: 'Content to write'
                }
              },
              required: ['path', 'content']
            }
          }]
        }
      ];

      const bedrockTools = BedrockToolConverter.convertToBedrockTools(fileSystemTools);
      
      expect(bedrockTools).toHaveLength(2);
      expect(bedrockTools.map(t => t.name)).toEqual(['read_file', 'write_file']);
    });

    it('should handle memory MCP server tool formats', () => {
      const memoryTools: Tool[] = [
        {
          functionDeclarations: [{
            name: 'store_memory',
            description: 'Store a memory or note',
            parameters: {
              type: Type.OBJECT,
              properties: {
                key: {
                  type: Type.STRING,
                  description: 'Unique key for the memory'
                },
                content: {
                  type: Type.STRING,
                  description: 'Content to store'
                },
                metadata: {
                  type: Type.OBJECT,
                  properties: {
                    tags: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    },
                    timestamp: {
                      type: Type.STRING,
                      format: 'date-time'
                    }
                  },
                  // additionalProperties: true // Not supported in Schema type
                }
              },
              required: ['key', 'content']
            }
          }]
        }
      ];

      const bedrockTools = BedrockToolConverter.convertToBedrockTools(memoryTools);
      
      expect(bedrockTools).toHaveLength(1);
      const tool = bedrockTools[0];
      const properties = tool.input_schema.properties as Record<string, { type?: string }>;
      expect(properties?.metadata?.type).toBe('object');
      // additionalProperties check removed as it's not part of Schema type
    });
  });
});