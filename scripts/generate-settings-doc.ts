/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

const START_MARKER = '<!-- SETTINGS-AUTOGEN:START -->';
const END_MARKER = '<!-- SETTINGS-AUTOGEN:END -->';

const MANUAL_TOP_LEVEL = new Set(['mcpServers', 'telemetry', 'extensions']);

type SettingsType =
  | 'boolean'
  | 'string'
  | 'number'
  | 'array'
  | 'object'
  | 'enum';

interface SettingDefinition {
  type: SettingsType;
  label: string;
  category: string;
  requiresRestart: boolean;
  default: SettingsValue;
  description?: string;
  parentKey?: string;
  childKey?: string;
  key?: string;
  properties?: SettingsSchema;
  showInDialog?: boolean;
  mergeStrategy?: string;
  options?: ReadonlyArray<{ value: string | number; label: string }>;
}

type SettingsValue = boolean | string | number | string[] | object | undefined;

interface SettingsSchema {
  [key: string]: SettingDefinition;
}

type SettingsSchemaType = SettingsSchema;

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

  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const docPath = path.join(repoRoot, 'docs/get-started/configuration.md');

  const { getSettingsSchema } = await loadSettingsSchemaModule(repoRoot);
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
  const nextDoc = `${before}\n${generatedBlock}\n${after}`;

  if (normalizeForCompare(doc) === normalizeForCompare(nextDoc)) {
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

  await writeFile(docPath, nextDoc);
  console.log('Settings documentation regenerated.');
}

async function loadSettingsSchemaModule(repoRoot: string) {
  const modulePath = '../packages/cli/src/config/settingsSchema.ts';
  try {
    return await import(modulePath);
  } catch (error) {
    if (
      isMissingCoreModule(error) ||
      isMissingWorkspaceBuild(error, '@google/gemini-cli')
    ) {
      await ensureWorkspaceBuilt(repoRoot, '@google/gemini-cli-core');
      await ensureWorkspaceBuilt(repoRoot, '@google/gemini-cli');
      return await import(modulePath);
    }
    throw error;
  }
}

function isMissingCoreModule(error: unknown) {
  return (
    isModuleNotFound(error) &&
    String((error as { message?: string }).message).includes(
      '@google/gemini-cli-core',
    )
  );
}

function isMissingWorkspaceBuild(error: unknown, workspace: string) {
  return (
    isModuleNotFound(error) &&
    String((error as { message?: string }).message).includes(workspace)
  );
}

function isModuleNotFound(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ERR_MODULE_NOT_FOUND',
  );
}

function ensureWorkspaceBuilt(repoRoot: string, workspace: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('npm', ['run', 'build', '--workspace', workspace], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env },
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Failed to build workspace ${workspace}`));
    });
  });
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
          type: definition.type,
          description: formatDescription(definition),
          defaultValue: formatDefault(definition.default),
          requiresRestart: Boolean(definition.requiresRestart),
          enumValues: definition.options?.map((option) =>
            formatDefault(option.value),
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

function formatDefault(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    return JSON.stringify(value);
  }

  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      if (json === '{}') {
        return '{}';
      }
      return json;
    } catch {
      return '[object Object]';
    }
  }

  return String(value);
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

function escapeBackticks(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

function normalizeForCompare(content: string): string {
  return content.replace(/\r\n/g, '\n').trimEnd();
}

if (process.argv[1]) {
  const entryUrl = pathToFileURL(path.resolve(process.argv[1])).href;
  if (entryUrl === import.meta.url) {
    await main();
  }
}
