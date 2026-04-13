/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContextProcessorRegistry } from './registry.js';

export function getContextManagementConfigSchema(
  registry: ContextProcessorRegistry,
) {
  // We use a registry to deeply validate processor overrides.
  // We do this by generating a `oneOf` list that matches the `type` discriminator
  // to the specific processor `options` schema.
  const processorOptionSchemas = registry.getSchemaDefs().map((def) => ({
    type: 'object',
    required: ['type', 'options'],
    properties: {
      type: { const: def.id },
      options: def.schema,
    },
  }));

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'ContextManagementConfig',
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
        description:
          'Named hyperparameter configurations for ContextProcessors and AsyncProcessors.',
        additionalProperties: { oneOf: processorOptionSchemas },
      },
    },
  };
}
