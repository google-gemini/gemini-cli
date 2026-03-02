/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ExtensionManager } from './extension-manager.js';
import { ExtensionStorage } from './extensions/storage.js';
import {
  TrustLevel,
  loadTrustedFolders,
  isWorkspaceTrusted,
} from './trustedFolders.js';
import { getRealPath } from '@google/gemini-cli-core';
import type { MergedSettings } from './settings.js';

describe('ExtensionManager symlink handling', () => {
  let tmpDir: string;
  let workspaceDir: string;
  let homeDir: string;
  let extensionDir: string;
  let symlinkDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-test-'));
    workspaceDir = path.join(tmpDir, 'workspace');
    homeDir = path.join(tmpDir, 'home');
    extensionDir = path.join(tmpDir, 'extension');
    symlinkDir = path.join(tmpDir, 'symlink-ext');

    fs.mkdirSync(workspaceDir);
    fs.mkdirSync(homeDir);
    fs.mkdirSync(extensionDir);

    fs.writeFileSync(
      path.join(extensionDir, 'gemini-extension.json'),
      JSON.stringify({ name: 'test-ext', version: '1.0.0' }),
    );

    fs.symlinkSync(extensionDir, symlinkDir);

    vi.stubEnv('GEMINI_CLI_HOME', homeDir);
    const userExtensionsDir = path.join(homeDir, '.gemini', 'extensions');
    fs.mkdirSync(userExtensionsDir, { recursive: true });

    // Mock user extensions dir to be inside our tmp home
    vi.spyOn(ExtensionStorage, 'getUserExtensionsDir').mockReturnValue(
      userExtensionsDir,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('preserves symlinks in installMetadata.source when linking', async () => {
    const manager = new ExtensionManager({
      workspaceDir,
      settings: {
        security: {
          folderTrust: { enabled: false }, // Disable trust for simplicity in this test
        },
        experimental: { extensionConfig: false },
        admin: { extensions: { enabled: true }, mcp: { enabled: true } },
        hooksConfig: { enabled: true },
      } as unknown as MergedSettings,
      requestConsent: () => Promise.resolve(true),
      requestSetting: null,
    });

    // Trust the workspace to allow installation
    const trustedFolders = loadTrustedFolders();
    await trustedFolders.setValue(workspaceDir, TrustLevel.TRUST_FOLDER);

    const installMetadata = {
      source: symlinkDir,
      type: 'link' as const,
    };

    await manager.loadExtensions();
    const extension = await manager.installOrUpdateExtension(installMetadata);

    // Desired behavior: it preserves symlinks (if they were absolute or relative as provided)
    expect(extension.installMetadata?.source).toBe(symlinkDir);
  });

  it('works with the new install command logic (preserves symlink but trusts real path)', async () => {
    // This simulates the logic in packages/cli/src/commands/extensions/install.ts
    const absolutePath = path.resolve(symlinkDir);
    const realPath = getRealPath(absolutePath);

    const settings = {
      security: {
        folderTrust: { enabled: true },
      },
      experimental: { extensionConfig: false },
      admin: { extensions: { enabled: true }, mcp: { enabled: true } },
      hooksConfig: { enabled: true },
    } as unknown as MergedSettings;

    // Trust the REAL path
    const trustedFolders = loadTrustedFolders();
    await trustedFolders.setValue(realPath, TrustLevel.TRUST_FOLDER);

    // Check trust of the symlink path
    const trustResult = isWorkspaceTrusted(settings, absolutePath);
    expect(trustResult.isTrusted).toBe(true);

    const manager = new ExtensionManager({
      workspaceDir,
      settings,
      requestConsent: () => Promise.resolve(true),
      requestSetting: null,
    });

    const installMetadata = {
      source: absolutePath,
      type: 'link' as const,
    };

    await manager.loadExtensions();
    const extension = await manager.installOrUpdateExtension(installMetadata);

    expect(extension.installMetadata?.source).toBe(absolutePath);
    expect(extension.installMetadata?.source).not.toBe(realPath);
  });
});
