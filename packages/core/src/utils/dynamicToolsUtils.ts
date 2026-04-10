/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { FunctionDeclaration, Schema } from '@google/genai';
import { Type } from '@google/genai';
import { debugLogger } from './debugLogger.js';

/**
 * Generates documentation for tools to be injected into the system prompt.
 */
export function getDynamicToolsDocumentation(
  tools: FunctionDeclaration[],
): string {
  let doc =
    '# Tools\n\nYou have a variety of tools available to you that can be called via the `execute` function. ALWAYS use `execute` for all tool calls. Additional tools may be loaded dynamically as you continue to work.\n\n## Initial Tools\n\n';
  for (const tool of tools) {
    if (!tool.name) continue;
    const argsName = `${tool.name
      .split(/_|-/)
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('')}Args`;
    doc += `<tool name="${tool.name}">\n`;
    doc += `Description: ${tool.description ?? ''}\n\n`;
    doc += `Usage: execute({name: "${tool.name}", args: ...})\n\n`;
    if (tool.parameters) {
      doc += 'Arguments:\n';
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const properties =
        ((tool.parameters.properties as unknown) as Record<string, unknown>) ||
        {};
      for (const [name, propRaw] of Object.entries(properties)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const prop = propRaw as Schema;
        const isRequired = tool.parameters.required?.includes(name);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const typeStr = (prop.type as string) || 'any';
        doc += `- ${name} (${typeStr}${isRequired ? ', REQUIRED' : ', OPTIONAL'}): ${prop.description ?? ''}\n`;
      }
      doc += '\n```ts\n';
      doc += `interface ${argsName} ${schemaToTypeScript(tool.parameters)}\n`;
      doc += '```\n';
    }
    doc += '</tool>\n\n';
  }
  return doc;
}

/**
 * Converts a JSON schema to a TypeScript interface-like string.
 */
export function schemaToTypeScript(schema: Schema, indent = ''): string {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const type = (schema.type as string) || 'any';
  if (
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    schema.type === (Type.OBJECT as unknown as string) ||
    schema.type === Type.OBJECT
  ) {
    let ts = '{\n';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const properties =
      ((schema.properties as unknown) as Record<string, unknown>) || {};
    for (const [name, propRaw] of Object.entries(properties)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const prop = propRaw as Schema;
      const isRequired = schema.required?.includes(name);
      if (prop.description) {
        ts += `${indent}  /** ${prop.description.replace(/\n/g, ' ')} */\n`;
      }
      const optional = isRequired ? '' : '?';
      ts += `${indent}  ${name}${optional}: ${schemaToTypeScript(
        prop,
        indent + '  ',
      )};${isRequired ? ' // REQUIRED' : ''}\n`;
    }
    ts += `${indent}}`;
    return ts;
  } else if (
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    schema.type === (Type.ARRAY as unknown as string) ||
    schema.type === Type.ARRAY
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const items = schema.items as Schema;
    return `${schemaToTypeScript(items, indent)}[]`;
  } else {
    return type;
  }
}

/**
 * The single `execute` function declaration used when dynamic tools experiment is active.
 */
export const EXECUTE_FUNCTION_DECLARATION: FunctionDeclaration = {
  name: 'execute',
  description:
    'Executes a tool by its name. Check the <tools> documentation in the system prompt for available tools and their arguments.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: {
        type: Type.STRING,
        description: 'The name of the tool to execute.',
      },
      args: {
        type: Type.OBJECT,
        description: 'The arguments for the tool.',
      },
    },
    required: ['name', 'args'],
  },
};

/**
 * Wraps a direct tool call into the `execute` pattern.
 * This is used to recover when the model calls a tool directly despite instructions.
 */
export function wrapAsExecute(
  name: string,
  args: unknown,
): {
  name: string;
  args: { name: string; args: unknown };
} {
  return {
    name: 'execute',
    args: {
      name,
      args,
    },
  };
}

/**
 * Unwraps the arguments for an `execute` call, applying resilient parameter mapping
 * to help the model succeed during the documentation-only tools experiment.
 */
export function unwrapExecuteArgs(args: unknown): {
  name: string;
  args: Record<string, unknown>;
} | null {
  if (typeof args !== 'object' || args === null) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-type-assertion
  const name = (args as any).name;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-type-assertion
  let innerArgs = (args as any).args;

  if (typeof name !== 'string' || !innerArgs || typeof innerArgs !== 'object') {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  innerArgs = { ...innerArgs };

  // Resilient parameter mapping for common model hallucinations/priors
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const anyArgs: any = innerArgs;
  if (name === 'read_file' && anyArgs.path && !anyArgs.file_path) {
    debugLogger.log(`[DynamicTools] Mapping path -> file_path for read_file: ${anyArgs.path}`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    anyArgs.file_path = anyArgs.path;
  }
  if (
    (name === 'list_directory' || name === 'grep_search' || name === 'glob') &&
    anyArgs.path &&
    !anyArgs.dir_path
  ) {
    debugLogger.log(`[DynamicTools] Mapping path -> dir_path for ${name}: ${anyArgs.path}`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    anyArgs.dir_path = anyArgs.path;
  }

  return {
    name,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    args: innerArgs as Record<string, unknown>,
  };
}
