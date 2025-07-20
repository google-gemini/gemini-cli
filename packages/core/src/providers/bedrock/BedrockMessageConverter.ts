/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, Part } from '@google/genai';
import {
  BedrockMessageParam,
  BedrockContentBlockParam,
  BedrockMessage,
  BedrockTextBlockParam,
  BedrockToolResultBlock,
} from './BedrockTypes.js';
import { BedrockToolConverter } from './BedrockToolConverter.js';

/**
 * Tracks tool use IDs for proper request/response matching
 */
export class ToolUseTracker {
  private toolUseMap: Map<string, string> = new Map();

  /**
   * Store a mapping from tool name to tool use ID
   */
  setToolUseId(toolName: string, toolUseId: string): void {
    this.toolUseMap.set(toolName, toolUseId);
  }

  /**
   * Get the tool use ID for a given tool name
   */
  getToolUseId(toolName: string): string | undefined {
    return this.toolUseMap.get(toolName);
  }

  /**
   * Clear all mappings
   */
  clear(): void {
    this.toolUseMap.clear();
  }
}

/**
 * Converts between Gemini and Bedrock message formats
 */
export class BedrockMessageConverter {
  private toolUseTracker = new ToolUseTracker();

  /**
   * Convert Gemini contents to Bedrock messages
   */
  convertToBedrockMessages(contents: Content[]): BedrockMessageParam[] {
    const messages: BedrockMessageParam[] = [];
    
    for (const content of contents) {
      if (content.role === 'user' || content.role === 'model') {
        const bedrockContent = this.convertPartsToBedrockContent(content.parts || []);
        messages.push({
          role: content.role === 'user' ? 'user' : 'assistant',
          content: bedrockContent,
        });
      }
    }
    
    return messages;
  }

  /**
   * Convert Gemini parts to Bedrock content blocks
   */
  private convertPartsToBedrockContent(parts: Part[]): string | BedrockContentBlockParam[] {
    // If single text part, return as string for simpler format
    if (parts.length === 1 && 'text' in parts[0] && parts[0].text) {
      return parts[0].text;
    }
    
    const blocks: BedrockContentBlockParam[] = [];
    
    for (const part of parts) {
      if ('text' in part && part.text) {
        blocks.push({ 
          type: 'text', 
          text: part.text 
        } as BedrockTextBlockParam);
      } else if ('inlineData' in part && part.inlineData) {
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: (part.inlineData.mimeType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: part.inlineData.data || '',
          },
        });
      } else if ('functionCall' in part && part.functionCall) {
        const toolUseId = BedrockToolConverter.generateToolUseId();
        // Store the mapping for later use in function responses
        if (part.functionCall.name) {
          this.toolUseTracker.setToolUseId(part.functionCall.name, toolUseId);
        }
        
        blocks.push({
          type: 'tool_use',
          id: toolUseId,
          name: part.functionCall.name || '',
          input: part.functionCall.args || {},
        });
      } else if ('functionResponse' in part && part.functionResponse) {
        // Use the stored tool use ID from the original function call
        const toolUseId = part.functionResponse.name ? 
          this.toolUseTracker.getToolUseId(part.functionResponse.name) : 
          undefined;
        if (!toolUseId && part.functionResponse.name) {
          console.warn(`No tool use ID found for function response: ${part.functionResponse.name}`);
        }
        
        blocks.push({
          type: 'tool_result',
          tool_use_id: toolUseId || `unknown_${part.functionResponse.name}`,
          content: JSON.stringify(part.functionResponse.response),
        } as BedrockToolResultBlock);
      }
    }
    
    return blocks;
  }

  /**
   * Convert Bedrock response to Gemini format
   */
  convertFromBedrockResponse(message: BedrockMessage, isJsonMode = false): Part[] {
    const parts: Part[] = [];
    
    if (!Array.isArray(message.content)) {
      return parts;
    }
    
    for (const block of message.content) {
      if (block.type === 'text' && 'text' in block && block.text) {
        const text = block.text;
        
        // For JSON mode, validate the response
        if (isJsonMode) {
          try {
            JSON.parse(text);
          } catch (error) {
            console.error('Bedrock returned invalid JSON in JSON mode:', text);
            throw new Error(`Bedrock API returned invalid JSON: ${error}`);
          }
        }
        
        parts.push({ text });
      } else if (block.type === 'tool_use' && 'name' in block && 'input' in block) {
        // Store the tool use ID for potential responses
        if ('id' in block && block.id) {
          this.toolUseTracker.setToolUseId(block.name, block.id);
        }
        
        parts.push({
          functionCall: {
            name: block.name,
            args: (block.input || {}) as Record<string, unknown>,
          },
        });
      }
    }
    
    return parts;
  }

  /**
   * Extract system instruction from Content or string
   */
  static extractSystemInstruction(instruction: Content | string): string {
    if (typeof instruction === 'string') {
      return instruction;
    }
    
    const parts = instruction.parts || [];
    return parts.map(part => 'text' in part ? part.text || '' : '').join('\n');
  }

  /**
   * Clear tool use tracker (useful between conversations)
   */
  clearToolUseTracker(): void {
    this.toolUseTracker.clear();
  }
}