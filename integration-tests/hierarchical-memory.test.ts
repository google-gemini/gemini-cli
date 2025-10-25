/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'vitest';
import { TestRig, validateModelOutput } from './test-helper.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

describe('Hierarchical Memory Loading', () => {
  it('should load GEMINI.md from current working directory', async () => {
    const rig = new TestRig();
    await rig.setup('hierarchical-memory-cwd');

    const secret = 'CWD_SECRET_KEYWORD';
    rig.createFile('GEMINI.md', `Current directory secret: ${secret}`);

    const output = await rig.run(
      `What is the current directory secret? Return ONLY the secret keyword.`,
    );

    validateModelOutput(output, secret);

    await rig.cleanup();
  });

  it('should load GEMINI.md hierarchically from parent directories', async () => {
    const rig = new TestRig();
    await rig.setup('hierarchical-memory-parent');

    const rootSecret = 'ROOT_SECRET_KEYWORD';
    rig.createFile('GEMINI.md', `Root secret: ${rootSecret}`);

    const subdir = join(rig.testDir!, 'subdir');
    mkdirSync(subdir);
    const subdirSecret = 'SUBDIR_SECRET_KEYWORD';
    writeFileSync(join(subdir, 'GEMINI.md'), `Subdir secret: ${subdirSecret}`);

    // Run from subdir
    const output = await rig.run({
      prompt: `What are the root secret and subdir secret? Return them as a comma separated list.`,
      cwd: subdir,
    });

    validateModelOutput(output, [rootSecret, subdirSecret]);
  });

  it('should load GEMINI.md from installed extensions', async () => {
    const rig = new TestRig();
    await rig.setup('hierarchical-memory-extension');

    // 1. Create a dummy extension
    const extDir = join(rig.testDir!, 'my-extension');
    mkdirSync(extDir);

    const extensionManifest = {
      name: 'memory-extension',
      version: '1.0.0',
      description: 'Extension with memory',
      contextFiles: ['GEMINI.md'],
    };
    writeFileSync(
      join(extDir, 'gemini-extension.json'),
      JSON.stringify(extensionManifest),
    );

    const secret = 'SUPER_SECRET_MEMORY_KEYWORD';
    writeFileSync(join(extDir, 'GEMINI.md'), `Remember this secret: ${secret}`);

    // 2. Install the extension
    await rig.runCommand(['extensions', 'install', extDir], { stdin: 'y\n' });

    // 3. Run a prompt that requires this memory
    const output = await rig.run(
      `What is the secret in your memory? Return ONLY the secret keyword.`,
    );

    // 4. Verify it found the secret
    validateModelOutput(output, secret);

    await rig.cleanup();
  });

  it('should load multiple context files from extension', async () => {
    const rig = new TestRig();
    await rig.setup('hierarchical-memory-multi-file');

    const extDir = join(rig.testDir!, 'multi-file-ext');
    mkdirSync(extDir);

    const extensionManifest = {
      name: 'multi-file-ext',
      version: '1.0.0',
      contextFiles: ['context1.md', 'subdir/context2.md'],
    };
    writeFileSync(
      join(extDir, 'gemini-extension.json'),
      JSON.stringify(extensionManifest),
    );

    mkdirSync(join(extDir, 'subdir'));
    writeFileSync(join(extDir, 'context1.md'), 'Info 1: Apple');
    writeFileSync(join(extDir, 'subdir/context2.md'), 'Info 2: Banana');

    await rig.runCommand(['extensions', 'install', extDir], { stdin: 'y\n' });

    const output = await rig.run(
      `What are Info 1 and Info 2? Return them as a comma separated list, like: Item1, Item2`,
    );

    validateModelOutput(output, ['Apple', 'Banana']);

    await rig.cleanup();
  });
});
