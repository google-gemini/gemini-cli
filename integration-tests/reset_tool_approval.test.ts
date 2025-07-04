/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from 'chai';
import { promises as fs } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const USER_SETTINGS_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '',
  '.gemini',
);
const USER_SETTINGS_PATH = path.join(USER_SETTINGS_DIR, 'settings.json');

describe('reset-tool-approvals integration test', () => {
  let originalSettingsContent: string | undefined;

  beforeEach(async () => {
    // Backup original settings.json if it exists
    if (
      await fs
        .access(USER_SETTINGS_PATH)
        .then(() => true)
        .catch(() => false)
    ) {
      originalSettingsContent = await fs.readFile(USER_SETTINGS_PATH, 'utf-8');
    } else {
      originalSettingsContent = undefined;
    }

    // Ensure the directory exists
    await fs.mkdir(USER_SETTINGS_DIR, { recursive: true });

    // Set initial settings for the test
    const testSettings = {
      theme: 'Default',
      selectedAuthType: 'oauth-personal',
      autoApprovedTools: ['shell', 'git'],
    };
    await fs.writeFile(
      USER_SETTINGS_PATH,
      JSON.stringify(testSettings, null, 2),
      'utf-8',
    );
  });

  afterEach(async () => {
    // Restore original settings.json or remove the test file
    if (originalSettingsContent !== undefined) {
      await fs.writeFile(USER_SETTINGS_PATH, originalSettingsContent, 'utf-8');
    } else {
      await fs.unlink(USER_SETTINGS_PATH).catch(() => {}); // Ignore if file doesn't exist
    }
  });

  it('should reset autoApprovedTools to an empty array', async () => {
    // Run the CLI command
    const cliPath = path.resolve(__dirname, '../bundle/gemini.js'); // Adjust path as needed
    const command = `node ${cliPath} --reset-tool-approvals`;

    const { stderr } = await execAsync(command);

    // Verify output
    expect(stderr).to.include('Successfully reset all tool auto-approvals.');

    // Verify settings.json content
    const updatedSettingsContent = await fs.readFile(
      USER_SETTINGS_PATH,
      'utf-8',
    );
    const updatedSettings = JSON.parse(updatedSettingsContent);
    expect(updatedSettings.autoApprovedTools).to.deep.equal([]);
  }).timeout(10000); // Increase timeout for CLI execution
});
