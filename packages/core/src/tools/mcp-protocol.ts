/**
 * @LICENSE
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

// Zod schema for FunctionDeclaration
interface Schema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  items?: Schema;
}

const SchemaSchema: z.ZodType<Schema> = z.lazy(() =>
  z.object({
    type: z.string(),
    properties: z.record(z.unknown()).optional(),
    required: z.array(z.string()).optional(),
    items: SchemaSchema.optional(),
  }),
);

const FunctionDeclarationSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  parameters: SchemaSchema.optional(),
  parametersJsonSchema: z.record(z.unknown()).optional(),
});

export const ListToolsResponseSchema = z.object({
  tools: z.array(FunctionDeclarationSchema),
});

// Zod schema for McpPrompt
const McpPromptParameterPropertiesSchema = z.record(
  z.object({
    type: z.string(),
    description: z.string(),
  }),
);

const McpPromptSchema = z.object({
  name: z.string(),
  description: z.string(),
  template: z.string(),
  parameters: z.object({
    type: z.literal('object'),
    properties: McpPromptParameterPropertiesSchema,
    required: z.array(z.string()),
  }),
});

export const GetPromptResponseSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    }),
  ),
});

export const ListPromptsResponseSchema = z.object({
  prompts: z.array(McpPromptSchema),
});