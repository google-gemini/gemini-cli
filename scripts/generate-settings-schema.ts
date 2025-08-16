/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  SETTINGS_SCHEMA,
  SettingDefinition,
  SettingsSchema,
} from '../packages/cli/src/config/settingsSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function transformDefinitionToSchema(definition: SettingDefinition) {
  const schemaProperty: Record<string, unknown> = {
    description: definition.description,
    title: definition.label,
  };

  if (definition.default !== undefined) {
    schemaProperty.default = definition.default;
  }

  if (definition.type === 'object') {
    schemaProperty.type = 'object';
    if (definition.properties) {
      schemaProperty.properties = transformSchema(definition.properties);
    } else if (definition.valueSchema) {
      schemaProperty.additionalProperties = {
        type: 'object',
        properties: transformSchema(definition.valueSchema),
      };
    } else {
      // Allows for Record<string, T> types like customThemes
      schemaProperty.additionalProperties = true;
    }
  } else if (definition.type === 'array') {
    schemaProperty.type = 'array';
    if (Array.isArray(definition.default) && definition.default.length > 0) {
      const itemType = typeof definition.default[0];
      if (['string', 'number', 'boolean'].includes(itemType)) {
        schemaProperty.items = { type: itemType };
      } else {
        schemaProperty.items = { type: 'object' };
      }
    } else {
      // Default for arrays where item type cannot be inferred from default value
      schemaProperty.items = { type: 'string' };
    }
  } else {
    schemaProperty.type = definition.type;
  }

  return schemaProperty;
}

function transformSchema(schema: SettingsSchema) {
  const properties: Record<string, unknown> = {};
  for (const [key, definition] of Object.entries(schema)) {
    properties[key] = transformDefinitionToSchema(definition);
  }
  return properties;
}

const generatedSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'Gemini CLI Settings',
  description:
    'Configuration settings for the Gemini CLI. See https://github.com/google/gemini-cli/blob/main/docs/cli/configuration.md for more details.',
  type: 'object',
  properties: transformSchema(SETTINGS_SCHEMA),
};

if (Object.keys(generatedSchema.properties).length === 0) {
  console.error(
    'Error: Settings schema generation resulted in an empty schema. This likely means that the input `SETTINGS_SCHEMA` was empty or invalid.',
  );
  process.exit(1);
}

const outputPath = path.join(
  rootDir,
  'packages',
  'cli',
  'settings.schema.json',
);
fs.writeFileSync(outputPath, JSON.stringify(generatedSchema, null, 2));

console.log(`JSON schema generated at ${outputPath}`);
