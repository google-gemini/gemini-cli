/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadExtensions } from './extension.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('loadExtensions', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop();
      if (tempDir) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
    vi.unstubAllEnvs();
  });

  it('loads user extensions from the selected XDG config dir', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a2a-extension-'));
    tempDirs.push(tempRoot);

    const homeDir = path.join(tempRoot, 'home');
    const xdgConfigHome = path.join(homeDir, '.config');
    const workspaceDir = path.join(tempRoot, 'workspace');
    const userExtensionDir = path.join(
      xdgConfigHome,
      'gemini-cli',
      'extensions',
      'demo-extension',
    );

    vi.stubEnv('HOME', homeDir);
    vi.stubEnv('XDG_CONFIG_HOME', xdgConfigHome);
    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(userExtensionDir, { recursive: true });
    fs.writeFileSync(
      path.join(userExtensionDir, 'gemini-extension.json'),
      JSON.stringify({ name: 'demo-extension', version: '1.0.0' }),
    );

    const extensions = loadExtensions(workspaceDir);

    expect(extensions).toHaveLength(1);
    expect(extensions[0]?.name).toBe('demo-extension');
    expect(extensions[0]?.path).toBe(userExtensionDir);
  });
});
