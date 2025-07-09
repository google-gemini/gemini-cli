/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineChatSessionFunction } from 'node-llama-cpp';
import { ToolRegistry } from '../tools/tool-registry.js';
import { executeToolCall, ToolCallRequestInfo } from '../index.js';
import { Config } from '../config/config.js';

/**
 * GBNF Function Registry
 * Converts Trust CLI tools to native node-llama-cpp functions with JSON schema enforcement
 */
export class GBNFunctionRegistry {
  private config: Config;
  private toolRegistry: ToolRegistry;
  
  constructor(config: Config, toolRegistry: ToolRegistry) {
    this.config = config;
    this.toolRegistry = toolRegistry;
  }

  /**
   * Convert Trust CLI tools to native node-llama-cpp functions
   * This enables grammar-based JSON schema enforcement for reliable function calling
   */
  async createNativeFunctions(): Promise<Record<string, any>> {
    const functions: Record<string, any> = {};
    const functionDeclarations = this.toolRegistry.getFunctionDeclarations();
    
    for (const declaration of functionDeclarations) {
      if (!declaration.name) continue;
      
      const toolName = declaration.name;
      const tool = this.toolRegistry.getTool(toolName);
      
      if (!tool) {
        console.warn(`Tool "${toolName}" not found in registry, skipping GBNF function creation`);
        continue;
      }
      
      // Convert Gemini function declaration to node-llama-cpp function
      functions[toolName] = defineChatSessionFunction({
        description: declaration.description || `Execute ${toolName} tool`,
        params: this.convertGeminiSchemaToJsonSchema(declaration.parameters),
        handler: async (params: any) => {
          try {
            console.log(`DEBUG: GBNF function "${toolName}" called with params:`, params);
            
            // Create tool call request
            const request: ToolCallRequestInfo = {
              callId: `gbnf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: toolName,
              args: params || {},
              isClientInitiated: false,
            };
            
            // Execute the tool using existing infrastructure
            const result = await executeToolCall(
              this.config,
              request,
              this.toolRegistry,
              new AbortController().signal
            );
            
            if (result.error) {
              console.error(`GBNF function "${toolName}" failed:`, result.error);
              return {
                error: result.error.message,
                success: false
              };
            }
            
            // Extract result for the model
            let output: any;
            if (result.responseParts) {
              const parts = Array.isArray(result.responseParts) 
                ? result.responseParts 
                : [result.responseParts];
              
              // Try to extract the actual tool response
              for (const part of parts) {
                if (typeof part === 'string') {
                  output = part;
                  break;
                } else if (part && typeof part === 'object' && 'functionResponse' in part && part.functionResponse) {
                  output = part.functionResponse.response?.output || JSON.stringify(part.functionResponse.response);
                  break;
                }
              }
            }
            
            const response = {
              success: true,
              output: output || result.resultDisplay || 'Tool executed successfully',
              displayMessage: result.resultDisplay
            };
            
            console.log(`DEBUG: GBNF function "${toolName}" response:`, response);
            return response;
            
          } catch (error) {
            console.error(`GBNF function "${toolName}" exception:`, error);
            return {
              error: error instanceof Error ? error.message : String(error),
              success: false
            };
          }
        }
      });
    }
    
    console.log(`DEBUG: Created ${Object.keys(functions).length} GBNF functions:`, Object.keys(functions));
    return functions;
  }
  
  /**
   * Convert Gemini function schema to JSON schema format
   * This ensures compatibility with node-llama-cpp's schema enforcement
   */
  private convertGeminiSchemaToJsonSchema(geminiSchema: any): any {
    if (!geminiSchema || typeof geminiSchema !== 'object') {
      return { type: 'object', properties: {} };
    }
    
    // If it's already a JSON schema, return as-is
    if (geminiSchema.type && geminiSchema.properties) {
      return geminiSchema;
    }
    
    // Convert Gemini schema format to JSON schema
    const jsonSchema: any = {
      type: 'object',
      properties: {},
      required: []
    };
    
    if (geminiSchema.properties) {
      for (const [key, value] of Object.entries(geminiSchema.properties)) {
        if (value && typeof value === 'object') {
          jsonSchema.properties[key] = this.convertPropertySchema(value as any);
        }
      }
    }
    
    if (geminiSchema.required && Array.isArray(geminiSchema.required)) {
      jsonSchema.required = geminiSchema.required;
    }
    
    return jsonSchema;
  }
  
  /**
   * Convert individual property schema from Gemini to JSON schema format
   */
  private convertPropertySchema(prop: any): any {
    if (!prop || typeof prop !== 'object') {
      return { type: 'string' };
    }
    
    const converted: any = {};
    
    // Map type
    if (prop.type) {
      converted.type = prop.type;
    } else {
      converted.type = 'string'; // Default fallback
    }
    
    // Copy over standard JSON schema properties
    if (prop.description) converted.description = prop.description;
    if (prop.enum) converted.enum = prop.enum;
    if (prop.pattern) converted.pattern = prop.pattern;
    if (prop.minimum !== undefined) converted.minimum = prop.minimum;
    if (prop.maximum !== undefined) converted.maximum = prop.maximum;
    if (prop.items) converted.items = this.convertPropertySchema(prop.items);
    
    return converted;
  }
}