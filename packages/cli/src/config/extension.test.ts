/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  EXTENSIONS_CONFIG_FILENAME,
  EXTENSIONS_DIRECTORY_NAME,
  annotateActiveExtensions,
  loadExtensions,
} from './extension.js';

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>();
  return {
    ...os,
    homedir: vi.fn(),
  };
});

describe('loadExtensions', () => {
  let tempWorkspaceDir: string;
  let tempHomeDir: string;

  beforeEach(() => {
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-workspace-'),
    );
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
  });

  afterEach(() => {
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  });

  it('should include extension path in loaded extension', () => {
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });

    const extensionDir = path.join(workspaceExtensionsDir, 'test-extension');
    fs.mkdirSync(extensionDir, { recursive: true });

    const config = {
      name: 'test-extension',
      version: '1.0.0',
    };
    fs.writeFileSync(
      path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME),
      JSON.stringify(config),
    );

    const extensions = loadExtensions(tempWorkspaceDir);
    expect(extensions).toHaveLength(1);
    expect(extensions[0].path).toBe(extensionDir);
    expect(extensions[0].config.name).toBe('test-extension');
  });

  it('should load context file path when GEMINI.md is present', () => {
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });
    createExtension(workspaceExtensionsDir, 'ext1', '1.0.0', true);
    createExtension(workspaceExtensionsDir, 'ext2', '2.0.0');

    const extensions = loadExtensions(tempWorkspaceDir);

    expect(extensions).toHaveLength(2);
    const ext1 = extensions.find((e) => e.config.name === 'ext1');
    const ext2 = extensions.find((e) => e.config.name === 'ext2');
    expect(ext1?.contextFiles).toEqual([
      path.join(workspaceExtensionsDir, 'ext1', 'GEMINI.md'),
    ]);
    expect(ext2?.contextFiles).toEqual([]);
  });

  it('should load context file path from the extension config', () => {
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });
    createExtension(
      workspaceExtensionsDir,
      'ext1',
      '1.0.0',
      false,
      'my-context-file.md',
    );

    const extensions = loadExtensions(tempWorkspaceDir);

    expect(extensions).toHaveLength(1);
    const ext1 = extensions.find((e) => e.config.name === 'ext1');
    expect(ext1?.contextFiles).toEqual([
      path.join(workspaceExtensionsDir, 'ext1', 'my-context-file.md'),
    ]);
  });

  it('should resolve environment variables in extension configuration', () => {
    process.env.TEST_API_KEY = 'test-api-key-123';
    process.env.TEST_DB_URL = 'postgresql://localhost:5432/testdb';

    try {
      const workspaceExtensionsDir = path.join(
        tempWorkspaceDir,
        EXTENSIONS_DIRECTORY_NAME,
      );
      fs.mkdirSync(workspaceExtensionsDir, { recursive: true });

      const extDir = path.join(workspaceExtensionsDir, 'test-extension');
      fs.mkdirSync(extDir);

      // Write config to a separate file for clarity and good practices
      const configPath = path.join(extDir, EXTENSIONS_CONFIG_FILENAME);
      const extensionConfig = {
        name: 'test-extension',
        version: '1.0.0',
        mcpServers: {
          'test-server': {
            command: 'node',
            args: ['server.js'],
            env: {
              API_KEY: '$TEST_API_KEY',
              DATABASE_URL: '${TEST_DB_URL}',
              STATIC_VALUE: 'no-substitution',
            },
          },
        },
      };
      fs.writeFileSync(configPath, JSON.stringify(extensionConfig));

      const extensions = loadExtensions(tempWorkspaceDir);

      expect(extensions).toHaveLength(1);
      const extension = extensions[0];
      expect(extension.config.name).toBe('test-extension');
      expect(extension.config.mcpServers).toBeDefined();

      const serverConfig = extension.config.mcpServers?.['test-server'];
      expect(serverConfig).toBeDefined();
      expect(serverConfig?.env).toBeDefined();
      expect(serverConfig?.env?.API_KEY).toBe('test-api-key-123');
      expect(serverConfig?.env?.DATABASE_URL).toBe(
        'postgresql://localhost:5432/testdb',
      );
      expect(serverConfig?.env?.STATIC_VALUE).toBe('no-substitution');
    } finally {
      delete process.env.TEST_API_KEY;
      delete process.env.TEST_DB_URL;
    }
  });

  it('should handle missing environment variables gracefully', () => {
    const workspaceExtensionsDir = path.join(
      tempWorkspaceDir,
      EXTENSIONS_DIRECTORY_NAME,
    );
    fs.mkdirSync(workspaceExtensionsDir, { recursive: true });

    const extDir = path.join(workspaceExtensionsDir, 'test-extension');
    fs.mkdirSync(extDir);

    const extensionConfig = {
      name: 'test-extension',
      version: '1.0.0',
      mcpServers: {
        'test-server': {
          command: 'node',
          args: ['server.js'],
          env: {
            MISSING_VAR: '$UNDEFINED_ENV_VAR',
            MISSING_VAR_BRACES: '${ALSO_UNDEFINED}',
          },
        },
      },
    };

    fs.writeFileSync(
      path.join(extDir, EXTENSIONS_CONFIG_FILENAME),
      JSON.stringify(extensionConfig),
    );

    const extensions = loadExtensions(tempWorkspaceDir);

    expect(extensions).toHaveLength(1);
    const extension = extensions[0];
    const serverConfig = extension.config.mcpServers!['test-server'];
    expect(serverConfig.env).toBeDefined();
    expect(serverConfig.env!.MISSING_VAR).toBe('$UNDEFINED_ENV_VAR');
    expect(serverConfig.env!.MISSING_VAR_BRACES).toBe('${ALSO_UNDEFINED}');
  });
});

describe('annotateActiveExtensions', () => {
  const extensions = [
    { config: { name: 'ext1', version: '1.0.0' }, contextFiles: [] },
    { config: { name: 'ext2', version: '1.0.0' }, contextFiles: [] },
    { config: { name: 'ext3', version: '1.0.0' }, contextFiles: [] },
  ];

  it('should mark all extensions as active if no enabled extensions are provided', () => {
    const activeExtensions = annotateActiveExtensions(extensions, []);
    expect(activeExtensions).toHaveLength(3);
    expect(activeExtensions.every((e) => e.isActive)).toBe(true);
  });

  it('should mark only the enabled extensions as active', () => {
    const activeExtensions = annotateActiveExtensions(extensions, [
      'ext1',
      'ext3',
    ]);
    expect(activeExtensions).toHaveLength(3);
    expect(activeExtensions.find((e) => e.name === 'ext1')?.isActive).toBe(
      true,
    );
    expect(activeExtensions.find((e) => e.name === 'ext2')?.isActive).toBe(
      false,
    );
    expect(activeExtensions.find((e) => e.name === 'ext3')?.isActive).toBe(
      true,
    );
  });

  it('should mark all extensions as inactive when "none" is provided', () => {
    const activeExtensions = annotateActiveExtensions(extensions, ['none']);
    expect(activeExtensions).toHaveLength(3);
    expect(activeExtensions.every((e) => !e.isActive)).toBe(true);
  });

  it('should handle case-insensitivity', () => {
    const activeExtensions = annotateActiveExtensions(extensions, ['EXT1']);
    expect(activeExtensions.find((e) => e.name === 'ext1')?.isActive).toBe(
      true,
    );
  });

  it('should log an error for unknown extensions', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    annotateActiveExtensions(extensions, ['ext4']);
    expect(consoleSpy).toHaveBeenCalledWith('Extension not found: ext4');
    consoleSpy.mockRestore();
  });
});

function createExtension(
  extensionsDir: string,
  name: string,
  version: string,
  addContextFile = false,
  contextFileName?: string,
): void {
  const extDir = path.join(extensionsDir, name);
  fs.mkdirSync(extDir);
  fs.writeFileSync(
    path.join(extDir, EXTENSIONS_CONFIG_FILENAME),
    JSON.stringify({ name, version, contextFileName }),
  );

  if (addContextFile) {
    fs.writeFileSync(path.join(extDir, 'GEMINI.md'), 'context');
  }

  if (contextFileName) {
    fs.writeFileSync(path.join(extDir, contextFileName), 'context');
  }
}
