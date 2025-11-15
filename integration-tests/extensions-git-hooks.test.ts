/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, test } from 'vitest';
import { TestRig } from './test-helper.js';
import { execSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const extensionManifest = (version: string) => `{
  "name": "git-hooks-test",
  "version": "${version}"
}`;

test(
  'git extension update enforces hook disablement',
  async () => {
    const rig = new TestRig();
    rig.setup('git hooks disabled during update');

    const repoDir = join(rig.testDir!, 'malicious-extension');
    const remoteRepo = join(rig.testDir!, 'malicious-extension.git');
    const hookLogPath = join(rig.testDir!, 'post-checkout.log');
    const repoUrl = 'https://example.com/test/git-hooks-test.git';

    mkdirSync(repoDir, { recursive: true });
    execSync('git init --initial-branch=main', { cwd: repoDir });
    execSync('git config user.email "test@example.com"', { cwd: repoDir });
    execSync('git config user.name "Gemini CLI Tests"', { cwd: repoDir });

    writeFileSync(
      join(repoDir, 'gemini-extension.json'),
      extensionManifest('0.0.1'),
    );
    mkdirSync(join(repoDir, 'hooks'), { recursive: true });
    writeFileSync(
      join(repoDir, 'hooks', 'post-checkout'),
      `#!/bin/sh
echo "post-checkout executed" >> "${hookLogPath}"
`,
    );
    chmodSync(join(repoDir, 'hooks', 'post-checkout'), 0o755);
    execSync('git add .', { cwd: repoDir });
    execSync('git commit -m "Initial extension version"', { cwd: repoDir });

    execSync(`git init --bare ${remoteRepo}`, { cwd: rig.testDir! });
    execSync(
      `git config --global url."${resolve(remoteRepo)}".insteadOf ${repoUrl}`,
      {
        cwd: rig.testDir!,
      },
    );
    execSync(`git remote add origin ${repoUrl}`, { cwd: repoDir });
    execSync('git push -u origin main', { cwd: repoDir });

    const templateDir = join(rig.testDir!, 'git-template');
    mkdirSync(join(templateDir, 'hooks'), { recursive: true });
    writeFileSync(
      join(templateDir, 'hooks', 'post-checkout'),
      `#!/bin/sh
echo "template post-checkout executed" >> "${hookLogPath}"
`,
    );
    chmodSync(join(templateDir, 'hooks', 'post-checkout'), 0o755);

    const extensionsDir = join(process.env['HOME']!, '.gemini', 'extensions');
    const extensionName = 'git-hooks-test';
    const extensionInstallDir = join(extensionsDir, extensionName);
    mkdirSync(extensionsDir, { recursive: true });

    const gitEnvWithoutTemplate = { ...process.env };
    delete gitEnvWithoutTemplate['GIT_TEMPLATE_DIR'];

    execSync(`git clone ${repoUrl} ${extensionInstallDir}`, {
      env: gitEnvWithoutTemplate,
    });
    writeFileSync(
      join(extensionInstallDir, '.gemini-extension-install.json'),
      JSON.stringify(
        {
          source: repoUrl,
          type: 'git',
        },
        null,
        2,
      ),
    );
    expect(existsSync(hookLogPath)).toBe(false);

    writeFileSync(
      join(repoDir, 'gemini-extension.json'),
      extensionManifest('0.0.2'),
    );
    execSync('git add gemini-extension.json', { cwd: repoDir });
    execSync('git commit -m "Release 0.0.2"', { cwd: repoDir });
    execSync('git push', { cwd: repoDir });

    if (existsSync(hookLogPath)) {
      unlinkSync(hookLogPath);
    }

    process.env['GIT_TEMPLATE_DIR'] = templateDir;

    const updateOutput = await rig.runCommand([
      'extensions',
      'update',
      extensionName,
    ]);
    expect(updateOutput).toContain(
      'Extension "git-hooks-test" successfully updated: 0.0.1 → 0.0.2.',
    );

    const gitConfigOutput = execSync('git config --get core.hooksPath', {
      cwd: extensionInstallDir,
    })
      .toString()
      .trim();
    expect(gitConfigOutput).toBe('hooks-disabled');
    expect(existsSync(join(extensionInstallDir, 'hooks-disabled'))).toBe(true);
    expect(existsSync(hookLogPath)).toBe(false);

    delete process.env['GIT_TEMPLATE_DIR'];

    await rig.cleanup();
  },
  { retry: 0 },
);
