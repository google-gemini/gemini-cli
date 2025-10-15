/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { access, cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import type { CommandModule } from 'yargs';
import { fileURLToPath } from 'node:url';
import { getErrorMessage } from '../../utils/errors.js';

interface NewArgs {
  path: string;
  template?: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXAMPLES_PATH = join(__dirname, 'examples');

async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch (_e) {
    return false;
  }
}

async function createDirectory(path: string) {
  if (await pathExists(path)) {
    throw new Error(`Path already exists: ${path}`);
  }
  await mkdir(path, { recursive: true });
}

async function copyDirectory(template: string, path: string) {
  await createDirectory(path);

  const examplePath = join(EXAMPLES_PATH, template);
  const entries = await readdir(examplePath, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(examplePath, entry.name);
    const destPath = join(path, entry.name);
    await cp(srcPath, destPath, { recursive: true });
  }
}

async function handleNew(args: NewArgs) {
  try {
    if (args.template) {
      await copyDirectory(args.template, args.path);
      console.log(
        `Successfully created new extension from template "${args.template}" at ${args.path}.`,
      );
    } else {
      await createDirectory(args.path);
      const extensionName = basename(args.path);
      const manifest = {
        name: extensionName,
        version: '1.0.0',
      };
      await writeFile(
        join(args.path, 'gemini-extension.json'),
        JSON.stringify(manifest, null, 2),
      );
      console.log(`Successfully created new extension at ${args.path}.`);
    }
    console.log(
      `You can install this using "gemini extensions link ${args.path}" to test it out.`,
    );
  } catch (error) {
    console.error(getErrorMessage(error));
    throw error;
  }
}

async function getBoilerplateChoices() {
  const entries = await readdir(EXAMPLES_PATH, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

export const newCommand: CommandModule = {
  command: 'new <path> [template]',
  describe: 'Create a new extension from a boilerplate example.',
  builder: async (yargs) => {
    const choices = await getBoilerplateChoices();
    return yargs
      .positional('path', {
        describe: 'The path to create the extension in.',
        type: 'string',
      })
      .positional('template', {
        describe: 'The boilerplate template to use.',
        type: 'string',
        choices,
      });
  },
  handler: async (args) => {
    await handleNew({
      path: args['path'] as string,
      template: args['template'] as string | undefined,
    });
  },
};
