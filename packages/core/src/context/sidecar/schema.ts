/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ProcessorRegistry } from './registry.js';
import './builtins.js';

export function getSidecarConfigSchema(registry: ProcessorRegistry) {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'SidecarConfig',
    description: 'The Data-Driven Schema for the Context Manager.',
    type: 'object',
    required: ['budget', 'pipelines'],
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
      workers: {
        type: 'array',
        description: 'Background workers that proactively accumulate context.',
        items: {
          type: 'object',
          required: ['workerId'],
          properties: {
            workerId: { type: 'string' },
            options: { type: 'object' },
          },
        },
      },
      pipelines: {
        type: 'array',
        description: 'The execution graphs for context manipulation.',
        items: {
          type: 'object',
          required: ['name', 'triggers', 'execution', 'processors'],
          properties: {
            name: {
              type: 'string',
            },
            triggers: {
              type: 'array',
              items: {
                anyOf: [
                  {
                    type: 'string',
                    enum: ['new_message', 'retained_exceeded', 'gc_backstop'],
                  },
                  {
                    type: 'object',
                    required: ['type', 'intervalMs'],
                    properties: {
                      type: {
                        type: 'string',
                        const: 'timer',
                      },
                      intervalMs: {
                        type: 'number',
                      },
                    },
                  },
                ],
              },
            },
            execution: {
              type: 'string',
              enum: ['blocking', 'background'],
            },
            processors: {
              type: 'array',
              items: {
                oneOf: registry.getSchemas(),
              },
            },
          },
        },
      },
    },
  };
}
