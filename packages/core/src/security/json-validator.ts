/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  logConfigTamperingDetected,
} from './security-audit-logger.js';

/**
 * Secure JSON parsing utilities to prevent prototype pollution
 * and other deserialization attacks.
 *
 * SECURITY NOTE: JSON.parse() is vulnerable to prototype pollution
 * attacks when parsing untrusted data. This module provides safe
 * parsing with protection against common attack vectors.
 */

/**
 * Dangerous property names that can be used for prototype pollution.
 */
const DANGEROUS_PROPERTIES = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

/**
 * Error thrown when JSON validation fails.
 */
export class JSONValidationError extends Error {
  constructor(message: string, public readonly path?: string) {
    super(message);
    this.name = 'JSONValidationError';
  }
}

/**
 * Recursively removes dangerous properties from an object.
 *
 * @param obj Object to sanitize
 * @returns Sanitized object
 */
function sanitizeObject(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  const sanitized: Record<string, unknown> = {};

  for (const key of Object.keys(obj)) {
    // Skip dangerous properties
    if (DANGEROUS_PROPERTIES.has(key)) {
      logConfigTamperingDetected(
        'JSON object',
        `Dangerous property detected and removed: ${key}`,
      );
      continue;
    }

    // Recursively sanitize nested objects
    sanitized[key] = sanitizeObject((obj as Record<string, unknown>)[key]);
  }

  return sanitized;
}

/**
 * Safely parses JSON data with protection against prototype pollution.
 *
 * @param data JSON string to parse
 * @param filePath Optional file path for error reporting
 * @returns Parsed and sanitized object
 * @throws JSONValidationError if parsing fails
 */
export function safeJSONParse<T = unknown>(
  data: string,
  filePath?: string,
): T {
  try {
    // Parse the JSON
    const parsed = JSON.parse(data);

    // Sanitize to remove dangerous properties
    const sanitized = sanitizeObject(parsed);

    return sanitized as T;
  } catch (error) {
    throw new JSONValidationError(
      `Failed to parse JSON: ${(error as Error).message}`,
      filePath,
    );
  }
}

/**
 * Validates that a parsed object matches expected structure.
 *
 * @param obj Object to validate
 * @param schema Validation schema
 * @returns True if valid
 * @throws JSONValidationError if validation fails
 */
export function validateSchema(
  obj: unknown,
  schema: JSONSchema,
): boolean {
  const errors: string[] = [];
  validateValue(obj, schema, '', errors);

  if (errors.length > 0) {
    throw new JSONValidationError(
      `Schema validation failed:\n${errors.join('\n')}`,
    );
  }

  return true;
}

/**
 * JSON schema definition.
 */
export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
  pattern?: RegExp;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

/**
 * Validates a value against a schema.
 */
function validateValue(
  value: unknown,
  schema: JSONSchema,
  path: string,
  errors: string[],
): void {
  // Type check
  const actualType = Array.isArray(value) ? 'array' : typeof value;
  if (actualType !== schema.type && value !== null) {
    errors.push(
      `${path || 'root'}: Expected type ${schema.type}, got ${actualType}`,
    );
    return;
  }

  // Enum check
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(
      `${path || 'root'}: Value must be one of: ${schema.enum.join(', ')}`,
    );
  }

  // String validations
  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.pattern && !schema.pattern.test(value)) {
      errors.push(`${path || 'root'}: Does not match pattern ${schema.pattern}`);
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(
        `${path || 'root'}: Length ${value.length} is less than minimum ${schema.minLength}`,
      );
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(
        `${path || 'root'}: Length ${value.length} exceeds maximum ${schema.maxLength}`,
      );
    }
  }

  // Number validations
  if (schema.type === 'number' && typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path || 'root'}: Value ${value} is less than minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path || 'root'}: Value ${value} exceeds maximum ${schema.maximum}`);
    }
  }

  // Object validations
  if (schema.type === 'object' && typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;

    // Check required properties
    if (schema.required) {
      for (const requiredProp of schema.required) {
        if (!(requiredProp in obj)) {
          errors.push(`${path || 'root'}: Missing required property "${requiredProp}"`);
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propName in obj) {
          const newPath = path ? `${path}.${propName}` : propName;
          validateValue(obj[propName], propSchema, newPath, errors);
        }
      }
    }
  }

  // Array validations
  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.items) {
      value.forEach((item, index) => {
        const newPath = `${path}[${index}]`;
        validateValue(item, schema.items!, newPath, errors);
      });
    }
  }
}

/**
 * Safely parses and validates JSON against a schema.
 *
 * @param data JSON string to parse
 * @param schema Validation schema
 * @param filePath Optional file path for error reporting
 * @returns Parsed, sanitized, and validated object
 * @throws JSONValidationError if parsing or validation fails
 */
export function safeJSONParseWithSchema<T = unknown>(
  data: string,
  schema: JSONSchema,
  filePath?: string,
): T {
  const parsed = safeJSONParse<T>(data, filePath);
  validateSchema(parsed, schema);
  return parsed;
}

/**
 * Creates a reviver function for JSON.parse that blocks dangerous properties.
 *
 * @returns Reviver function
 */
export function createSafeJSONReviver(): (
  key: string,
  value: unknown,
) => unknown {
  return (key: string, value: unknown) => {
    // Block dangerous properties
    if (DANGEROUS_PROPERTIES.has(key)) {
      logConfigTamperingDetected(
        'JSON parsing',
        `Blocked dangerous property: ${key}`,
      );
      return undefined;
    }
    return value;
  };
}

/**
 * Detects if an object has been tampered with prototype pollution.
 *
 * @param obj Object to check
 * @returns True if prototype pollution detected
 */
export function detectPrototypePollution(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  // Check if dangerous properties exist
  const hasProto = '__proto__' in obj;
  const hasConstructor =
    'constructor' in obj &&
    typeof (obj as Record<string, unknown>).constructor === 'object';
  const hasPrototype = 'prototype' in obj;

  if (hasProto || hasConstructor || hasPrototype) {
    logConfigTamperingDetected(
      'Object',
      'Prototype pollution attempt detected',
    );
    return true;
  }

  // Recursively check nested objects
  if (Array.isArray(obj)) {
    return obj.some((item) => detectPrototypePollution(item));
  }

  return Object.values(obj).some((value) => detectPrototypePollution(value));
}
