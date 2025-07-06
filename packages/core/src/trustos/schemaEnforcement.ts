/**
 * @license
 * Copyright 2025 Trust Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustNodeLlamaClient } from './nodeLlamaClient.js';
import { GenerationOptions } from './types.js';

/**
 * JSON Schema definition
 */
export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: any[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  description?: string;
  examples?: any[];
}

/**
 * Structured output request
 */
export interface StructuredRequest {
  prompt: string;
  schema: JSONSchema;
  options?: GenerationOptions;
  maxRetries?: number;
  validationStrict?: boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  data?: any;
  errors: string[];
  rawResponse: string;
}

/**
 * JSON Schema enforcement for structured outputs
 * Trust: An Open System for Modern Assurance
 */
export class TrustSchemaEnforcement {
  private client: TrustNodeLlamaClient;

  constructor(client: TrustNodeLlamaClient) {
    this.client = client;
  }

  /**
   * Generate structured output with schema enforcement
   */
  async generateStructured(request: StructuredRequest): Promise<ValidationResult> {
    const { prompt, schema, options = {}, maxRetries = 3, validationStrict = true } = request;
    
    // Enhance prompt with schema information
    let enhancedPrompt = this.createSchemaPrompt(prompt, schema);
    
    let lastError = '';
    let rawResponse = '';
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Generate response
        rawResponse = await this.client.generateText(enhancedPrompt, {
          ...options,
          temperature: Math.max(0.1, (options.temperature || 0.7) * 0.8), // Reduce creativity for structure
        });
        
        // Extract and validate JSON
        const validationResult = this.validateAndExtract(rawResponse, schema, validationStrict);
        
        if (validationResult.valid) {
          return validationResult;
        }
        
        // If validation failed, prepare for retry
        lastError = validationResult.errors.join(', ');
        
        if (attempt < maxRetries - 1) {
          // Enhance prompt with error feedback for retry
          const errorPrompt = this.createRetryPrompt(prompt, schema, validationResult.errors, rawResponse);
          enhancedPrompt = errorPrompt;
        }
        
      } catch (error) {
        lastError = String(error);
        if (attempt === maxRetries - 1) {
          return {
            valid: false,
            errors: [`Generation failed: ${lastError}`],
            rawResponse,
          };
        }
      }
    }
    
    return {
      valid: false,
      errors: [`Failed after ${maxRetries} attempts. Last error: ${lastError}`],
      rawResponse,
    };
  }

  /**
   * Validate JSON against schema
   */
  validateJSON(data: any, schema: JSONSchema): ValidationResult {
    const errors: string[] = [];
    
    try {
      this.validateValue(data, schema, '', errors);
      
      return {
        valid: errors.length === 0,
        data: errors.length === 0 ? data : undefined,
        errors,
        rawResponse: JSON.stringify(data, null, 2),
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${error}`],
        rawResponse: JSON.stringify(data, null, 2),
      };
    }
  }

  /**
   * Generate schema-aware prompts for common patterns
   */
  createPatternPrompts(): Record<string, (userPrompt: string) => string> {
    return {
      list: (userPrompt: string) => `${userPrompt}\\n\\nPlease respond with a JSON array of strings.`,
      
      keyValue: (userPrompt: string) => `${userPrompt}\\n\\nPlease respond with a JSON object containing key-value pairs.`,
      
      structured: (userPrompt: string) => `${userPrompt}\\n\\nPlease respond with a well-structured JSON object.`,
      
      analysis: (userPrompt: string) => `${userPrompt}\\n\\nPlease respond with a JSON object containing your analysis with clear categories and findings.`,
      
      summary: (userPrompt: string) => `${userPrompt}\\n\\nPlease respond with a JSON object containing a summary with key points and conclusions.`,
    };
  }

  /**
   * Common schema templates
   */
  getCommonSchemas(): Record<string, JSONSchema> {
    return {
      stringList: {
        type: 'array',
        items: { type: 'string' },
        description: 'An array of strings',
      },
      
      keyValuePairs: {
        type: 'object',
        description: 'Key-value pairs as an object',
      },
      
      codeAnalysis: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Brief summary of the code' },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['error', 'warning', 'info'] },
                message: { type: 'string' },
                line: { type: 'number' },
                severity: { type: 'number', minimum: 1, maximum: 10 },
              },
              required: ['type', 'message'],
            },
          },
          suggestions: {
            type: 'array',
            items: { type: 'string' },
          },
          metrics: {
            type: 'object',
            properties: {
              complexity: { type: 'number' },
              maintainability: { type: 'number' },
              testCoverage: { type: 'number' },
            },
          },
        },
        required: ['summary', 'issues', 'suggestions'],
      },
      
      taskBreakdown: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                estimatedHours: { type: 'number', minimum: 0 },
                dependencies: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['id', 'title', 'priority'],
            },
          },
          totalEstimate: { type: 'number', minimum: 0 },
        },
        required: ['title', 'tasks'],
      },
      
      documentSummary: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          mainPoints: {
            type: 'array',
            items: { type: 'string' },
          },
          keyFindings: {
            type: 'array',
            items: { type: 'string' },
          },
          actionItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string' },
                priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                deadline: { type: 'string', format: 'date' },
              },
              required: ['action', 'priority'],
            },
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['title', 'mainPoints', 'keyFindings'],
      },
    };
  }

  private createSchemaPrompt(userPrompt: string, schema: JSONSchema): string {
    let prompt = userPrompt;
    
    prompt += '\\n\\nIMPORTANT: Please respond with valid JSON that matches this exact schema:\\n';
    prompt += JSON.stringify(schema, null, 2);
    prompt += '\\n\\nYour response must be pure JSON with no additional text or explanations.';
    prompt += '\\nEnsure all required fields are included and data types match the schema.';
    
    if (schema.examples && schema.examples.length > 0) {
      prompt += '\\n\\nExample format:\\n';
      prompt += JSON.stringify(schema.examples[0], null, 2);
    }
    
    return prompt;
  }

  private createRetryPrompt(
    originalPrompt: string, 
    schema: JSONSchema, 
    errors: string[], 
    previousResponse: string
  ): string {
    let prompt = originalPrompt;
    
    prompt += '\\n\\nThe previous response had validation errors:\\n';
    for (const error of errors) {
      prompt += `- ${error}\\n`;
    }
    
    prompt += '\\nPrevious response:\\n';
    prompt += previousResponse;
    
    prompt += '\\n\\nPlease provide a corrected JSON response that matches this schema:\\n';
    prompt += JSON.stringify(schema, null, 2);
    prompt += '\\n\\nYour response must be pure JSON with no additional text.';
    
    return prompt;
  }

  private validateAndExtract(response: string, schema: JSONSchema, strict: boolean): ValidationResult {
    // Try to extract JSON from response
    const jsonMatch = this.extractJSON(response);
    
    if (!jsonMatch) {
      return {
        valid: false,
        errors: ['No valid JSON found in response'],
        rawResponse: response,
      };
    }
    
    try {
      const data = JSON.parse(jsonMatch);
      return this.validateJSON(data, schema);
    } catch (error) {
      return {
        valid: false,
        errors: [`JSON parsing failed: ${error}`],
        rawResponse: response,
      };
    }
  }

  private extractJSON(text: string): string | null {
    // Try to find JSON in various formats
    const patterns = [
      /```json\\s*([\\s\\S]*?)\\s*```/i,  // JSON code blocks
      /```\\s*([\\s\\S]*?)\\s*```/,       // Generic code blocks
      /{[\\s\\S]*}/,                      // JSON objects
      /\\[[\\s\\S]*\\]/,                  // JSON arrays
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const candidate = match[1] || match[0];
        try {
          JSON.parse(candidate.trim());
          return candidate.trim();
        } catch (error) {
          continue;
        }
      }
    }
    
    return null;
  }

  private validateValue(value: any, schema: JSONSchema, path: string, errors: string[]): void {
    // Type validation
    if (!this.validateType(value, schema.type)) {
      errors.push(`${path}: Expected ${schema.type}, got ${typeof value}`);
      return;
    }
    
    // Specific type validations
    switch (schema.type) {
      case 'object':
        this.validateObject(value, schema, path, errors);
        break;
      case 'array':
        this.validateArray(value, schema, path, errors);
        break;
      case 'string':
        this.validateString(value, schema, path, errors);
        break;
      case 'number':
        this.validateNumber(value, schema, path, errors);
        break;
    }
    
    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${path}: Value must be one of ${JSON.stringify(schema.enum)}`);
    }
  }

  private validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'null':
        return value === null;
      default:
        return true;
    }
  }

  private validateObject(obj: any, schema: JSONSchema, path: string, errors: string[]): void {
    if (schema.required) {
      for (const required of schema.required) {
        if (!(required in obj)) {
          errors.push(`${path}: Missing required property '${required}'`);
        }
      }
    }
    
    if (schema.properties) {
      for (const [key, value] of Object.entries(obj)) {
        const propSchema = schema.properties[key];
        if (propSchema) {
          this.validateValue(value, propSchema, `${path}.${key}`, errors);
        }
      }
    }
  }

  private validateArray(arr: any[], schema: JSONSchema, path: string, errors: string[]): void {
    if (schema.items) {
      arr.forEach((item, index) => {
        this.validateValue(item, schema.items!, `${path}[${index}]`, errors);
      });
    }
  }

  private validateString(str: string, schema: JSONSchema, path: string, errors: string[]): void {
    if (schema.minLength !== undefined && str.length < schema.minLength) {
      errors.push(`${path}: String too short (min: ${schema.minLength})`);
    }
    
    if (schema.maxLength !== undefined && str.length > schema.maxLength) {
      errors.push(`${path}: String too long (max: ${schema.maxLength})`);
    }
    
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(str)) {
        errors.push(`${path}: String does not match pattern ${schema.pattern}`);
      }
    }
  }

  private validateNumber(num: number, schema: JSONSchema, path: string, errors: string[]): void {
    if (schema.minimum !== undefined && num < schema.minimum) {
      errors.push(`${path}: Number too small (min: ${schema.minimum})`);
    }
    
    if (schema.maximum !== undefined && num > schema.maximum) {
      errors.push(`${path}: Number too large (max: ${schema.maximum})`);
    }
  }
}