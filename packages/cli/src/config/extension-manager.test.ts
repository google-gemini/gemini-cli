/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  ExtensionManager,
  resolveContextFilePaths,
  validateContextFilePath,
} from './extension-manager.js';
import { createTestMergedSettings, type MergedSettings } from './settings.js';
import { createExtension } from '../test-utils/createExtension.js';
import { EXTENSIONS_DIRECTORY_NAME } from './extensions/variables.js';
import { themeManager } from '../ui/themes/theme-manager.js';
import {
  TrustLevel,
  loadTrustedFolders,
  isWorkspaceTrusted,
} from './trustedFolders.js';
import {
  getRealPath,
  type CustomTheme,
  IntegrityDataStatus,
} from '@google/gemini-cli-core';

const mockHomedir = vi.hoisted(() => vi.fn(() => '/tmp/mock-home'));
const mockIntegrityManager = vi.hoisted(() => ({
  verify: vi.fn().mockResolvedValue('verified'),
  store: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('os', async (importOriginal) => {
  const mockedOs = await importOriginal<typeof os>();
  return {
    ...mockedOs,
    homedir: mockHomedir,
  };
});

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    homedir: mockHomedir,
    ExtensionIntegrityManager: vi
      .fn()
      .mockImplementation(() => mockIntegrityManager),
  };
});

const testTheme: CustomTheme = {
  type: 'custom',
  name: 'MyTheme',
  background: {
    primary: '#282828',
    diff: { added: '#2b3312', removed: '#341212' },
  },
  text: {
    primary: '#ebdbb2',
    secondary: '#a89984',
    link: '#83a598',
    accent: '#d3869b',
  },
  status: {
    success: '#b8bb26',
    warning: '#fabd2f',
    error: '#fb4934',
  },
};

describe('ExtensionManager', () => {
  let tempHomeDir: string;
  let tempWorkspaceDir: string;
  let userExtensionsDir: string;
  let extensionManager: ExtensionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    tempWorkspaceDir = fs.mkdtempSync(
      path.join(tempHomeDir, 'gemini-cli-test-workspace-'),
    );
    mockHomedir.mockReturnValue(tempHomeDir);
    userExtensionsDir = path.join(tempHomeDir, EXTENSIONS_DIRECTORY_NAME);
    fs.mkdirSync(userExtensionsDir, { recursive: true });

    extensionManager = new ExtensionManager({
      settings: createTestMergedSettings(),
      workspaceDir: tempWorkspaceDir,
      requestConsent: vi.fn().mockResolvedValue(true),
      requestSetting: null,
      integrityManager: mockIntegrityManager,
    });
  });

  afterEach(() => {
    themeManager.clearExtensionThemes();
    try {
      fs.rmSync(tempHomeDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('loadExtensions parallel loading', () => {
    it('should prevent concurrent loading and return the same promise', async () => {
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'ext1',
        version: '1.0.0',
      });
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'ext2',
        version: '1.0.0',
      });

      // Call loadExtensions twice concurrently
      const promise1 = extensionManager.loadExtensions();
      const promise2 = extensionManager.loadExtensions();

      // They should resolve to the exact same array
      const [extensions1, extensions2] = await Promise.all([
        promise1,
        promise2,
      ]);

      expect(extensions1).toBe(extensions2);
      expect(extensions1).toHaveLength(2);

      const names = extensions1.map((ext) => ext.name).sort();
      expect(names).toEqual(['ext1', 'ext2']);
    });

    it('should throw an error if loadExtensions is called after it has already resolved', async () => {
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'ext1',
        version: '1.0.0',
      });

      await extensionManager.loadExtensions();

      await expect(extensionManager.loadExtensions()).rejects.toThrow(
        'Extensions already loaded, only load extensions once.',
      );
    });

    it('should not throw if extension directory does not exist', async () => {
      fs.rmSync(userExtensionsDir, { recursive: true, force: true });

      const extensions = await extensionManager.loadExtensions();
      expect(extensions).toEqual([]);
    });

    it('should throw if there are duplicate extension names', async () => {
      // We manually create two extensions with different dirs but same name in config
      const ext1Dir = path.join(userExtensionsDir, 'ext1-dir');
      const ext2Dir = path.join(userExtensionsDir, 'ext2-dir');
      fs.mkdirSync(ext1Dir, { recursive: true });
      fs.mkdirSync(ext2Dir, { recursive: true });

      const config = JSON.stringify({
        name: 'duplicate-ext',
        version: '1.0.0',
      });
      fs.writeFileSync(path.join(ext1Dir, 'gemini-extension.json'), config);
      fs.writeFileSync(
        path.join(ext1Dir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: ext1Dir }),
      );

      fs.writeFileSync(path.join(ext2Dir, 'gemini-extension.json'), config);
      fs.writeFileSync(
        path.join(ext2Dir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: ext2Dir }),
      );

      await expect(extensionManager.loadExtensions()).rejects.toThrow(
        'Extension with name duplicate-ext already was loaded.',
      );
    });

    it('should wait for loadExtensions to finish when loadExtension is called concurrently', async () => {
      // Create an initial extension that loadExtensions will find
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'ext1',
        version: '1.0.0',
      });

      // Start the parallel load (it will read ext1)
      const loadAllPromise = extensionManager.loadExtensions();

      // Create a second extension dynamically in a DIFFERENT directory
      // so that loadExtensions (which scans userExtensionsDir) doesn't find it.
      const externalDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'external-ext-'),
      );
      fs.writeFileSync(
        path.join(externalDir, 'gemini-extension.json'),
        JSON.stringify({ name: 'ext2', version: '1.0.0' }),
      );
      fs.writeFileSync(
        path.join(externalDir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: externalDir }),
      );

      // Concurrently call loadExtension (simulating an install or update)
      const loadSinglePromise = extensionManager.loadExtension(externalDir);

      // Wait for both to complete
      await Promise.all([loadAllPromise, loadSinglePromise]);

      // Both extensions should now be present in the loadedExtensions array
      const extensions = extensionManager.getExtensions();
      expect(extensions).toHaveLength(2);
      const names = extensions.map((ext) => ext.name).sort();
      expect(names).toEqual(['ext1', 'ext2']);

      fs.rmSync(externalDir, { recursive: true, force: true });
    });
  });

  describe('symlink handling', () => {
    let extensionDir: string;
    let symlinkDir: string;

    beforeEach(() => {
      extensionDir = path.join(tempHomeDir, 'extension');
      symlinkDir = path.join(tempHomeDir, 'symlink-ext');

      fs.mkdirSync(extensionDir, { recursive: true });

      fs.writeFileSync(
        path.join(extensionDir, 'gemini-extension.json'),
        JSON.stringify({ name: 'test-ext', version: '1.0.0' }),
      );

      fs.symlinkSync(extensionDir, symlinkDir, 'dir');
    });

    it('preserves symlinks in installMetadata.source when linking', async () => {
      const manager = new ExtensionManager({
        workspaceDir: tempWorkspaceDir,
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
        integrityManager: mockIntegrityManager,
      });

      // Trust the workspace to allow installation
      const trustedFolders = loadTrustedFolders();
      await trustedFolders.setValue(tempWorkspaceDir, TrustLevel.TRUST_FOLDER);

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
        workspaceDir: tempWorkspaceDir,
        settings,
        requestConsent: () => Promise.resolve(true),
        requestSetting: null,
        integrityManager: mockIntegrityManager,
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

    it('enforces allowedExtensions using the real path', async () => {
      const absolutePath = path.resolve(symlinkDir);
      const realPath = getRealPath(absolutePath);

      const settings = {
        security: {
          folderTrust: { enabled: false },
          // Only allow the real path, not the symlink path
          allowedExtensions: [realPath.replace(/\\/g, '\\\\')],
        },
        experimental: { extensionConfig: false },
        admin: { extensions: { enabled: true }, mcp: { enabled: true } },
        hooksConfig: { enabled: true },
      } as unknown as MergedSettings;

      const manager = new ExtensionManager({
        workspaceDir: tempWorkspaceDir,
        settings,
        requestConsent: () => Promise.resolve(true),
        requestSetting: null,
        integrityManager: mockIntegrityManager,
      });

      const installMetadata = {
        source: absolutePath,
        type: 'link' as const,
      };

      await manager.loadExtensions();
      // This should pass because realPath is allowed
      const extension = await manager.installOrUpdateExtension(installMetadata);
      expect(extension.name).toBe('test-ext');

      // Now try with a settings that only allows the symlink path string
      const settingsOnlySymlink = {
        security: {
          folderTrust: { enabled: false },
          // Only allow the symlink path string explicitly
          allowedExtensions: [absolutePath.replace(/\\/g, '\\\\')],
        },
        experimental: { extensionConfig: false },
        admin: { extensions: { enabled: true }, mcp: { enabled: true } },
        hooksConfig: { enabled: true },
      } as unknown as MergedSettings;

      const manager2 = new ExtensionManager({
        workspaceDir: tempWorkspaceDir,
        settings: settingsOnlySymlink,
        requestConsent: () => Promise.resolve(true),
        requestSetting: null,
        integrityManager: mockIntegrityManager,
      });

      // This should FAIL because it checks the real path against the pattern
      // (Unless symlinkDir === extensionDir, which shouldn't happen in this test setup)
      if (absolutePath !== realPath) {
        await expect(
          manager2.installOrUpdateExtension(installMetadata),
        ).rejects.toThrow(
          /is not allowed by the "allowedExtensions" security setting/,
        );
      }
    });
  });

  describe('Extension Renaming', () => {
    it('should support renaming an extension during update', async () => {
      // 1. Setup existing extension
      const oldName = 'old-name';
      const newName = 'new-name';
      const extDir = path.join(userExtensionsDir, oldName);
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(
        path.join(extDir, 'gemini-extension.json'),
        JSON.stringify({ name: oldName, version: '1.0.0' }),
      );
      fs.writeFileSync(
        path.join(extDir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: extDir }),
      );

      await extensionManager.loadExtensions();

      // 2. Create a temporary "new" version with a different name
      const newSourceDir = fs.mkdtempSync(
        path.join(tempHomeDir, 'new-source-'),
      );
      fs.writeFileSync(
        path.join(newSourceDir, 'gemini-extension.json'),
        JSON.stringify({ name: newName, version: '1.1.0' }),
      );
      fs.writeFileSync(
        path.join(newSourceDir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: newSourceDir }),
      );

      // 3. Update the extension
      await extensionManager.installOrUpdateExtension(
        { type: 'local', source: newSourceDir },
        { name: oldName, version: '1.0.0' },
      );

      // 4. Verify old directory is gone and new one exists
      expect(fs.existsSync(path.join(userExtensionsDir, oldName))).toBe(false);
      expect(fs.existsSync(path.join(userExtensionsDir, newName))).toBe(true);

      // Verify the loaded state is updated
      const extensions = extensionManager.getExtensions();
      expect(extensions.some((e) => e.name === newName)).toBe(true);
      expect(extensions.some((e) => e.name === oldName)).toBe(false);
    });

    it('should carry over enablement status when renaming', async () => {
      const oldName = 'old-name';
      const newName = 'new-name';
      const extDir = path.join(userExtensionsDir, oldName);
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(
        path.join(extDir, 'gemini-extension.json'),
        JSON.stringify({ name: oldName, version: '1.0.0' }),
      );
      fs.writeFileSync(
        path.join(extDir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: extDir }),
      );

      // Enable it
      const enablementManager = extensionManager.getEnablementManager();
      enablementManager.enable(oldName, true, tempHomeDir);

      await extensionManager.loadExtensions();
      const extension = extensionManager.getExtensions()[0];
      expect(extension.isActive).toBe(true);

      const newSourceDir = fs.mkdtempSync(
        path.join(tempHomeDir, 'new-source-'),
      );
      fs.writeFileSync(
        path.join(newSourceDir, 'gemini-extension.json'),
        JSON.stringify({ name: newName, version: '1.1.0' }),
      );
      fs.writeFileSync(
        path.join(newSourceDir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: newSourceDir }),
      );

      await extensionManager.installOrUpdateExtension(
        { type: 'local', source: newSourceDir },
        { name: oldName, version: '1.0.0' },
      );

      // Verify new name is enabled
      expect(enablementManager.isEnabled(newName, tempHomeDir)).toBe(true);
      // Verify old name is removed from enablement
      expect(enablementManager.readConfig()[oldName]).toBeUndefined();
    });

    it('should prevent renaming if the new name conflicts with an existing extension', async () => {
      // Setup two extensions
      const ext1Dir = path.join(userExtensionsDir, 'ext1');
      fs.mkdirSync(ext1Dir, { recursive: true });
      fs.writeFileSync(
        path.join(ext1Dir, 'gemini-extension.json'),
        JSON.stringify({ name: 'ext1', version: '1.0.0' }),
      );
      fs.writeFileSync(
        path.join(ext1Dir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: ext1Dir }),
      );

      const ext2Dir = path.join(userExtensionsDir, 'ext2');
      fs.mkdirSync(ext2Dir, { recursive: true });
      fs.writeFileSync(
        path.join(ext2Dir, 'gemini-extension.json'),
        JSON.stringify({ name: 'ext2', version: '1.0.0' }),
      );
      fs.writeFileSync(
        path.join(ext2Dir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: ext2Dir }),
      );

      await extensionManager.loadExtensions();

      // Try to update ext1 to name 'ext2'
      const newSourceDir = fs.mkdtempSync(
        path.join(tempHomeDir, 'new-source-'),
      );
      fs.writeFileSync(
        path.join(newSourceDir, 'gemini-extension.json'),
        JSON.stringify({ name: 'ext2', version: '1.1.0' }),
      );
      fs.writeFileSync(
        path.join(newSourceDir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: newSourceDir }),
      );

      await expect(
        extensionManager.installOrUpdateExtension(
          { type: 'local', source: newSourceDir },
          { name: 'ext1', version: '1.0.0' },
        ),
      ).rejects.toThrow(/already installed/);
    });
  });

  describe('extension integrity', () => {
    it('should store integrity data during installation', async () => {
      const storeSpy = vi.spyOn(extensionManager, 'storeExtensionIntegrity');

      const extDir = path.join(tempHomeDir, 'new-integrity-ext');
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(
        path.join(extDir, 'gemini-extension.json'),
        JSON.stringify({ name: 'integrity-ext', version: '1.0.0' }),
      );

      const installMetadata = {
        source: extDir,
        type: 'local' as const,
      };

      await extensionManager.loadExtensions();
      await extensionManager.installOrUpdateExtension(installMetadata);

      expect(storeSpy).toHaveBeenCalledWith('integrity-ext', installMetadata);
    });

    it('should store integrity data during first update', async () => {
      const storeSpy = vi.spyOn(extensionManager, 'storeExtensionIntegrity');
      const verifySpy = vi.spyOn(extensionManager, 'verifyExtensionIntegrity');

      // Setup existing extension
      const extName = 'update-integrity-ext';
      const extDir = path.join(userExtensionsDir, extName);
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(
        path.join(extDir, 'gemini-extension.json'),
        JSON.stringify({ name: extName, version: '1.0.0' }),
      );
      fs.writeFileSync(
        path.join(extDir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: extDir }),
      );

      await extensionManager.loadExtensions();

      // Ensure no integrity data exists for this extension
      verifySpy.mockResolvedValueOnce(IntegrityDataStatus.MISSING);

      const initialStatus = await extensionManager.verifyExtensionIntegrity(
        extName,
        { type: 'local', source: extDir },
      );
      expect(initialStatus).toBe('missing');

      // Create new version of the extension
      const newSourceDir = fs.mkdtempSync(
        path.join(tempHomeDir, 'new-source-'),
      );
      fs.writeFileSync(
        path.join(newSourceDir, 'gemini-extension.json'),
        JSON.stringify({ name: extName, version: '1.1.0' }),
      );

      const installMetadata = {
        source: newSourceDir,
        type: 'local' as const,
      };

      // Perform update and verify integrity was stored
      await extensionManager.installOrUpdateExtension(installMetadata, {
        name: extName,
        version: '1.0.0',
      });

      expect(storeSpy).toHaveBeenCalledWith(extName, installMetadata);
    });
  });

  describe('early theme registration', () => {
    it('should register themes with ThemeManager during loadExtensions for active extensions', async () => {
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'themed-ext',
        version: '1.0.0',
        themes: [testTheme],
      });

      await extensionManager.loadExtensions();

      expect(themeManager.getCustomThemeNames()).toContain(
        'MyTheme (themed-ext)',
      );
    });

    it('should not register themes for inactive extensions', async () => {
      createExtension({
        extensionsDir: userExtensionsDir,
        name: 'disabled-ext',
        version: '1.0.0',
        themes: [testTheme],
      });

      // Disable the extension by creating an enablement override
      const manager = new ExtensionManager({
        enabledExtensionOverrides: ['none'],
        settings: createTestMergedSettings(),
        workspaceDir: tempWorkspaceDir,
        requestConsent: vi.fn().mockResolvedValue(true),
        requestSetting: null,
      });

      await manager.loadExtensions();

      expect(themeManager.getCustomThemeNames()).not.toContain(
        'MyTheme (disabled-ext)',
      );
    });
  });

  describe('contextFileName directory boundary validation and path resolution', () => {
    it('loads legitimate relative paths within the extension directory (e.g. context/GEMINI.md, ./GEMINI.md)', async () => {
      const extDir = path.join(userExtensionsDir, 'legit-ext');
      const contextDir = path.join(extDir, 'context');
      fs.mkdirSync(contextDir, { recursive: true });
      fs.writeFileSync(path.join(contextDir, 'GEMINI.md'), 'context content');
      fs.writeFileSync(path.join(extDir, 'GEMINI.md'), 'root context content');
      fs.writeFileSync(path.join(extDir, 'DOCS.md'), 'docs content');
      fs.writeFileSync(
        path.join(extDir, 'gemini-extension.json'),
        JSON.stringify({
          name: 'legit-ext',
          version: '1.0.0',
          contextFileName: ['context/GEMINI.md', './GEMINI.md', 'DOCS.md'],
        }),
      );
      fs.writeFileSync(
        path.join(extDir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: extDir }),
      );

      const extensions = await extensionManager.loadExtensions();
      expect(extensions).toHaveLength(1);
      const ext = extensions[0];
      expect(ext.contextFiles).toEqual([
        path.join(extDir, 'context', 'GEMINI.md'),
        path.join(extDir, 'GEMINI.md'),
        path.join(extDir, 'DOCS.md'),
      ]);
    });

    it('rejects relative parent directory navigation using .. (e.g. ../../../../etc/passwd, ../secret.txt) and skips loading the invalid context file', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const extDir = path.join(userExtensionsDir, 'relative-parent-ext');
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(path.join(extDir, 'valid.md'), 'valid content');
      fs.writeFileSync(
        path.join(extDir, 'gemini-extension.json'),
        JSON.stringify({
          name: 'relative-parent-ext',
          version: '1.0.0',
          contextFileName: [
            'valid.md',
            '../../../../etc/passwd',
            '../secret.txt',
            'subdir/../../escaped.txt',
            '..\\secret.txt',
            '%2e%2e%2fsecret.txt',
          ],
        }),
      );
      fs.writeFileSync(
        path.join(extDir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: extDir }),
      );

      const extensions = await extensionManager.loadExtensions();
      expect(extensions).toHaveLength(1);
      const ext = extensions[0];
      // Only valid.md should be loaded; all invalid path attempts should be skipped
      expect(ext.contextFiles).toEqual([path.join(extDir, 'valid.md')]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('../../../../etc/passwd'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('../secret.txt'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('subdir/../../escaped.txt'),
      );
      warnSpy.mockRestore();
    });

    it('rejects absolute paths (e.g. /etc/hosts or C:\\Windows\\System32) and skips loading the invalid context file', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const extDir = path.join(userExtensionsDir, 'absolute-ext');
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(path.join(extDir, 'valid.md'), 'valid content');
      fs.writeFileSync(
        path.join(extDir, 'gemini-extension.json'),
        JSON.stringify({
          name: 'absolute-ext',
          version: '1.0.0',
          contextFileName: [
            'valid.md',
            '/etc/hosts',
            '/etc/passwd',
            'C:\\Windows\\System32',
            'C:/Windows/System32',
            '\\\\server\\share\\secret.txt',
          ],
        }),
      );
      fs.writeFileSync(
        path.join(extDir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: extDir }),
      );

      const extensions = await extensionManager.loadExtensions();
      expect(extensions).toHaveLength(1);
      const ext = extensions[0];
      expect(ext.contextFiles).toEqual([path.join(extDir, 'valid.md')]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('/etc/hosts'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('C:\\Windows\\System32'),
      );
      warnSpy.mockRestore();
    });

    it('skips non-string, empty, or whitespace-only contextFileName entries', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const extDir = path.join(userExtensionsDir, 'empty-ext');
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(path.join(extDir, 'valid.md'), 'valid content');
      fs.writeFileSync(
        path.join(extDir, 'gemini-extension.json'),
        JSON.stringify({
          name: 'empty-ext',
          version: '1.0.0',
          contextFileName: ['valid.md', '', '   ', null, 123],
        }),
      );
      fs.writeFileSync(
        path.join(extDir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: extDir }),
      );

      const extensions = await extensionManager.loadExtensions();
      expect(extensions).toHaveLength(1);
      expect(extensions[0].contextFiles).toEqual([
        path.join(extDir, 'valid.md'),
      ]);
      warnSpy.mockRestore();
    });

    it('rejects context file path with null byte injection', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const extDir = path.join(userExtensionsDir, 'nullbyte-ext');
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(
        path.join(extDir, 'gemini-extension.json'),
        JSON.stringify({
          name: 'nullbyte-ext',
          version: '1.0.0',
          contextFileName: 'context.md\0/etc/hosts',
        }),
      );
      fs.writeFileSync(
        path.join(extDir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: extDir }),
      );

      const extensions = await extensionManager.loadExtensions();
      expect(extensions).toHaveLength(1);
      expect(extensions[0].contextFiles).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('null bytes are not allowed'),
      );
      warnSpy.mockRestore();
    });

    it('sanitizes plan.directory against relative parent directory navigation', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const extDir = path.join(userExtensionsDir, 'plan-ext');
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(
        path.join(extDir, 'gemini-extension.json'),
        JSON.stringify({
          name: 'plan-ext',
          version: '1.0.0',
          plan: {
            directory: '../../../../etc',
          },
        }),
      );
      fs.writeFileSync(
        path.join(extDir, 'metadata.json'),
        JSON.stringify({ type: 'local', source: extDir }),
      );

      const extensions = await extensionManager.loadExtensions();
      expect(extensions).toHaveLength(1);
      expect(extensions[0].plan).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Invalid plan.directory in extension "plan-ext"',
        ),
      );
      warnSpy.mockRestore();
    });

    describe('resolveContextFilePaths unit tests', () => {
      it('returns empty array when context files do not exist', () => {
        const config = {
          name: 'test',
          version: '1.0.0',
          contextFileName: 'non-existent.md',
        };
        const result = resolveContextFilePaths(config, tempWorkspaceDir);
        expect(result).toEqual([]);
      });

      it('returns resolved paths for existing valid context files', () => {
        const testFile = path.join(tempWorkspaceDir, 'valid.md');
        fs.writeFileSync(testFile, 'test');
        const config = {
          name: 'test',
          version: '1.0.0',
          contextFileName: 'valid.md',
        };
        const result = resolveContextFilePaths(config, tempWorkspaceDir);
        expect(result).toEqual([testFile]);
      });

      it('filters out relative parent directory paths even if target file exists on disk', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const outsideFile = path.join(tempHomeDir, 'outside-secret.txt');
        fs.writeFileSync(outsideFile, 'secret');
        const extDir = path.join(tempHomeDir, 'ext-sub');
        fs.mkdirSync(extDir, { recursive: true });

        const config = {
          name: 'test',
          version: '1.0.0',
          contextFileName: '../outside-secret.txt',
        };
        const result = resolveContextFilePaths(config, extDir);
        expect(result).toEqual([]);
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
      });

      it('loads context file with percent characters without skipping it', () => {
        const testFile = path.join(tempWorkspaceDir, '100%_complete.md');
        fs.writeFileSync(testFile, '100% completed content');
        const config = {
          name: 'test',
          version: '1.0.0',
          contextFileName: '100%_complete.md',
        };
        const result = resolveContextFilePaths(config, tempWorkspaceDir);
        expect(result).toEqual([testFile]);
      });
    });

    describe('validateContextFilePath unit tests', () => {
      it('validates standard relative context file path', () => {
        const result = validateContextFilePath('GEMINI.md', tempWorkspaceDir);
        expect(result.isValid).toBe(true);
        expect(result.resolvedPath).toBe(
          path.resolve(tempWorkspaceDir, 'GEMINI.md'),
        );
      });

      it('validates context file path in nested subdirectory', () => {
        const result = validateContextFilePath(
          'docs/context.md',
          tempWorkspaceDir,
        );
        expect(result.isValid).toBe(true);
        expect(result.resolvedPath).toBe(
          path.resolve(tempWorkspaceDir, 'docs/context.md'),
        );
      });

      it('validates context file path containing percent characters', () => {
        const result = validateContextFilePath(
          'progress_100%_report.md',
          tempWorkspaceDir,
        );
        expect(result.isValid).toBe(true);
        expect(result.resolvedPath).toBe(
          path.resolve(tempWorkspaceDir, 'progress_100%_report.md'),
        );
      });

      it('rejects relative parent directory navigation', () => {
        const result = validateContextFilePath(
          '../secret.txt',
          tempWorkspaceDir,
        );
        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toContain(
          'Relative parent directory references ("..") are not allowed.',
        );
      });

      it('rejects URL-encoded relative parent directory navigation', () => {
        const resultLower = validateContextFilePath(
          '%2e%2e/secret.txt',
          tempWorkspaceDir,
        );
        expect(resultLower.isValid).toBe(false);
        expect(resultLower.errorMessage).toContain(
          'Relative parent directory references ("..") are not allowed.',
        );

        const resultUpper = validateContextFilePath(
          '%2E%2E/secret.txt',
          tempWorkspaceDir,
        );
        expect(resultUpper.isValid).toBe(false);
        expect(resultUpper.errorMessage).toContain(
          'Relative parent directory references ("..") are not allowed.',
        );
      });

      it('rejects POSIX and Windows absolute paths', () => {
        const resultPosix = validateContextFilePath(
          '/etc/hosts',
          tempWorkspaceDir,
        );
        expect(resultPosix.isValid).toBe(false);
        expect(resultPosix.errorMessage).toContain(
          'Absolute paths are not allowed.',
        );

        const resultWin = validateContextFilePath(
          'C:\\Windows\\System32',
          tempWorkspaceDir,
        );
        expect(resultWin.isValid).toBe(false);
        expect(resultWin.errorMessage).toContain(
          'Absolute paths are not allowed.',
        );
      });

      it('rejects null bytes', () => {
        const result = validateContextFilePath(
          'context.md\0outside.txt',
          tempWorkspaceDir,
        );
        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toContain('null bytes are not allowed.');
      });

      it('rejects empty or non-string inputs', () => {
        expect(validateContextFilePath('', tempWorkspaceDir).isValid).toBe(
          false,
        );
        expect(validateContextFilePath('   ', tempWorkspaceDir).isValid).toBe(
          false,
        );
        expect(validateContextFilePath(null, tempWorkspaceDir).isValid).toBe(
          false,
        );
        expect(validateContextFilePath(123, tempWorkspaceDir).isValid).toBe(
          false,
        );
      });

      it('validates context files when root path casing varies on case-insensitive platforms', () => {
        const lowerRoot = tempWorkspaceDir.toLowerCase();
        const result = validateContextFilePath('GEMINI.md', lowerRoot);
        if (process.platform === 'darwin' || process.platform === 'win32') {
          expect(result.isValid).toBe(true);
        }
      });
    });
  });
});
