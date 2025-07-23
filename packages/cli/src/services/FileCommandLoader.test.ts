/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import {
  Config,
  getProjectCommandsDir,
  getUserCommandsDir,
} from '@google/gemini-cli-core';
import mock from 'mock-fs';
import { FileCommandLoader } from './FileCommandLoader.js';
import { assert } from 'vitest';
import { createMockCommandContext } from '../test-utils/mockCommandContext.js';

const mockContext = createMockCommandContext();

describe('FileCommandLoader', () => {
  const signal: AbortSignal = new AbortController().signal;

  afterEach(() => {
    mock.restore();
  });

  it('loads a single command from a file', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.toml': 'prompt = "This is a test prompt"',
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.name).toBe('test');

    const result = await command.action?.(mockContext, '');
    if (result?.type === 'submit_prompt') {
      expect(result.content).toBe('This is a test prompt');
    } else {
      assert.fail('Incorrect action type');
    }
  });

  it('loads multiple commands', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test1.toml': 'prompt = "Prompt 1"',
        'test2.toml': 'prompt = "Prompt 2"',
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(2);
  });

  it('creates deeply nested namespaces correctly', async () => {
    const userCommandsDir = getUserCommandsDir();

    mock({
      [userCommandsDir]: {
        gcp: {
          pipelines: {
            'run.toml': 'prompt = "run pipeline"',
          },
        },
      },
    });
    const mockConfig = {
      getProjectRoot: vi.fn(() => '/path/to/project'),
      getExtensions: vi.fn(() => []),
    } as Config;
    const loader = new FileCommandLoader(mockConfig);
    const commands = await loader.loadCommands(signal);
    expect(commands).toHaveLength(1);
    expect(commands[0]!.name).toBe('gcp:pipelines:run');
  });

  it('creates namespaces from nested directories', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        git: {
          'commit.toml': 'prompt = "git commit prompt"',
        },
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.name).toBe('git:commit');
  });

  it('overrides user commands with project commands', async () => {
    const userCommandsDir = getUserCommandsDir();
    const projectCommandsDir = getProjectCommandsDir(process.cwd());
    mock({
      [userCommandsDir]: {
        'test.toml': 'prompt = "User prompt"',
      },
      [projectCommandsDir]: {
        'test.toml': 'prompt = "Project prompt"',
      },
    });

    const mockConfig = {
      getProjectRoot: vi.fn(() => process.cwd()),
      getExtensions: vi.fn(() => []),
    } as Config;
    const loader = new FileCommandLoader(mockConfig);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command).toBeDefined();

    const result = await command.action?.(mockContext, '');
    if (result?.type === 'submit_prompt') {
      expect(result.content).toBe('Project prompt');
    } else {
      assert.fail('Incorrect action type');
    }
  });

  it('ignores files with TOML syntax errors', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'invalid.toml': 'this is not valid toml',
        'good.toml': 'prompt = "This one is fine"',
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('good');
  });

  it('ignores files that are semantically invalid (missing prompt)', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'no_prompt.toml': 'description = "This file is missing a prompt"',
        'good.toml': 'prompt = "This one is fine"',
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe('good');
  });

  it('handles filename edge cases correctly', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.v1.toml': 'prompt = "Test prompt"',
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.name).toBe('test.v1');
  });

  it('handles file system errors gracefully', async () => {
    mock({}); // Mock an empty file system
    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);
    expect(commands).toHaveLength(0);
  });

  it('uses a default description if not provided', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.toml': 'prompt = "Test prompt"',
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.description).toBe('Custom command from test.toml');
  });

  it('uses the provided description', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'test.toml': 'prompt = "Test prompt"\ndescription = "My test command"',
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);
    const command = commands[0];
    expect(command).toBeDefined();
    expect(command.description).toBe('My test command');
  });

  it('should sanitize colons in filenames to prevent namespace conflicts', async () => {
    const userCommandsDir = getUserCommandsDir();
    mock({
      [userCommandsDir]: {
        'legacy:command.toml': 'prompt = "This is a legacy command"',
      },
    });

    const loader = new FileCommandLoader(null);
    const commands = await loader.loadCommands(signal);

    expect(commands).toHaveLength(1);
    const command = commands[0];
    expect(command).toBeDefined();

    // Verify that the ':' in the filename was replaced with an '_'
    expect(command.name).toBe('legacy_command');
  });

  describe('Extension Command Loading', () => {
    it('loads commands from active extensions', async () => {
      const userCommandsDir = getUserCommandsDir();
      const projectCommandsDir = getProjectCommandsDir(process.cwd());
      const extensionDir = path.join(
        process.cwd(),
        '.gemini/extensions/test-ext',
      );

      mock({
        [userCommandsDir]: {
          'user.toml': 'prompt = "User command"',
        },
        [projectCommandsDir]: {
          'project.toml': 'prompt = "Project command"',
        },
        [extensionDir]: {
          'gemini-extension.json': JSON.stringify({
            name: 'test-ext',
            version: '1.0.0',
          }),
          commands: {
            'ext.toml': 'prompt = "Extension command"',
          },
        },
      });

      const mockConfig = {
        getProjectRoot: vi.fn(() => process.cwd()),
        getExtensions: vi.fn(() => [
          {
            name: 'test-ext',
            version: '1.0.0',
            isActive: true,
            path: extensionDir,
          },
        ]),
      } as Config;
      const loader = new FileCommandLoader(mockConfig);
      const commands = await loader.loadCommands(signal);

      expect(commands).toHaveLength(3);
      const commandNames = commands.map((cmd) => cmd.name).sort();
      expect(commandNames).toEqual(['ext:test-ext:ext', 'project', 'user']);
    });

    it('extension commands are prefixed and do not collide', async () => {
      const userCommandsDir = getUserCommandsDir();
      const projectCommandsDir = getProjectCommandsDir(process.cwd());
      const extensionDir = path.join(
        process.cwd(),
        '.gemini/extensions/test-ext',
      );

      mock({
        [extensionDir]: {
          'gemini-extension.json': JSON.stringify({
            name: 'test-ext',
            version: '1.0.0',
          }),
          commands: {
            'deploy.toml': 'prompt = "Extension deploy command"',
          },
        },
        [userCommandsDir]: {
          'deploy.toml': 'prompt = "User deploy command"',
        },
        [projectCommandsDir]: {
          'deploy.toml': 'prompt = "Project deploy command"',
        },
      });

      const mockConfig = {
        getProjectRoot: vi.fn(() => process.cwd()),
        getExtensions: vi.fn(() => [
          {
            name: 'test-ext',
            version: '1.0.0',
            isActive: true,
            path: extensionDir,
          },
        ]),
      } as Config;
      const loader = new FileCommandLoader(mockConfig);
      const commands = await loader.loadCommands(signal);

      // Should have 2 commands: 'deploy' and 'ext:test-ext:deploy'
      expect(commands).toHaveLength(2);

      const deployCommand = commands.find((cmd) => cmd.name === 'deploy');
      const extDeployCommand = commands.find(
        (cmd) => cmd.name === 'ext:test-ext:deploy',
      );

      expect(deployCommand).toBeDefined();
      expect(extDeployCommand).toBeDefined();

      // Check that the project command wins for 'deploy'
      const deployResult = await deployCommand!.action?.(mockContext, '');
      if (deployResult?.type === 'submit_prompt') {
        expect(deployResult.content).toBe('Project deploy command');
      } else {
        assert.fail('Incorrect action type for deploy');
      }

      // Check that the extension command is available as 'ext:test-ext:deploy'
      const extResult = await extDeployCommand!.action?.(mockContext, '');
      if (extResult?.type === 'submit_prompt') {
        expect(extResult.content).toBe('Extension deploy command');
      } else {
        assert.fail('Incorrect action type for ext:test-ext:deploy');
      }
    });

    it('only loads commands from active extensions', async () => {
      const extensionDir1 = path.join(
        process.cwd(),
        '.gemini/extensions/active-ext',
      );
      const extensionDir2 = path.join(
        process.cwd(),
        '.gemini/extensions/inactive-ext',
      );

      mock({
        [extensionDir1]: {
          'gemini-extension.json': JSON.stringify({
            name: 'active-ext',
            version: '1.0.0',
          }),
          commands: {
            'active.toml': 'prompt = "Active extension command"',
          },
        },
        [extensionDir2]: {
          'gemini-extension.json': JSON.stringify({
            name: 'inactive-ext',
            version: '1.0.0',
          }),
          commands: {
            'inactive.toml': 'prompt = "Inactive extension command"',
          },
        },
      });

      const mockConfig = {
        getProjectRoot: vi.fn(() => process.cwd()),
        getExtensions: vi.fn(() => [
          {
            name: 'active-ext',
            version: '1.0.0',
            isActive: true,
            path: extensionDir1,
          },
          {
            name: 'inactive-ext',
            version: '1.0.0',
            isActive: false,
            path: extensionDir2,
          },
        ]),
      } as Config;
      const loader = new FileCommandLoader(mockConfig);
      const commands = await loader.loadCommands(signal);

      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('ext:active-ext:active');
    });

    it('handles missing extension commands directory gracefully', async () => {
      const extensionDir = path.join(
        process.cwd(),
        '.gemini/extensions/no-commands',
      );

      mock({
        [extensionDir]: {
          'gemini-extension.json': JSON.stringify({
            name: 'no-commands',
            version: '1.0.0',
          }),
          // No commands directory
        },
      });

      const mockConfig = {
        getProjectRoot: vi.fn(() => process.cwd()),
        getExtensions: vi.fn(() => [
          {
            name: 'no-commands',
            version: '1.0.0',
            isActive: true,
            path: extensionDir,
          },
        ]),
      } as Config;
      const loader = new FileCommandLoader(mockConfig);
      const commands = await loader.loadCommands(signal);

      // Should not throw, just return empty
      expect(commands).toHaveLength(0);
    });

    it('handles nested command structure in extensions', async () => {
      const extensionDir = path.join(process.cwd(), '.gemini/extensions/a');

      mock({
        [extensionDir]: {
          'gemini-extension.json': JSON.stringify({
            name: 'a',
            version: '1.0.0',
          }),
          commands: {
            b: {
              'c.toml': 'prompt = "Nested command from extension a"',
              d: {
                'e.toml': 'prompt = "Deeply nested command"',
              },
            },
            'simple.toml': 'prompt = "Simple command"',
          },
        },
      });

      const mockConfig = {
        getProjectRoot: vi.fn(() => process.cwd()),
        getExtensions: vi.fn(() => [
          { name: 'a', version: '1.0.0', isActive: true, path: extensionDir },
        ]),
      } as Config;
      const loader = new FileCommandLoader(mockConfig);
      const commands = await loader.loadCommands(signal);

      expect(commands).toHaveLength(3);

      const commandNames = commands.map((cmd) => cmd.name).sort();
      expect(commandNames).toEqual([
        'ext:a:b:c',
        'ext:a:b:d:e',
        'ext:a:simple',
      ]);

      // Verify one of the commands works correctly
      const nestedCmd = commands.find((cmd) => cmd.name === 'ext:a:b:c');
      expect(nestedCmd).toBeDefined();
      const result = await nestedCmd!.action?.(mockContext, '');
      if (result?.type === 'submit_prompt') {
        expect(result.content).toBe('Nested command from extension a');
      } else {
        assert.fail('Incorrect action type');
      }
    });
  });
});
