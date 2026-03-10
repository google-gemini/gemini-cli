/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

import type { KeyBinding } from '../packages/cli/src/ui/key/keyBindings.js';
import {
  commandCategories,
  commandDescriptions,
  defaultKeyBindings,
} from '../packages/cli/src/ui/key/keyBindings.js';
import {
  formatWithPrettier,
  injectBetweenMarkers,
  normalizeForCompare,
} from './utils/autogen.js';

const START_MARKER = '<!-- KEYBINDINGS-AUTOGEN:START -->';
const END_MARKER = '<!-- KEYBINDINGS-AUTOGEN:END -->';
const OUTPUT_RELATIVE_PATH = ['docs', 'reference', 'keyboard-shortcuts.md'];

import { formatKeyBinding } from '../packages/cli/src/ui/key/keybindingUtils.js';

export interface KeybindingDocCommand {
  description: string;
  bindings: readonly KeyBinding[];
}

export interface KeybindingDocSection {
  title: string;
  commands: readonly KeybindingDocCommand[];
}

export async function main(argv = process.argv.slice(2)) {
  const checkOnly = argv.includes('--check');

  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const docPath = path.join(repoRoot, ...OUTPUT_RELATIVE_PATH);

  const sections = buildDefaultDocSections();
  const generatedBlock = renderDocumentation(sections);
  const currentDoc = await readFile(docPath, 'utf8');
  const injectedDoc = injectBetweenMarkers({
    document: currentDoc,
    startMarker: START_MARKER,
    endMarker: END_MARKER,
    newContent: generatedBlock,
    paddingBefore: '\n\n',
    paddingAfter: '\n',
  });
  const updatedDoc = await formatWithPrettier(injectedDoc, docPath);

  if (normalizeForCompare(updatedDoc) === normalizeForCompare(currentDoc)) {
    if (!checkOnly) {
      console.log('Keybinding documentation already up to date.');
    }
    return;
  }

  if (checkOnly) {
    console.error(
      'Keybinding documentation is out of date. Run `npm run docs:keybindings` to regenerate.',
    );
    process.exitCode = 1;
    return;
  }

  await writeFile(docPath, updatedDoc, 'utf8');
  console.log('Keybinding documentation regenerated.');
}

export function buildDefaultDocSections(): readonly KeybindingDocSection[] {
  return commandCategories.map((category) => ({
    title: category.title,
    commands: category.commands.map((command) => ({
      description: commandDescriptions[command],
      bindings: defaultKeyBindings[command],
    })),
  }));
}

export function renderDocumentation(
  sections: readonly KeybindingDocSection[],
): string {
  const renderedSections = sections.map((section) => {
    const rows = section.commands.map((command) => {
      const formattedBindings = formatBindings(command.bindings);
      const keysCell = formattedBindings.join('<br />');
      return `| ${command.description} | ${keysCell} |`;
    });

    return [
      `#### ${section.title}`,
      '',
      '| Action | Keys |',
      '| --- | --- |',
      ...rows,
    ].join('\n');
  });

  return renderedSections.join('\n\n');
}

function formatBindings(bindings: readonly KeyBinding[]): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const binding of bindings) {
    const label = formatKeyBinding(binding, 'default');
    if (label && !seen.has(label)) {
      seen.add(label);
      results.push(`\`${label}\``);
    }
  }

  return results;
}

if (process.argv[1]) {
  const entryUrl = pathToFileURL(path.resolve(process.argv[1])).href;
  if (entryUrl === import.meta.url) {
    await main();
  }
}
