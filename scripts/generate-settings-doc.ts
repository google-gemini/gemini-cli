/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { generateSettingsSchema } from './generate-settings-schema.js';
import {
  escapeBackticks,
  formatDefaultValue,
  formatWithPrettier,
  normalizeForCompare,
} from './utils/autogen.js';

import type {
  SettingDefinition,
  SettingsSchema,
  SettingsSchemaType,
} from '../packages/cli/src/config/settingsSchema.js';

const START_MARKER = '<!-- SETTINGS-AUTOGEN:START -->';
const END_MARKER = '<!-- SETTINGS-AUTOGEN:END -->';

const MANUAL_TOP_LEVEL = new Set(['mcpServers', 'telemetry', 'extensions']);

interface DocEntry {
  path: string;
  type: string;
  description: string;
  defaultValue: string;
  requiresRestart: boolean;
  enumValues?: string[];
}

export async function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes('--check');

  await generateSettingsSchema({ checkOnly });

  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const docPath = path.join(repoRoot, 'docs/get-started/configuration.md');

  const { getSettingsSchema } = await loadSettingsSchemaModule();
  const schema = getSettingsSchema();
  const sections = collectEntries(schema);
  const generatedBlock = renderSections(sections);

  const doc = await readFile(docPath, 'utf8');
  const startIndex = doc.indexOf(START_MARKER);
  const endIndex = doc.indexOf(END_MARKER);

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    throw new Error(
      `Could not locate documentation markers (${START_MARKER}, ${END_MARKER}).`,
    );
  }

  const before = doc.slice(0, startIndex + START_MARKER.length);
  const after = doc.slice(endIndex);
  const formattedDoc = await formatWithPrettier(
    `${before}\n${generatedBlock}\n${after}`,
    docPath,
  );

  if (normalizeForCompare(doc) === normalizeForCompare(formattedDoc)) {
    if (!checkOnly) {
      console.log('Settings documentation already up to date.');
    }
    return;
  }

  if (checkOnly) {
    console.error(
      'Settings documentation is out of date. Run `npm run docs:settings` to regenerate.',
    );
    process.exitCode = 1;
    return;
  }

  await writeFile(docPath, formattedDoc);
  console.log('Settings documentation regenerated.');
}

async function loadSettingsSchemaModule() {
  const modulePath = '../packages/cli/src/config/settingsSchema.ts';
  return import(modulePath);
}

function collectEntries(schema: SettingsSchemaType) {
  const sections = new Map<string, DocEntry[]>();

  const visit = (
    current: SettingsSchema,
    pathSegments: string[],
    topLevel?: string,
  ) => {
    for (const [key, definition] of Object.entries(current)) {
      if (pathSegments.length === 0 && MANUAL_TOP_LEVEL.has(key)) {
        continue;
      }

      const newPathSegments = [...pathSegments, key];
      const sectionKey = topLevel ?? key;
      const hasChildren =
        definition.type === 'object' &&
        definition.properties &&
        Object.keys(definition.properties).length > 0;

      if (!hasChildren) {
        if (!sections.has(sectionKey)) {
          sections.set(sectionKey, []);
        }

        sections.get(sectionKey)!.push({
          path: newPathSegments.join('.'),
          type: formatType(definition),
          description: formatDescription(definition),
          defaultValue: formatDefaultValue(definition.default, {
            quoteStrings: true,
          }),
          requiresRestart: Boolean(definition.requiresRestart),
          enumValues: definition.options?.map((option) =>
            formatDefaultValue(option.value, { quoteStrings: true }),
          ),
        });
      }

      if (hasChildren && definition.properties) {
        visit(definition.properties, newPathSegments, sectionKey);
      }
    }
  };

  visit(schema, []);
  return sections;
}

function formatDescription(definition: SettingDefinition) {
  if (definition.description?.trim()) {
    return definition.description.trim();
  }
  return 'Description not provided.';
}

function formatType(definition: SettingDefinition): string {
  switch (definition.ref) {
    case 'StringOrStringArray':
      return 'string | string[]';
    case 'BooleanOrString':
      return 'boolean | string';
    default:
      return definition.type;
  }
}

function renderSections(sections: Map<string, DocEntry[]>) {
  const lines: string[] = [];

  for (const [section, entries] of sections) {
    if (entries.length === 0) {
      continue;
    }

    lines.push(`#### \`${section}\``);
    lines.push('');

    for (const entry of entries) {
      lines.push(`- **\`${entry.path}\`** (${entry.type}):`);
      lines.push(`  - **Description:** ${entry.description}`);
      lines.push(`  - **Default:** \`${escapeBackticks(entry.defaultValue)}\``);

      if (entry.enumValues && entry.enumValues.length > 0) {
        const values = entry.enumValues
          .map((value) => `\`${escapeBackticks(value)}\``)
          .join(', ');
        lines.push(`  - **Values:** ${values}`);
      }

      if (entry.requiresRestart) {
        lines.push('  - **Requires restart:** Yes');
      }

      lines.push('');
    }
  }

  return lines.join('\n').trimEnd();
}

if (process.argv[1]) {
  const entryUrl = pathToFileURL(path.resolve(process.argv[1])).href;
  if (entryUrl === import.meta.url) {
    await main();
  }
}
