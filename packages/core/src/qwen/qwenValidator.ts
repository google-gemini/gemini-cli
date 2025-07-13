/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { QwenSpecificConfig, QwenTool } from './qwenConfig.js';
import { QwenError, QwenErrorType } from './qwenErrors.js';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface QwenEnvironmentConfig {
  apiKey?: string;
  apiUrl?: string;
  defaultModel?: string;
  timeout?: number;
}

/**
 * Validates Qwen-specific configuration
 */
export class QwenConfigValidator {
  
  /**
   * Validates the complete Qwen configuration
   */
  static validateConfig(config: QwenSpecificConfig): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Validate repetition_penalty
    if (config.repetition_penalty !== undefined) {
      const repPenalty = config.repetition_penalty;
      if (typeof repPenalty !== 'number' || repPenalty < 0.01 || repPenalty > 2.0) {
        result.errors.push(`repetition_penalty must be a number between 0.01 and 2.0, got: ${repPenalty}`);
        result.isValid = false;
      } else if (repPenalty < 0.5 || repPenalty > 1.5) {
        result.warnings.push(`repetition_penalty value ${repPenalty} is outside recommended range (0.5-1.5)`);
      }
    }

    // Validate presence_penalty
    if (config.presence_penalty !== undefined) {
      const presPenalty = config.presence_penalty;
      if (typeof presPenalty !== 'number' || presPenalty < -2.0 || presPenalty > 2.0) {
        result.errors.push(`presence_penalty must be a number between -2.0 and 2.0, got: ${presPenalty}`);
        result.isValid = false;
      }
    }

    // Validate frequency_penalty
    if (config.frequency_penalty !== undefined) {
      const freqPenalty = config.frequency_penalty;
      if (typeof freqPenalty !== 'number' || freqPenalty < -2.0 || freqPenalty > 2.0) {
        result.errors.push(`frequency_penalty must be a number between -2.0 and 2.0, got: ${freqPenalty}`);
        result.isValid = false;
      }
    }

    // Validate stop sequences
    if (config.stop !== undefined) {
      const stop = config.stop;
      if (typeof stop === 'string') {
        if (stop.length === 0) {
          result.errors.push('stop sequence cannot be empty string');
          result.isValid = false;
        } else if (stop.length > 20) {
          result.warnings.push(`stop sequence is quite long (${stop.length} chars), may not work as expected`);
        }
      } else if (Array.isArray(stop)) {
        if (stop.length === 0) {
          result.warnings.push('empty stop sequences array provided');
        } else if (stop.length > 4) {
          result.errors.push(`too many stop sequences (${stop.length}), maximum is 4`);
          result.isValid = false;
        } else {
          for (const seq of stop) {
            if (typeof seq !== 'string') {
              result.errors.push(`stop sequence must be string, got: ${typeof seq}`);
              result.isValid = false;
            } else if (seq.length === 0) {
              result.errors.push('stop sequence cannot be empty string');
              result.isValid = false;
            }
          }
        }
      } else {
        result.errors.push(`stop must be string or string array, got: ${typeof stop}`);
        result.isValid = false;
      }
    }

    // Validate seed
    if (config.seed !== undefined) {
      const seed = config.seed;
      if (!Number.isInteger(seed) || seed < 0 || seed > Number.MAX_SAFE_INTEGER) {
        result.errors.push(`seed must be a non-negative integer, got: ${seed}`);
        result.isValid = false;
      }
    }

    // Validate max_tokens_per_chunk
    if (config.max_tokens_per_chunk !== undefined) {
      const maxTokens = config.max_tokens_per_chunk;
      if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8192) {
        result.errors.push(`max_tokens_per_chunk must be an integer between 1 and 8192, got: ${maxTokens}`);
        result.isValid = false;
      } else if (maxTokens > 4096) {
        result.warnings.push(`max_tokens_per_chunk value ${maxTokens} is quite large, may cause performance issues`);
      }
    }

    // Validate result_format
    if (config.result_format !== undefined) {
      const format = config.result_format;
      const validFormats = ['text', 'message', 'json_object'];
      if (!validFormats.includes(format)) {
        result.errors.push(`result_format must be one of: ${validFormats.join(', ')}, got: ${format}`);
        result.isValid = false;
      }
    }

    // Validate response_format
    if (config.response_format !== undefined) {
      const respFormat = config.response_format;
      if (typeof respFormat !== 'object' || respFormat === null) {
        result.errors.push(`response_format must be an object, got: ${typeof respFormat}`);
        result.isValid = false;
      } else {
        if (respFormat.type !== 'json_object') {
          result.errors.push(`response_format.type must be 'json_object', got: ${respFormat.type}`);
          result.isValid = false;
        }
        if (respFormat.schema !== undefined && typeof respFormat.schema !== 'object') {
          result.errors.push(`response_format.schema must be an object, got: ${typeof respFormat.schema}`);
          result.isValid = false;
        }
      }
    }

    // Validate tools
    if (config.tools !== undefined) {
      if (!Array.isArray(config.tools)) {
        result.errors.push(`tools must be an array, got: ${typeof config.tools}`);
        result.isValid = false;
      } else {
        const toolValidation = this.validateTools(config.tools);
        result.errors.push(...toolValidation.errors);
        result.warnings.push(...toolValidation.warnings);
        if (!toolValidation.isValid) {
          result.isValid = false;
        }
      }
    }

    return result;
  }

  /**
   * Validates Qwen tools configuration
   */
  static validateTools(tools: QwenTool[]): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    const validToolTypes = ['function', 'code_interpreter', 'web_search'];

    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i];
      const prefix = `tools[${i}]`;

      if (typeof tool !== 'object' || tool === null) {
        result.errors.push(`${prefix} must be an object, got: ${typeof tool}`);
        result.isValid = false;
        continue;
      }

      if (!validToolTypes.includes(tool.type)) {
        result.errors.push(`${prefix}.type must be one of: ${validToolTypes.join(', ')}, got: ${tool.type}`);
        result.isValid = false;
      }

      if (tool.type === 'function') {
        if (!tool.function) {
          result.errors.push(`${prefix}.function is required when type is 'function'`);
          result.isValid = false;
        } else {
          const func = tool.function;
          if (typeof func.name !== 'string' || func.name.length === 0) {
            result.errors.push(`${prefix}.function.name must be a non-empty string`);
            result.isValid = false;
          } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(func.name)) {
            result.errors.push(`${prefix}.function.name must be a valid identifier: ${func.name}`);
            result.isValid = false;
          }

          if (typeof func.description !== 'string' || func.description.length === 0) {
            result.errors.push(`${prefix}.function.description must be a non-empty string`);
            result.isValid = false;
          } else if (func.description.length > 1000) {
            result.warnings.push(`${prefix}.function.description is quite long (${func.description.length} chars)`);
          }

          if (func.parameters !== undefined && typeof func.parameters !== 'object') {
            result.errors.push(`${prefix}.function.parameters must be an object`);
            result.isValid = false;
          }
        }
      }
    }

    return result;
  }

  /**
   * Validates environment configuration
   */
  static validateEnvironment(config: QwenEnvironmentConfig): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    // Validate API key
    if (config.apiKey !== undefined) {
      if (typeof config.apiKey !== 'string' || config.apiKey.length === 0) {
        result.errors.push('apiKey must be a non-empty string');
        result.isValid = false;
      } else if (config.apiKey.length < 10) {
        result.warnings.push('apiKey seems too short, verify it is correct');
      } else if (config.apiKey.includes(' ')) {
        result.errors.push('apiKey should not contain spaces');
        result.isValid = false;
      }
    }

    // Validate API URL
    if (config.apiUrl !== undefined) {
      try {
        const url = new URL(config.apiUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          result.errors.push(`apiUrl must use http or https protocol, got: ${url.protocol}`);
          result.isValid = false;
        }
        if (url.protocol === 'http:' && !url.hostname.includes('localhost')) {
          result.warnings.push('Using HTTP for non-localhost API URL is not secure');
        }
      } catch (error) {
        result.errors.push(`apiUrl is not a valid URL: ${config.apiUrl}`);
        result.isValid = false;
      }
    }

    // Validate timeout
    if (config.timeout !== undefined) {
      if (!Number.isInteger(config.timeout) || config.timeout < 1000 || config.timeout > 300000) {
        result.errors.push(`timeout must be an integer between 1000 and 300000 ms, got: ${config.timeout}`);
        result.isValid = false;
      } else if (config.timeout < 5000) {
        result.warnings.push(`timeout value ${config.timeout}ms is quite low, may cause frequent timeouts`);
      }
    }

    return result;
  }

  /**
   * Validates a model name
   */
  static validateModel(model: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    const supportedModels = [
      'qwen-turbo',
      'qwen-plus',
      'qwen-max',
      'qwen-max-0428',
      'qwen-max-0403',
      'qwen-max-0107',
      'qwen-max-longcontext',
      'qwen2-72b-instruct',
      'qwen2-57b-a14b-instruct',
      'qwen2-7b-instruct',
      'qwen2-1.5b-instruct',
      'qwen2-0.5b-instruct',
    ];

    if (typeof model !== 'string' || model.length === 0) {
      result.errors.push('model must be a non-empty string');
      result.isValid = false;
    } else if (!supportedModels.includes(model)) {
      result.warnings.push(`model '${model}' is not in the list of known supported models`);
    }

    return result;
  }
}

/**
 * Throws an error if validation fails
 */
export function validateConfigOrThrow(config: QwenSpecificConfig): void {
  const validation = QwenConfigValidator.validateConfig(config);
  
  if (!validation.isValid) {
    throw new QwenError(
      QwenErrorType.INVALID_REQUEST,
      `Invalid Qwen configuration: ${validation.errors.join(', ')}`,
    );
  }

  // Log warnings
  if (validation.warnings.length > 0) {
    console.warn('Qwen configuration warnings:', validation.warnings.join(', '));
  }
}

/**
 * Validates environment configuration and throws on errors
 */
export function validateEnvironmentOrThrow(config: QwenEnvironmentConfig): void {
  const validation = QwenConfigValidator.validateEnvironment(config);
  
  if (!validation.isValid) {
    throw new QwenError(
      QwenErrorType.INVALID_REQUEST,
      `Invalid Qwen environment configuration: ${validation.errors.join(', ')}`,
    );
  }

  // Log warnings
  if (validation.warnings.length > 0) {
    console.warn('Qwen environment warnings:', validation.warnings.join(', '));
  }
}

/**
 * Type guard to check if an object is a valid QwenSpecificConfig
 */
export function isValidQwenConfig(obj: any): obj is QwenSpecificConfig {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const validation = QwenConfigValidator.validateConfig(obj);
  return validation.isValid;
}

/**
 * Safe configuration parser that validates and provides defaults
 */
export function parseQwenConfig(input: unknown): QwenSpecificConfig {
  if (typeof input !== 'object' || input === null) {
    throw new QwenError(
      QwenErrorType.INVALID_REQUEST,
      'Qwen config must be an object',
    );
  }

  const config = input as QwenSpecificConfig;
  validateConfigOrThrow(config);
  
  return config;
}