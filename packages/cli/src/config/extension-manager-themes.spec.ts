/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createExtension } from '../test-utils/createExtension.js';
import { ExtensionManager } from './extension-manager.js';
import { themeManager } from '../ui/themes/theme-manager.js';
import {
  type CustomTheme,
  GEMINI_DIR,
  type Config,
} from '@google/gemini-cli-core';
import { createTestMergedSettings } from './settings.js';

vi.mock('../ui/themes/theme-manager.js', () => ({
  themeManager: {
    registerExtensionThemes: vi.fn(),
  },
}));

describe('ExtensionManager theme loading', () => {
  let extensionManager: ExtensionManager;
  let userExtensionsDir: string;
  let tempHomeDir: string;

  beforeAll(async () => {
    tempHomeDir = await fs.promises.mkdtemp(
      path.join(fs.realpathSync('/tmp'), 'gemini-cli-test-'),
    );
  });

  afterAll(async () => {
    if (tempHomeDir) {
      await fs.promises.rm(tempHomeDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    process.env['GEMINI_CLI_HOME'] = tempHomeDir;
    userExtensionsDir = path.join(tempHomeDir, GEMINI_DIR, 'extensions');
    // Ensure userExtensionsDir is clean for each test
    fs.rmSync(userExtensionsDir, { recursive: true, force: true });
    fs.mkdirSync(userExtensionsDir, { recursive: true });

    extensionManager = new ExtensionManager({
      settings: createTestMergedSettings({
        experimental: { extensionConfig: true },
        security: { blockGitExtensions: false },
        admin: { extensions: { enabled: true }, mcp: { enabled: true } },
        tools: { enableHooks: true },
      }),
      requestConsent: async () => true,
      requestSetting: async () => '',
      workspaceDir: tempHomeDir,
      enabledExtensionOverrides: [],
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env['GEMINI_CLI_HOME'];
  });

  it('should register themes from an extension when started', async () => {
    createExtension({
      extensionsDir: userExtensionsDir,
      name: 'my-theme-extension',
      themes: [
        {
          name: 'My-Awesome-Theme',
          type: 'custom',
          text: {
            primary: '#FF00FF',
          },
        },
      ],
    });

    await extensionManager.loadExtensions();

    const mockConfig = {
      getEnableExtensionReloading: () => false,
      getMcpClientManager: () => ({
        startExtension: vi.fn().mockResolvedValue(undefined),
      }),
      getGeminiClient: () => ({
        isInitialized: () => false,
      }),
      getHookSystem: () => undefined,
    } as unknown as Config;

    await extensionManager.start(mockConfig);

    expect(themeManager.registerExtensionThemes).toHaveBeenCalledWith(
      'my-theme-extension',
      [
        {
          name: 'My-Awesome-Theme',
          type: 'custom',
          text: {
            primary: '#FF00FF',
          },
        },
      ] as CustomTheme[],
    );
  });
});
