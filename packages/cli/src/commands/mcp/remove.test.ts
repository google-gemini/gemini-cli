/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import yargs, { type Argv } from 'yargs';
import { SettingScope, type LoadedSettings } from '../../config/settings.js';
import { removeCommand } from './remove.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { GEMINI_DIR } from '@google/gemini-cli-core';

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe('mcp remove command', () => {
  describe('unit tests with mocks', () => {
    let parser: Argv;
    let mockSetValue: Mock;
    let mockSettings: Record<string, unknown>;

    beforeEach(async () => {
      vi.resetAllMocks();

      mockSetValue = vi.fn();
      mockSettings = {
        mcpServers: {
          'test-server': {
            command: 'echo "hello"',
          },
        },
      };

      vi.spyOn(
        await import('../../config/settings.js'),
        'loadSettings',
      ).mockReturnValue({
        forScope: () => ({ settings: mockSettings }),
        setValue: mockSetValue,
        workspace: { path: '/path/to/project' },
        user: { path: '/home/user' },
      } as unknown as LoadedSettings);

      const yargsInstance = yargs([]).command(removeCommand);
      parser = yargsInstance;
    });

    it('should remove a server from project settings', async () => {
      await parser.parseAsync('remove test-server');

      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'mcpServers',
        {},
      );
    });

    it('should show a message if server not found', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await parser.parseAsync('remove non-existent-server');

      expect(mockSetValue).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Server "non-existent-server" not found in project settings.',
      );
    });
  });

  describe('integration tests with real file I/O', () => {
    let tempDir: string;
    let settingsDir: string;
    let settingsPath: string;
    let parser: Argv;
    let cwdSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.resetAllMocks();
      vi.restoreAllMocks();

      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-remove-test-'));
      settingsDir = path.join(tempDir, GEMINI_DIR);
      settingsPath = path.join(settingsDir, 'settings.json');
      fs.mkdirSync(settingsDir, { recursive: true });

      cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);

      parser = yargs([]).command(removeCommand);
    });

    afterEach(() => {
      cwdSpy.mockRestore();

      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('should actually remove a server from the settings file', async () => {
      const originalContent = `{
        "mcpServers": {
          "server-to-keep": {
            "command": "node",
            "args": ["keep.js"]
          },
          "server-to-remove": {
            "command": "node",
            "args": ["remove.js"]
          }
        }
      }`;
      fs.writeFileSync(settingsPath, originalContent, 'utf-8');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await parser.parseAsync('remove server-to-remove');

      const updatedContent = fs.readFileSync(settingsPath, 'utf-8');
      expect(updatedContent).toContain('"server-to-keep"');
      expect(updatedContent).not.toContain('"server-to-remove"');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Server "server-to-remove" removed from project settings.',
      );

      consoleSpy.mockRestore();
    });

    it('should preserve comments when removing a server', async () => {
      const originalContent = `{
        "mcpServers": {
          // Server to keep
          "context7": {
            "command": "node",
            "args": ["server.js"]
          },
          // Server to remove
          "oldServer": {
            "command": "old",
            "args": ["old.js"]
          }
        }
      }`;
      fs.writeFileSync(settingsPath, originalContent, 'utf-8');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await parser.parseAsync('remove oldServer');

      const updatedContent = fs.readFileSync(settingsPath, 'utf-8');
      expect(updatedContent).toContain('// Server to keep');
      expect(updatedContent).toContain('"context7"');
      expect(updatedContent).not.toContain('"oldServer"');
      expect(updatedContent).toContain('// Server to remove');

      consoleSpy.mockRestore();
    });

    it('should handle removing the only server', async () => {
      const originalContent = `{
        "mcpServers": {
          "only-server": {
            "command": "node",
            "args": ["server.js"]
          }
        }
      }`;
      fs.writeFileSync(settingsPath, originalContent, 'utf-8');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await parser.parseAsync('remove only-server');

      const updatedContent = fs.readFileSync(settingsPath, 'utf-8');
      expect(updatedContent).toContain('"mcpServers"');
      expect(updatedContent).not.toContain('"only-server"');
      expect(updatedContent).toMatch(/"mcpServers"\s*:\s*\{\s*\}/);

      consoleSpy.mockRestore();
    });

    it('should preserve other settings when removing a server', async () => {
      // Create settings file with other settings
      // Note: "model" will be migrated to "model": { "name": ... } format
      const originalContent = `{
        "model": {
          "name": "gemini-2.5-pro"
        },
        "mcpServers": {
          "server1": {
            "command": "node",
            "args": ["s1.js"]
          },
          "server2": {
            "command": "node",
            "args": ["s2.js"]
          }
        },
        "ui": {
          "theme": "dark"
        }
      }`;
      fs.writeFileSync(settingsPath, originalContent, 'utf-8');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await parser.parseAsync('remove server1');

      const updatedContent = fs.readFileSync(settingsPath, 'utf-8');
      expect(updatedContent).toContain('"model"');
      expect(updatedContent).toContain('"gemini-2.5-pro"');
      expect(updatedContent).toContain('"server2"');
      expect(updatedContent).toContain('"ui"');
      expect(updatedContent).toContain('"theme": "dark"');
      expect(updatedContent).not.toContain('"server1"');

      consoleSpy.mockRestore();
    });
  });
});
