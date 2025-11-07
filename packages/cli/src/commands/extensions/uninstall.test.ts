/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleUninstall, uninstallCommand } from './uninstall.js';
import yargs from 'yargs';
import { vol, fs } from 'memfs';
import os from 'node:os';
import path from 'node:path';
import {
  EXTENSION_CONFIG_FILENAME,
  INSTALL_METADATA_FILENAME,
} from '../../config/extensions/variables.js';

vi.mock('node:fs', () => fs);
vi.mock('node:fs/promises', () => fs.promises);

describe('extensions uninstall command', () => {
  beforeEach(() => {
    vol.reset();
  });

  it('should fail if no source is provided', () => {
    const validationParser = yargs([])
      .command(uninstallCommand)
      .fail(false)
      .locale('en');
    expect(() => validationParser.parse('uninstall')).toThrow(
      'Not enough non-option arguments: got 0, need at least 1',
    );
  });

  it('should remove a manually installed extension', async () => {
    const extensionName = 'my-manual-extension';
    const extensionsDir = path.join(
      os.homedir(),
      '.gemini',
      'extensions',
      extensionName,
    );
    const extensionConfig = {
      name: extensionName,
      version: '0.0.1',
    };
    vol.fromJSON({
      [path.join(extensionsDir, EXTENSION_CONFIG_FILENAME)]:
        JSON.stringify(extensionConfig),
      [path.join(extensionsDir, INSTALL_METADATA_FILENAME)]:
        '{ "type": "local", "source": "whatever"}',
    });

    await handleUninstall({ name: extensionName });

    expect(fs.existsSync(extensionsDir)).toBe(false);
  });
});
