/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GenerateContentConfig } from '@google/genai';

/**
 * Qwen-specific configuration options
 */
export interface QwenSpecificConfig {
  /** Whether to enable incremental output (streaming) */
  incremental_output?: boolean;
  
  /** Repetition penalty for reducing repetitive content */
  repetition_penalty?: number;
  
  /** Presence penalty for encouraging diverse vocabulary */
  presence_penalty?: number;
  
  /** Frequency penalty for reducing repetition of specific tokens */
  frequency_penalty?: number;
  
  /** Stop sequences to end generation */
  stop?: string | string[];
  
  /** Random seed for reproducible results */
  seed?: number;
  
  /** Maximum number of tokens to generate per chunk in streaming */
  max_tokens_per_chunk?: number;
  
  /** Whether to enable web search plugin */
  enable_search?: boolean;
  
  /** Whether to enable citation mode */
  enable_citation?: boolean;
  
  /** Custom tools/plugins to enable */
  tools?: QwenTool[];
  
  /** Output format specification */
  result_format?: 'text' | 'message' | 'json_object';
  
  /** JSON schema for structured output */
  response_format?: {
    type: 'json_object';
    schema?: Record<string, any>;
  };
}

export interface QwenTool {
  type: 'function' | 'code_interpreter' | 'web_search';
  function?: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

/**
 * Extended Gemini config that includes Qwen-specific options
 */
export interface ExtendedGenerateContentConfig extends GenerateContentConfig {
  qwen?: QwenSpecificConfig;
}

/**
 * Default Qwen configuration values
 */
export const DEFAULT_QWEN_CONFIG: Required<Pick<QwenSpecificConfig, 
  'repetition_penalty' | 'presence_penalty' | 'frequency_penalty' | 
  'max_tokens_per_chunk' | 'enable_search' | 'enable_citation' | 'result_format'
>> = {
  repetition_penalty: 1.1,
  presence_penalty: 0.0,
  frequency_penalty: 0.0,
  max_tokens_per_chunk: 512,
  enable_search: false,
  enable_citation: false,
  result_format: 'text',
};

/**
 * Model-specific default configurations
 */
export const MODEL_CONFIGS: Record<string, Partial<QwenSpecificConfig>> = {
  'qwen-turbo': {
    repetition_penalty: 1.05,
    max_tokens_per_chunk: 256,
  },
  'qwen-plus': {
    repetition_penalty: 1.1,
    max_tokens_per_chunk: 512,
  },
  'qwen-max': {
    repetition_penalty: 1.1,
    max_tokens_per_chunk: 1024,
    enable_search: true,
  },
  'qwen-max-longcontext': {
    repetition_penalty: 1.05,
    max_tokens_per_chunk: 2048,
  },
  'qwen2-72b-instruct': {
    repetition_penalty: 1.1,
    max_tokens_per_chunk: 512,
  },
  'qwen2-7b-instruct': {
    repetition_penalty: 1.05,
    max_tokens_per_chunk: 256,
  },
  'qwen2-1.5b-instruct': {
    repetition_penalty: 1.0,
    max_tokens_per_chunk: 128,
  },
  'qwen2-0.5b-instruct': {
    repetition_penalty: 1.0,
    max_tokens_per_chunk: 64,
  },
};

/**
 * Validates and normalizes Qwen configuration
 */
export function validateQwenConfig(config: QwenSpecificConfig): QwenSpecificConfig {
  const validated: QwenSpecificConfig = { ...config };

  // Validate repetition_penalty
  if (validated.repetition_penalty !== undefined) {
    if (validated.repetition_penalty < 0.01 || validated.repetition_penalty > 2.0) {
      console.warn(`repetition_penalty should be between 0.01 and 2.0, got ${validated.repetition_penalty}`);
      validated.repetition_penalty = Math.max(0.01, Math.min(2.0, validated.repetition_penalty));
    }
  }

  // Validate presence_penalty
  if (validated.presence_penalty !== undefined) {
    if (validated.presence_penalty < -2.0 || validated.presence_penalty > 2.0) {
      console.warn(`presence_penalty should be between -2.0 and 2.0, got ${validated.presence_penalty}`);
      validated.presence_penalty = Math.max(-2.0, Math.min(2.0, validated.presence_penalty));
    }
  }

  // Validate frequency_penalty
  if (validated.frequency_penalty !== undefined) {
    if (validated.frequency_penalty < -2.0 || validated.frequency_penalty > 2.0) {
      console.warn(`frequency_penalty should be between -2.0 and 2.0, got ${validated.frequency_penalty}`);
      validated.frequency_penalty = Math.max(-2.0, Math.min(2.0, validated.frequency_penalty));
    }
  }

  // Validate max_tokens_per_chunk
  if (validated.max_tokens_per_chunk !== undefined) {
    if (validated.max_tokens_per_chunk < 1 || validated.max_tokens_per_chunk > 4096) {
      console.warn(`max_tokens_per_chunk should be between 1 and 4096, got ${validated.max_tokens_per_chunk}`);
      validated.max_tokens_per_chunk = Math.max(1, Math.min(4096, validated.max_tokens_per_chunk));
    }
  }

  // Validate seed
  if (validated.seed !== undefined) {
    if (!Number.isInteger(validated.seed) || validated.seed < 0) {
      console.warn(`seed should be a non-negative integer, got ${validated.seed}`);
      validated.seed = Math.max(0, Math.floor(validated.seed));
    }
  }

  // Normalize stop sequences
  if (validated.stop !== undefined) {
    if (typeof validated.stop === 'string') {
      validated.stop = [validated.stop];
    } else if (Array.isArray(validated.stop)) {
      validated.stop = validated.stop.filter(s => typeof s === 'string' && s.length > 0);
      if (validated.stop.length === 0) {
        delete validated.stop;
      } else if (validated.stop.length > 4) {
        console.warn(`Too many stop sequences, using first 4 out of ${validated.stop.length}`);
        validated.stop = validated.stop.slice(0, 4);
      }
    }
  }

  return validated;
}

/**
 * Merges model-specific config with user config
 */
export function getMergedQwenConfig(
  model: string,
  userConfig?: QwenSpecificConfig,
): QwenSpecificConfig {
  const modelDefaults = MODEL_CONFIGS[model] || {};
  const merged = {
    ...DEFAULT_QWEN_CONFIG,
    ...modelDefaults,
    ...userConfig,
  };
  
  return validateQwenConfig(merged);
}

/**
 * Converts Qwen config to API request parameters
 */
export function qwenConfigToApiParams(config: QwenSpecificConfig): Record<string, any> {
  const params: Record<string, any> = {};

  if (config.repetition_penalty !== undefined) {
    params.repetition_penalty = config.repetition_penalty;
  }

  if (config.presence_penalty !== undefined) {
    params.presence_penalty = config.presence_penalty;
  }

  if (config.frequency_penalty !== undefined) {
    params.frequency_penalty = config.frequency_penalty;
  }

  if (config.stop !== undefined) {
    params.stop = config.stop;
  }

  if (config.seed !== undefined) {
    params.seed = config.seed;
  }

  if (config.incremental_output !== undefined) {
    params.incremental_output = config.incremental_output;
  }

  if (config.enable_search !== undefined) {
    params.enable_search = config.enable_search;
  }

  if (config.enable_citation !== undefined) {
    params.enable_citation = config.enable_citation;
  }

  if (config.result_format !== undefined) {
    params.result_format = config.result_format;
  }

  if (config.response_format !== undefined) {
    params.response_format = config.response_format;
  }

  if (config.tools !== undefined) {
    params.tools = config.tools;
  }

  return params;
}