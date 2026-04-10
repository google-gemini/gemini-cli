/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SidecarRegistry } from './registry.js';

export function getSidecarConfigSchema(registry?: SidecarRegistry) {
  // If a registry is provided, we can deeply validate processor overrides.
  // We do this by generating a `oneOf` list that matches the `type` discriminator
  // to the specific processor `options` schema.
  const processorOptionSchemas = registry ? registry.getSchemaDefs().map(def => ({
    type: 'object',
    required: ['type', 'options'],
    properties: {
      type: { const: def.id },
      options: def.schema
    }
  })) : [];

  const processorOptionsMapping = processorOptionSchemas.length > 0 
    ? { oneOf: processorOptionSchemas }
    : {
        type: 'object',
        required: ['type', 'options'],
        properties: {
          type: { type: 'string', description: 'The registry type of the processor (e.g. NodeTruncation)' },
          options: { type: 'object', description: 'The hyperparameter overrides' }
        }
      };

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'SidecarConfig',
    description: 'The Hyperparameter schema for a Context Profile.',
    type: 'object',
    properties: {
      budget: {
        type: 'object',
        description: 'Defines the token ceilings and limits for the pipeline.',
        required: ['retainedTokens', 'maxTokens'],
        properties: {
          retainedTokens: {
            type: 'number',
            description:
              'The ideal token count the pipeline tries to shrink down to.',
          },
          maxTokens: {
            type: 'number',
            description:
              'The absolute maximum token count allowed before synchronous truncation kicks in.',
          },
        },
      },
      processorOptions: {
        type: 'object',
        description: 'Named hyperparameter configurations for ContextProcessors and Workers.',
        additionalProperties: processorOptionsMapping
      }
    },
  };
}
