/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BedrockStreamHandler } from './BedrockStreamHandler.js';
import { Config } from '../../config/config.js';
import { Stream } from '@anthropic-ai/sdk/streaming';
import type { 
  MessageStreamEvent,
  RawContentBlockDeltaEvent,
  RawContentBlockStartEvent,
  RawContentBlockStopEvent,
  RawMessageStartEvent,
  RawMessageDeltaEvent,
  RawMessageStopEvent,
  ToolUseBlock,
  TextDelta,
  InputJSONDelta,
  Message
} from '@anthropic-ai/sdk/resources/messages';

// Define a minimal interface for what BedrockStreamHandler needs from Config
interface MinimalConfig {
  getDebugMode(): boolean;
}

describe('BedrockStreamHandler', () => {
  let handler: BedrockStreamHandler;
  let mockConfig: MinimalConfig;

  beforeEach(() => {
    mockConfig = {
      getDebugMode: vi.fn().mockReturnValue(false)
    };
    
    handler = new BedrockStreamHandler(mockConfig as Config);
  });

  describe('handleStream', () => {
    it('should handle text delta events', async () => {
      const events: MessageStreamEvent[] = [
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Hello' } as TextDelta
        } as RawContentBlockDeltaEvent,
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: ' world' } as TextDelta
        } as RawContentBlockDeltaEvent,
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: '!' } as TextDelta
        } as RawContentBlockDeltaEvent,
        { type: 'message_stop' } as RawMessageStopEvent
      ];

      const mockStream = createMockStream(events);

      const chunks: string[] = [];
      for await (const response of handler.handleStream(mockStream)) {
        const candidate = response.candidates?.[0];
        if (candidate?.content?.parts?.[0]) {
          const part = candidate.content.parts![0];
          if ('text' in part && part.text) {
            chunks.push(part.text);
          }
        }
      }

      expect(chunks).toEqual(['Hello', ' world', '!']);
    });

    it('should handle tool use events', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'toolu_123',
        name: 'get_weather',
        input: {}
      };

      const events: MessageStreamEvent[] = [
        {
          type: 'content_block_start',
          index: 0,
          content_block: toolUseBlock
        } as RawContentBlockStartEvent,
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"location":' } as InputJSONDelta
        } as RawContentBlockDeltaEvent,
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '"San Francisco"}' } as InputJSONDelta
        } as RawContentBlockDeltaEvent,
        {
          type: 'content_block_stop',
          index: 0
        } as RawContentBlockStopEvent,
        { type: 'message_stop' } as RawMessageStopEvent
      ];

      const mockStream = createMockStream(events);

      const toolCalls: unknown[] = [];
      for await (const response of handler.handleStream(mockStream)) {
        const candidate = response.candidates?.[0];
        if (candidate?.content?.parts?.[0]) {
          const part = candidate.content.parts![0];
          if ('functionCall' in part && part.functionCall) {
            toolCalls.push(part.functionCall);
          }
        }
      }

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toEqual({
        name: 'get_weather',
        args: { location: 'San Francisco' }
      });
    });

    it('should handle mixed text and tool use', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'toolu_456',
        name: 'get_weather',
        input: {}
      };

      const events: MessageStreamEvent[] = [
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Let me check the weather.' } as TextDelta
        } as RawContentBlockDeltaEvent,
        {
          type: 'content_block_start',
          index: 1,
          content_block: toolUseBlock
        } as RawContentBlockStartEvent,
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"location":"Paris"}' } as InputJSONDelta
        } as RawContentBlockDeltaEvent,
        {
          type: 'content_block_stop',
          index: 1
        } as RawContentBlockStopEvent,
        {
          type: 'content_block_delta',
          index: 2,
          delta: { type: 'text_delta', text: ' The weather in Paris is sunny.' } as TextDelta
        } as RawContentBlockDeltaEvent,
        { type: 'message_stop' } as RawMessageStopEvent
      ];

      const mockStream = createMockStream(events);

      const parts: Array<{ type: string; content: unknown }> = [];
      for await (const response of handler.handleStream(mockStream)) {
        const candidate = response.candidates?.[0];
        if (candidate?.content?.parts?.[0]) {
          const part = candidate.content.parts![0];
          if ('text' in part && part.text) {
            parts.push({ type: 'text', content: part.text });
          } else if ('functionCall' in part && part.functionCall) {
            parts.push({ type: 'function', content: part.functionCall });
          }
        }
      }

      expect(parts).toHaveLength(3);
      expect(parts[0]).toEqual({ type: 'text', content: 'Let me check the weather.' });
      expect(parts[1]).toEqual({ 
        type: 'function', 
        content: { name: 'get_weather', args: { location: 'Paris' } }
      });
      expect(parts[2]).toEqual({ type: 'text', content: ' The weather in Paris is sunny.' });
    });

    it('should handle malformed JSON in tool input', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'toolu_789',
        name: 'bad_tool',
        input: {}
      };

      const events: MessageStreamEvent[] = [
        {
          type: 'content_block_start',
          index: 0,
          content_block: toolUseBlock
        } as RawContentBlockStartEvent,
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"invalid": json' } as InputJSONDelta
        } as RawContentBlockDeltaEvent,
        {
          type: 'content_block_stop',
          index: 0
        } as RawContentBlockStopEvent,
        { type: 'message_stop' } as RawMessageStopEvent
      ];

      const mockStream = createMockStream(events);

      const toolCalls: unknown[] = [];
      for await (const response of handler.handleStream(mockStream)) {
        const candidate = response.candidates?.[0];
        if (candidate?.content?.parts?.[0]) {
          const part = candidate.content.parts![0];
          if ('functionCall' in part && part.functionCall) {
            toolCalls.push(part.functionCall);
          }
        }
      }

      expect(toolCalls).toHaveLength(1);
      expect((toolCalls[0] as { args: unknown }).args).toEqual({}); // Falls back to empty object
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[BedrockStreamHandler] Failed to parse tool input:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle message_start and message_delta events', async () => {
      const mockMessage: Message = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'test-model',
        stop_reason: null,
        stop_sequence: null,
        usage: { 
          input_tokens: 0, 
          output_tokens: 0,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          server_tool_use: null,
          service_tier: null
        }
      };

      const events: MessageStreamEvent[] = [
        { 
          type: 'message_start',
          message: mockMessage
        } as RawMessageStartEvent,
        { 
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 10 }
        } as RawMessageDeltaEvent,
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Response' } as TextDelta
        } as RawContentBlockDeltaEvent,
        { type: 'message_stop' } as RawMessageStopEvent
      ];

      const mockStream = createMockStream(events);

      const chunks: string[] = [];
      for await (const response of handler.handleStream(mockStream)) {
        const candidate = response.candidates?.[0];
        if (candidate?.content?.parts?.[0]) {
          const part = candidate.content.parts![0];
          if ('text' in part && part.text) {
            chunks.push(part.text);
          }
        }
      }

      expect(chunks).toEqual(['Response']);
    });

    it('should handle empty tool input', async () => {
      const toolUseBlock: ToolUseBlock = {
        type: 'tool_use',
        id: 'toolu_empty',
        name: 'empty_tool',
        input: {}
      };

      const events: MessageStreamEvent[] = [
        {
          type: 'content_block_start',
          index: 0,
          content_block: toolUseBlock
        } as RawContentBlockStartEvent,
        {
          type: 'content_block_stop',
          index: 0
        } as RawContentBlockStopEvent,
        { type: 'message_stop' } as RawMessageStopEvent
      ];

      const mockStream = createMockStream(events);

      const toolCalls: unknown[] = [];
      for await (const response of handler.handleStream(mockStream)) {
        const candidate = response.candidates?.[0];
        if (candidate?.content?.parts?.[0]) {
          const part = candidate.content.parts![0];
          if ('functionCall' in part && part.functionCall) {
            toolCalls.push(part.functionCall);
          }
        }
      }

      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toEqual({
        name: 'empty_tool',
        args: {}
      });
    });

    it('should handle stream errors', async () => {
      const errorStream = {
        async *[Symbol.asyncIterator]() {
          const event: RawContentBlockDeltaEvent = {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'Start' } as TextDelta
          };
          yield event;
          throw new Error('Stream error');
        }
      } as unknown as Stream<MessageStreamEvent>;

      await expect(async () => {
        const responses = [];
        for await (const response of handler.handleStream(errorStream)) {
          responses.push(response);
        }
      }).rejects.toThrow('Stream error');
    });

    it('should enable debug logging when debug mode is on', async () => {
      const debugConfig: MinimalConfig = {
        getDebugMode: vi.fn().mockReturnValue(true)
      };
      
      const debugHandler = new BedrockStreamHandler(debugConfig as Config);
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      const events: MessageStreamEvent[] = [
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Debug test' } as TextDelta
        } as RawContentBlockDeltaEvent,
        { type: 'message_stop' } as RawMessageStopEvent
      ];

      const mockStream = createMockStream(events);

      const chunks: string[] = [];
      for await (const response of debugHandler.handleStream(mockStream)) {
        const candidate = response.candidates?.[0];
        if (candidate?.content?.parts?.[0]) {
          const part = candidate.content.parts![0];
          if ('text' in part && part.text) {
            chunks.push(part.text);
          }
        }
      }

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[BedrockStreamHandler] Stream event:',
        expect.any(String)
      );
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[BedrockStreamHandler] Stream completed'
      );

      consoleDebugSpy.mockRestore();
    });
  });

  describe('createUsageMetadata', () => {
    it('should create usage metadata with both token counts', () => {
      const metadata = BedrockStreamHandler.createUsageMetadata(100, 50);
      
      expect(metadata).toEqual({
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        totalTokenCount: 150
      });
    });

    it('should handle undefined input tokens', () => {
      const metadata = BedrockStreamHandler.createUsageMetadata(undefined, 50);
      
      expect(metadata).toEqual({
        promptTokenCount: 0,
        candidatesTokenCount: 50,
        totalTokenCount: 50
      });
    });

    it('should handle undefined output tokens', () => {
      const metadata = BedrockStreamHandler.createUsageMetadata(100, undefined);
      
      expect(metadata).toEqual({
        promptTokenCount: 100,
        candidatesTokenCount: 0,
        totalTokenCount: 100
      });
    });

    it('should handle both undefined', () => {
      const metadata = BedrockStreamHandler.createUsageMetadata(undefined, undefined);
      
      expect(metadata).toEqual({
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0
      });
    });
  });
});

// Helper function to create mock streams
function createMockStream(events: MessageStreamEvent[]): Stream<MessageStreamEvent> {
  // Create a mock stream that implements the minimal Stream interface
  const stream = {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
    // Add required Stream properties/methods as needed
    controller: {} as AbortController,
    tee: () => [stream, stream] as [Stream<MessageStreamEvent>, Stream<MessageStreamEvent>],
    toReadableStream: () => new ReadableStream(),
  } as unknown as Stream<MessageStreamEvent>;
  
  return stream;
}