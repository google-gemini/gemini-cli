/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

import type { KeyBinding } from '../packages/cli/src/config/keyBindings.js';
import {
  commandCategories,
  commandDescriptions,
  defaultKeyBindings,
} from '../packages/cli/src/config/keyBindings.js';
import {
  formatWithPrettier,
  injectBetweenMarkers,
  normalizeForCompare,
} from './utils/autogen.js';

const START_MARKER = '<!-- KEYBINDINGS-AUTOGEN:START -->';
const END_MARKER = '<!-- KEYBINDINGS-AUTOGEN:END -->';
const OUTPUT_RELATIVE_PATH = ['docs', 'reference', 'keyboard-shortcuts.md'];

const KEY_NAME_OVERRIDES: Record<string, string> = {
  return: 'Enter',
  escape: 'Esc',
  'double escape': 'Double Esc',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  up: 'Up Arrow',
  down: 'Down Arrow',
  left: 'Left Arrow',
  right: 'Right Arrow',
  home: 'Home',
  end: 'End',
  pageup: 'Page Up',
  pagedown: 'Page Down',
  clear: 'Clear',
  insert: 'Insert',
  f1: 'F1',
  f2: 'F2',
  f3: 'F3',
  f4: 'F4',
  f5: 'F5',
  f6: 'F6',
  f7: 'F7',
  f8: 'F8',
  f9: 'F9',
  f10: 'F10',
  f11: 'F11',
  f12: 'F12',
};

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
    const label = formatBinding(binding);
    if (label && !seen.has(label)) {
      seen.add(label);
      results.push(label);
    }
  }

  return results;
}

function formatBinding(binding: KeyBinding): string {
  const modifiers: string[] = [];
  if (binding.shift) modifiers.push('Shift');
  if (binding.alt) modifiers.push('Alt');
  if (binding.ctrl) modifiers.push('Ctrl');
  if (binding.cmd) modifiers.push('Cmd');

  const keyName = formatKeyName(binding.key);
  if (!keyName) {
    return '';
  }

  const segments = [...modifiers, keyName].filter(Boolean);
  let combo = segments.join(' + ');

  const restrictions: string[] = [];
  if (binding.shift === false) restrictions.push('Shift');
  if (binding.alt === false) restrictions.push('Alt');
  if (binding.ctrl === false) restrictions.push('Ctrl');
  if (binding.cmd === false) restrictions.push('Cmd');

  if (restrictions.length > 0) {
    combo = `${combo} (no ${restrictions.join(', ')})`;
  }

  return combo ? `\`${combo}\`` : '';
}

function formatKeyName(key: string): string {
  const normalized = key.toLowerCase();
  if (KEY_NAME_OVERRIDES[normalized]) {
    return KEY_NAME_OVERRIDES[normalized];
  }
  return key.length === 1 ? key.toUpperCase() : key;
}

if (process.argv[1]) {
  const entryUrl = pathToFileURL(path.resolve(process.argv[1])).href;
  if (entryUrl === import.meta.url) {
    await main();
  }
}
