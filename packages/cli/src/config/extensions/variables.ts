/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { type VariableSchema, VARIABLE_SCHEMA } from './variableSchema.js';
import { GEMINI_DIR } from '@google/gemini-cli-core';

export const EXTENSIONS_DIRECTORY_NAME = path.join(GEMINI_DIR, 'extensions');
export const EXTENSIONS_CONFIG_FILENAME = 'gemini-extension.json';
export const INSTALL_METADATA_FILENAME = '.gemini-extension-install.json';
export const EXTENSION_SETTINGS_FILENAME = '.env';

export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonArray;

export type VariableContext = {
  [key: string]: string | undefined;
};

export function validateVariables(
  variables: VariableContext,
  schema: VariableSchema,
) {
  for (const key in schema) {
    const definition = schema[key];
    if (definition.required && !variables[key]) {
      throw new Error(`Missing required variable: ${key}`);
    }
  }
}

export function hydrateString(str: string, context: VariableContext): string {
  validateVariables(context, VARIABLE_SCHEMA);
  const regex = /\${(.*?)}/g;
  return str.replace(regex, (match, key) =>
    context[key] == null ? match : context[key],
  );
}

export function recursivelyHydrateStrings<T>(
  obj: T,
  values: VariableContext,
): T {
  if (typeof obj === 'string') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return hydrateString(obj, values) as unknown as T;
  }
  if (Array.isArray(obj)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return obj.map((item) =>
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      recursivelyHydrateStrings(item, values),
    ) as unknown as T;
  }
  if (typeof obj === 'object' && obj !== null) {
    const newObj: Record<string, unknown> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = recursivelyHydrateStrings(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          (obj as Record<string, unknown>)[key],
          values,
        );
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return newObj as T;
  }
  return obj;
}
