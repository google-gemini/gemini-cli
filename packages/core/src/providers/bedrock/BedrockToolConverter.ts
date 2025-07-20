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
   * Convert Type enum values to string representations and fix numeric properties
   */
  private static convertEnumTypesToStrings(obj: unknown): void {
    if (!obj || typeof obj !== 'object' || obj === null) return;
    
    const schema = obj as Record<string, unknown>;
    
    // Convert Type enum at current level
    if (schema.type === Type.OBJECT) schema.type = 'object';
    else if (schema.type === Type.STRING) schema.type = 'string';
    else if (schema.type === Type.NUMBER) schema.type = 'number';
    else if (schema.type === Type.BOOLEAN) schema.type = 'boolean';
    else if (schema.type === Type.ARRAY) schema.type = 'array';
    
    /**
     * Convert string-typed numeric properties to numbers for JSON Schema 2020-12 compliance.
     * AWS Bedrock enforces strict JSON Schema validation.
     * 
     * According to JSON Schema 2020-12 specification:
     * @see https://json-schema.org/draft/2020-12/meta/validation
     * 
     * Integer constraints (must be type: "integer", minimum: 0):
     * - minLength, maxLength: for string length validation
     * - minItems, maxItems: for array size validation  
     * - minProperties, maxProperties: for object property count validation
     * 
     * Number constraints (must be type: "number"):
     * - minimum, maximum: inclusive bounds for numeric values
     * - exclusiveMinimum, exclusiveMaximum: exclusive bounds for numeric values
     * - multipleOf: for checking if a number is a multiple of another (must be > 0)
     * 
     * This conversion ensures compatibility when upstream Gemini tools use string
     * representations of numbers (e.g., minLength: "1" instead of minLength: 1).
     */
    const numericProps = [
      // Integer constraints (nonNegativeInteger in JSON Schema)
      'minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties',
      // Number constraints
      'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'
    ];
    
    for (const prop of numericProps) {
      if (typeof schema[prop] === 'string' && !isNaN(Number(schema[prop]))) {
        schema[prop] = Number(schema[prop]);
      }
    }
    
    // Recursively process ALL properties (fixes incomplete recursion bug)
    for (const key in schema) {
      if (Object.prototype.hasOwnProperty.call(schema, key) && schema[key] && typeof schema[key] === 'object') {
        this.convertEnumTypesToStrings(schema[key]);
      }
    }
  }

  /**
   * Normalize and validate the schema for Bedrock
   */
  private static normalizeSchema(parameters?: Record<string, unknown>): { type: 'object'; properties?: unknown; [key: string]: unknown } {
    const schema = parameters || {};
    
    // First, convert any Type enum values to strings throughout the schema
    this.convertEnumTypesToStrings(schema);
    
    // Ensure the schema has type: "object" as required by Bedrock
    // Now we only need to check for string values since enums are converted
    if (schema.type === 'array') {
      // If it's an array type, wrap it in an object
      return {
        type: 'object',
        properties: {
          items: schema
        }
      };
    }
    
    // Force type to be "object" if it's not already
    if (schema.type !== 'object') {
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