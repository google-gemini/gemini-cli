/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tool, FunctionDeclaration, Type } from '@google/genai';
import { BedrockTool, BedrockToolConfig } from './BedrockTypes.js';

/**
 * Converts Gemini tools to Bedrock tool format
 */
export class BedrockToolConverter {
  /**
   * Convert Gemini tools to Bedrock tools array
   */
  static convertToBedrockTools(tools: Tool[]): BedrockTool[] {
    const bedrockTools: BedrockTool[] = [];
    
    if (!tools || tools.length === 0) {
      return bedrockTools;
    }
    
    for (const tool of tools) {
      if (!tool.functionDeclarations) continue;
      
      for (const funcDecl of tool.functionDeclarations) {
        if (funcDecl && funcDecl.name) {
          const bedrockTool = this.convertFunctionDeclaration(funcDecl);
          bedrockTools.push(bedrockTool);
        }
      }
    }
    
    return bedrockTools;
  }

  /**
   * Convert Gemini tools to Bedrock toolConfig format (for AWS Converse API)
   */
  static convertToBedrockToolConfig(tools: Tool[]): BedrockToolConfig | undefined {
    const bedrockTools = this.convertToBedrockTools(tools);
    
    if (bedrockTools.length === 0) {
      return undefined;
    }
    
    return {
      tools: bedrockTools.map(tool => ({
        toolSpec: tool
      }))
    };
  }

  /**
   * Convert a single function declaration to Bedrock tool format
   */
  private static convertFunctionDeclaration(funcDecl: FunctionDeclaration): BedrockTool {
    const inputSchema = this.normalizeSchema(funcDecl.parameters as Record<string, unknown> | undefined);
    
    return {
      name: funcDecl.name || '',
      description: funcDecl.description || '',
      input_schema: inputSchema,
    };
  }

  /**
   * Normalize and validate the schema for Bedrock
   */
  private static normalizeSchema(parameters?: Record<string, unknown>): { type: 'object'; properties?: unknown; [key: string]: unknown } {
    const schema = parameters || {};
    
    // Ensure the schema has type: "object" as required by Bedrock
    // Convert any non-object type to object
    if (schema.type !== 'object' && schema.type !== Type.OBJECT) {
      // If it's an array type, wrap it in an object
      if (schema.type === 'array' || schema.type === Type.ARRAY) {
        return {
          type: 'object',
          properties: {
            items: schema
          }
        };
      }
      // For any other type, force it to object
      schema.type = 'object';
    }
    
    // Ensure properties exist even if empty
    if (!schema.properties) {
      schema.properties = {};
    }
    
    // Remove unsupported properties
    this.sanitizeSchema(schema);
    
    return schema as { type: 'object'; properties?: unknown; [key: string]: unknown };
  }

  /**
   * Sanitize schema to remove unsupported properties
   */
  private static sanitizeSchema(schema: Record<string, unknown>): void {
    // Remove default values when anyOf is present (Bedrock doesn't support this)
    if (schema.anyOf) {
      delete schema.default;
    }
    
    // Recursively sanitize nested schemas
    if (schema.properties && typeof schema.properties === 'object') {
      for (const prop of Object.values(schema.properties)) {
        if (typeof prop === 'object' && prop !== null) {
          this.sanitizeSchema(prop as Record<string, unknown>);
        }
      }
    }
    
    if (schema.items && typeof schema.items === 'object') {
      this.sanitizeSchema(schema.items as Record<string, unknown>);
    }
    
    // Remove unsupported format values for strings
    if (schema.type === 'string' && schema.format) {
      const supportedFormats = ['enum', 'date-time'];
      if (!supportedFormats.includes(schema.format as string)) {
        delete schema.format;
      }
    }
  }

  /**
   * Generate a unique tool use ID
   */
  static generateToolUseId(): string {
    // Generate ID in the format that Anthropic uses: toolu_[alphanumeric]
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = 'toolu_';
    for (let i = 0; i < 12; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }
}