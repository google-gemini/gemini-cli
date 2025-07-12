import {
  ContentGenerator,
  ContentGeneratorConfig,
} from '../core/contentGenerator.js';
import {
  GenerateContentResponse,
  CountTokensResponse,
  EmbedContentResponse,
  Content,
  Part,
  FinishReason,
  FunctionCall,
  FunctionDeclaration,
  FunctionResponse,
} from '@google/genai';
import { GrokClient, GrokMessage, GrokTool, GrokToolCall } from './grokClient.js';

interface GenerateContentRequest {
  contents: Content[];
  generationConfig?: {
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
  };
  config?: {
    tools?: Array<{ functionDeclarations: FunctionDeclaration[] }>;
  };
}

interface CountTokensRequest {
  contents: Content[];
}

interface EmbedContentRequest {
  content: Content;
  model?: string;
}

export class GrokContentGenerator implements ContentGenerator {
  private grokClient: GrokClient;
  private model: string;

  constructor(config: ContentGeneratorConfig) {
    this.grokClient = new GrokClient({ grokApiKey: config.apiKey });
    this.model = config.model;
  }

  private convertToGrokMessages(contents: Content[]): GrokMessage[] {
    const messages: GrokMessage[] = [];
    
    for (const content of contents) {
      let role: 'system' | 'user' | 'assistant' | 'tool' = content.role === 'model' ? 'assistant' : content.role as 'system' | 'user' | 'assistant' | 'tool';
      
      if (content.parts) {
        // Handle text parts
        const textParts = content.parts.filter((part: any): part is Part & { text: string } => 'text' in part);
        
        if (textParts.length > 0) {
          const combinedText = textParts.map(part => part.text).join('\n');
          messages.push({
            role,
            content: combinedText,
          });
        }
        
        // Handle function responses
        const functionResponses = content.parts.filter((part: any): part is FunctionResponse => 'functionResponse' in part);
        for (const fnResp of functionResponses) {
          // Convert function response to tool message
          if (fnResp.functionResponse) {
            messages.push({
              role: 'tool' as const,
              content: JSON.stringify(fnResp.functionResponse.response),
              tool_call_id: fnResp.functionResponse.id,
            });
          }
        }
      }
    }
    
    return messages;
  }

  private convertGeminiSchemaToJsonSchema(schema: any): any {
    if (!schema) return {};
    
    // Map Gemini types to JSON Schema types
    const typeMapping: Record<string, string> = {
      'STRING': 'string',
      'NUMBER': 'number', 
      'INTEGER': 'integer',
      'BOOLEAN': 'boolean',
      'ARRAY': 'array',
      'OBJECT': 'object',
      // Also handle numeric enum values that might be used
      '1': 'string',
      '2': 'number',
      '3': 'integer', 
      '4': 'boolean',
      '5': 'array',
      '6': 'object',
    };
    
    const schemaType = String(schema.type);
    const jsonType = typeMapping[schemaType];
    
    if (!jsonType) {
      // If we can't map the type, return the schema as-is
      return schema;
    }
    
    const result: any = {
      type: jsonType,
    };
    
    if (schema.description) {
      result.description = schema.description;
    }
    
    // Handle array items
    if (jsonType === 'array' && schema.items) {
      result.items = this.convertGeminiSchemaToJsonSchema(schema.items);
    }
    
    // Handle object properties
    if (jsonType === 'object') {
      if (schema.properties) {
        result.properties = {};
        for (const [key, value] of Object.entries(schema.properties)) {
          result.properties[key] = this.convertGeminiSchemaToJsonSchema(value);
        }
      }
      
      if (schema.required) {
        result.required = schema.required;
      }
    }
    
    return result;
  }

  private convertToGrokTools(functionDeclarations?: FunctionDeclaration[]): GrokTool[] | undefined {
    if (!functionDeclarations || functionDeclarations.length === 0) {
      return undefined;
    }
    
    return functionDeclarations
      .filter(decl => decl.name) // Skip declarations without names
      .map(decl => ({
          type: 'function' as const,
          function: {
            name: decl.name!,
            description: decl.description,
            parameters: this.convertGeminiSchemaToJsonSchema(decl.parameters),
          },
        }));
  }

  async generateContent(
    request: any,
  ): Promise<GenerateContentResponse> {
    const messages = this.convertToGrokMessages(request.contents);
    
    // Extract tools from the request
    const tools = request.config?.tools?.[0]?.functionDeclarations
      ? this.convertToGrokTools(request.config.tools[0].functionDeclarations)
      : undefined;
    
    
    const grokResponse = await this.grokClient.createChatCompletion({
      model: this.model,
      messages,
      max_tokens: request.generationConfig?.maxOutputTokens,
      temperature: request.generationConfig?.temperature,
      top_p: request.generationConfig?.topP,
      stream: false,
      tools,
    });

    // Convert Grok response to Gemini response format
    const choice = grokResponse.choices[0];
    const parts: Part[] = [];
    const functionCalls: FunctionCall[] = [];
    
    // Handle text content
    if (choice.message.content) {
      parts.push({ text: choice.message.content });
    }
    
    // Handle tool calls
    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        functionCalls.push({
          id: toolCall.id,
          name: toolCall.function.name,
          args: JSON.parse(toolCall.function.arguments),
        });
      }
    }
    
    const response = {
      candidates: [{
        content: {
          role: 'model',
          parts,
        },
        finishReason: choice.finish_reason as FinishReason,
        index: 0,
        safetyRatings: [],
      }],
      usageMetadata: {
        promptTokenCount: grokResponse.usage.prompt_tokens,
        candidatesTokenCount: grokResponse.usage.completion_tokens,
        totalTokenCount: grokResponse.usage.total_tokens,
      },
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
    } as unknown as GenerateContentResponse;

    return response;
  }

  async generateContentStream(
    request: any,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const messages = this.convertToGrokMessages(request.contents);
    
    // Extract tools from the request
    const tools = request.config?.tools?.[0]?.functionDeclarations
      ? this.convertToGrokTools(request.config.tools[0].functionDeclarations)
      : undefined;
    
    const self = this;
    
    async function* generator(): AsyncGenerator<GenerateContentResponse> {
      const stream = self.grokClient.createChatCompletionStream({
        model: self.model,
        messages,
        max_tokens: request.generationConfig?.maxOutputTokens,
        temperature: request.generationConfig?.temperature,
        top_p: request.generationConfig?.topP,
        tools,
      });

      let accumulatedText = '';
      let promptTokens = 0;
      let accumulatedToolCalls: Map<number, GrokToolCall> = new Map();

      for await (const chunk of stream) {
        const delta = chunk.choices[0].delta;
        const parts: Part[] = [];
        const functionCalls: FunctionCall[] = [];
        
        // Handle text content
        if (delta.content) {
          accumulatedText += delta.content;
          parts.push({ text: delta.content });
        }
        
        // Handle tool calls
        if (delta.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;
            
            // Initialize or update the tool call
            if (!accumulatedToolCalls.has(index)) {
              accumulatedToolCalls.set(index, {
                id: toolCallDelta.id || '',
                type: 'function',
                function: {
                  name: toolCallDelta.function?.name || '',
                  arguments: toolCallDelta.function?.arguments || '',
                },
              });
            } else {
              const existing = accumulatedToolCalls.get(index)!;
              if (toolCallDelta.id) existing.id = toolCallDelta.id;
              if (toolCallDelta.function?.name) existing.function.name = toolCallDelta.function.name;
              if (toolCallDelta.function?.arguments) existing.function.arguments += toolCallDelta.function.arguments;
            }
          }
          
          // Convert accumulated tool calls to function calls
          for (const toolCall of accumulatedToolCalls.values()) {
            if (toolCall.function.arguments) {
              try {
                functionCalls.push({
                  id: toolCall.id,
                  name: toolCall.function.name,
                  args: JSON.parse(toolCall.function.arguments),
                });
              } catch (e) {
                // Arguments not yet complete, skip for now
              }
            }
          }
        }
        
        const response = {
          candidates: [{
            content: {
              role: 'model',
              parts: parts.length > 0 ? parts : [],
            },
            finishReason: chunk.choices[0].finish_reason as FinishReason | undefined,
            index: 0,
            safetyRatings: [],
          }],
          // Usage metadata is typically only available in the final chunk
          usageMetadata: chunk.choices[0].finish_reason ? {
            promptTokenCount: promptTokens,
            candidatesTokenCount: accumulatedText.length / 4, // Rough estimate
            totalTokenCount: promptTokens + accumulatedText.length / 4,
          } : undefined,
          functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
        } as unknown as GenerateContentResponse;
        
        yield response;
      }
    }
    
    return generator();
  }

  async countTokens(request: any): Promise<CountTokensResponse> {
    // Grok doesn't have a specific token counting endpoint
    // We'll estimate based on the common approximation of 1 token ≈ 4 characters
    let totalChars = 0;
    
    for (const content of request.contents) {
      if (content.parts) {
        const textParts = content.parts.filter((part: any): part is Part & { text: string } => 'text' in part);
        for (const part of textParts) {
          totalChars += part.text.length;
        }
      }
    }
    
    const estimatedTokens = Math.ceil(totalChars / 4);
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(request: any): Promise<EmbedContentResponse> {
    // Grok doesn't support embeddings in the same way as Gemini
    // This would need to be implemented with a different embedding model
    throw new Error('Embeddings are not supported with Grok models. Please use a Gemini embedding model.');
  }
}