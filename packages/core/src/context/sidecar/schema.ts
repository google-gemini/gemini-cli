/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ProcessorRegistry } from './registry.js';
import './builtins.js';

export const sidecarConfigSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "SidecarConfig",
  description: "The Data-Driven Schema for the Context Manager.",
  type: "object",
  required: ["budget", "gcBackstop", "pipelines"],
  properties: {
    budget: {
      type: "object",
      description: "Defines the token ceilings and limits for the pipeline.",
      required: ["retainedTokens", "maxTokens"],
      properties: {
        retainedTokens: {
          type: "number",
          description: "The ideal token count the pipeline tries to shrink down to."
        },
        maxTokens: {
          type: "number",
          description: "The absolute maximum token count allowed before synchronous truncation kicks in."
        }
      }
    },
    gcBackstop: {
      type: "object",
      description: "Defines what happens when the pipeline fails to compress under 'maxTokens'",
      required: ["strategy", "target"],
      properties: {
        strategy: {
          type: "string",
          enum: ["truncate", "compress", "rollingSummarizer"]
        },
        target: {
          type: "string",
          enum: ["incremental", "freeNTokens", "max"]
        },
        freeTokensTarget: {
          type: "number"
        }
      }
    },
    pipelines: {
      type: "array",
      description: "The execution graphs for context manipulation.",
      items: {
        type: "object",
        required: ["name", "triggers", "execution", "processors"],
        properties: {
          name: {
            type: "string"
          },
          triggers: {
            type: "array",
            items: {
              anyOf: [
                {
                  type: "string",
                  enum: ["on_turn", "post_turn", "budget_exceeded"]
                },
                {
                  type: "object",
                  required: ["type", "intervalMs"],
                  properties: {
                    type: {
                      type: "string",
                      const: "timer"
                    },
                    intervalMs: {
                      type: "number"
                    }
                  }
                }
              ]
            }
          },
          execution: {
            type: "string",
            enum: ["blocking", "background"]
          },
          processors: {
            type: "array",
            items: {
              oneOf: ProcessorRegistry.getSchemas()
            }
          }
        }
      }
    }
  }
};
