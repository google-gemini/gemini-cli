/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type Mock,
  type MockInstance,
} from 'vitest';
import yargs, { type Argv } from 'yargs';
import { addCommand } from './add.js';
import { loadSettings, SettingScope } from '../../config/settings.js';
import { debugLogger } from '@google/gemini-cli-core';

vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('os', () => {
  const homedir = vi.fn(() => '/home/user');
  return {
    default: {
      homedir,
    },
    homedir,
  };
});

vi.mock('../../config/settings.js', async () => {
  const actual = await vi.importActual('../../config/settings.js');
  return {
    ...actual,
    loadSettings: vi.fn(),
  };
});

const mockedLoadSettings = loadSettings as Mock;

describe('mcp add command', () => {
  let parser: Argv;
  let mockSetValue: Mock;
  let mockConsoleError: Mock;
  let debugLoggerErrorSpy: MockInstance;

  beforeEach(() => {
    vi.resetAllMocks();
    const yargsInstance = yargs([]).command(addCommand);
    parser = yargsInstance;
    mockSetValue = vi.fn();
    mockConsoleError = vi.fn();
    debugLoggerErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(mockConsoleError);
    mockedLoadSettings.mockReturnValue({
      forScope: () => ({ settings: {} }),
      setValue: mockSetValue,
      workspace: { path: '/path/to/project' },
      user: { path: '/home/user' },
    });
  });

  it('should add a stdio server to project settings', async () => {
    await parser.parseAsync(
      'add -e FOO=bar my-server /path/to/server arg1 arg2',
    );

    expect(mockSetValue).toHaveBeenCalledWith(
      SettingScope.Workspace,
      'mcpServers',
      {
        'my-server': {
          command: '/path/to/server',
          args: ['arg1', 'arg2'],
          env: { FOO: 'bar' },
        },
      },
    );
  });

  it('should handle multiple env vars before positional args', async () => {
    await parser.parseAsync(
      'add -e FOO=bar -e BAZ=qux my-server /path/to/server',
    );

    expect(mockSetValue).toHaveBeenCalledWith(
      SettingScope.Workspace,
      'mcpServers',
      {
        'my-server': {
          command: '/path/to/server',
          args: [],
          env: { FOO: 'bar', BAZ: 'qux' },
        },
      },
    );
  });

  it('should add an sse server to user settings', async () => {
    await parser.parseAsync(
      'add --transport sse --scope user -H "X-API-Key: your-key" sse-server https://example.com/sse-endpoint',
    );

    expect(mockSetValue).toHaveBeenCalledWith(SettingScope.User, 'mcpServers', {
      'sse-server': {
        url: 'https://example.com/sse-endpoint',
        type: 'sse',
        headers: { 'X-API-Key': 'your-key' },
      },
    });
  });

  it('should add an http server to project settings', async () => {
    await parser.parseAsync(
      'add --transport http -H "Authorization: Bearer your-token" http-server https://example.com/mcp',
    );

    expect(mockSetValue).toHaveBeenCalledWith(
      SettingScope.Workspace,
      'mcpServers',
      {
        'http-server': {
          url: 'https://example.com/mcp',
          type: 'http',
          headers: { Authorization: 'Bearer your-token' },
        },
      },
    );
  });

  it('should add an sse server using --type alias', async () => {
    await parser.parseAsync(
      'add --type sse --scope user -H "X-API-Key: your-key" sse-server https://example.com/sse',
    );

    expect(mockSetValue).toHaveBeenCalledWith(SettingScope.User, 'mcpServers', {
      'sse-server': {
        url: 'https://example.com/sse',
        type: 'sse',
        headers: { 'X-API-Key': 'your-key' },
      },
    });
  });

  it('should add an http server using --type alias', async () => {
    await parser.parseAsync(
      'add --type http -H "Authorization: Bearer your-token" http-server https://example.com/mcp',
    );

    expect(mockSetValue).toHaveBeenCalledWith(
      SettingScope.Workspace,
      'mcpServers',
      {
        'http-server': {
          url: 'https://example.com/mcp',
          type: 'http',
          headers: { Authorization: 'Bearer your-token' },
        },
      },
    );
  });

  it('should handle MCP server args with -- separator', async () => {
    await parser.parseAsync(
      'add my-server npx -- -y http://example.com/some-package',
    );

    expect(mockSetValue).toHaveBeenCalledWith(
      SettingScope.Workspace,
      'mcpServers',
      {
        'my-server': {
          command: 'npx',
          args: ['-y', 'http://example.com/some-package'],
        },
      },
    );
  });

  it('should handle unknown options as MCP server args', async () => {
    await parser.parseAsync(
      'add test-server npx -y http://example.com/some-package',
    );

    expect(mockSetValue).toHaveBeenCalledWith(
      SettingScope.Workspace,
      'mcpServers',
      {
        'test-server': {
          command: 'npx',
          args: ['-y', 'http://example.com/some-package'],
        },
      },
    );
  });

  describe('when handling scope and directory', () => {
    const serverName = 'test-server';
    const command = 'echo';

    const setupMocks = (cwd: string, workspacePath: string) => {
      vi.spyOn(process, 'cwd').mockReturnValue(cwd);
      mockedLoadSettings.mockReturnValue({
        forScope: () => ({ settings: {} }),
        setValue: mockSetValue,
        workspace: { path: workspacePath },
        user: { path: '/home/user' },
      });
    };

    describe('when in a project directory', () => {
      beforeEach(() => {
        setupMocks('/path/to/project', '/path/to/project');
      });

      it('should use project scope by default', async () => {
        await parser.parseAsync(`add ${serverName} ${command}`);
        expect(mockSetValue).toHaveBeenCalledWith(
          SettingScope.Workspace,
          'mcpServers',
          expect.any(Object),
        );
      });

      it('should use project scope when --scope=project is used', async () => {
        await parser.parseAsync(`add --scope project ${serverName} ${command}`);
        expect(mockSetValue).toHaveBeenCalledWith(
          SettingScope.Workspace,
          'mcpServers',
          expect.any(Object),
        );
      });

      it('should use user scope when --scope=user is used', async () => {
        await parser.parseAsync(`add --scope user ${serverName} ${command}`);
        expect(mockSetValue).toHaveBeenCalledWith(
          SettingScope.User,
          'mcpServers',
          expect.any(Object),
        );
      });
    });

    describe('when in a subdirectory of a project', () => {
      beforeEach(() => {
        setupMocks('/path/to/project/subdir', '/path/to/project');
      });

      it('should use project scope by default', async () => {
        await parser.parseAsync(`add ${serverName} ${command}`);
        expect(mockSetValue).toHaveBeenCalledWith(
          SettingScope.Workspace,
          'mcpServers',
          expect.any(Object),
        );
      });
    });

    describe('when in the home directory', () => {
      beforeEach(() => {
        setupMocks('/home/user', '/home/user');
      });

      it('should show an error by default', async () => {
        const mockProcessExit = vi
          .spyOn(process, 'exit')
          .mockImplementation((() => {
            throw new Error('process.exit called');
          }) as (code?: number | string | null) => never);

        await expect(
          parser.parseAsync(`add ${serverName} ${command}`),
        ).rejects.toThrow('process.exit called');

        expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
          'Error: Please use --scope user to edit settings in the home directory.',
        );
        expect(mockProcessExit).toHaveBeenCalledWith(1);
        expect(mockSetValue).not.toHaveBeenCalled();
      });

      it('should show an error when --scope=project is used explicitly', async () => {
        const mockProcessExit = vi
          .spyOn(process, 'exit')
          .mockImplementation((() => {
            throw new Error('process.exit called');
          }) as (code?: number | string | null) => never);

        await expect(
          parser.parseAsync(`add --scope project ${serverName} ${command}`),
        ).rejects.toThrow('process.exit called');

        expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
          'Error: Please use --scope user to edit settings in the home directory.',
        );
        expect(mockProcessExit).toHaveBeenCalledWith(1);
        expect(mockSetValue).not.toHaveBeenCalled();
      });

      it('should use user scope when --scope=user is used', async () => {
        await parser.parseAsync(`add --scope user ${serverName} ${command}`);
        expect(mockSetValue).toHaveBeenCalledWith(
          SettingScope.User,
          'mcpServers',
          expect.any(Object),
        );
        expect(debugLoggerErrorSpy).not.toHaveBeenCalled();
      });
    });

    describe('when in a subdirectory of home (not a project)', () => {
      beforeEach(() => {
        setupMocks('/home/user/some/dir', '/home/user/some/dir');
      });

      it('should use project scope by default', async () => {
        await parser.parseAsync(`add ${serverName} ${command}`);
        expect(mockSetValue).toHaveBeenCalledWith(
          SettingScope.Workspace,
          'mcpServers',
          expect.any(Object),
        );
      });

      it('should write to the WORKSPACE scope, not the USER scope', async () => {
        await parser.parseAsync(`add my-new-server echo`);

        // We expect setValue to be called once.
        expect(mockSetValue).toHaveBeenCalledTimes(1);

        // We get the scope that setValue was called with.
        const calledScope = mockSetValue.mock.calls[0][0];

        // We assert that the scope was Workspace, not User.
        expect(calledScope).toBe(SettingScope.Workspace);
      });
    });

    describe('when outside of home (not a project)', () => {
      beforeEach(() => {
        setupMocks('/tmp/foo', '/tmp/foo');
      });

      it('should use project scope by default', async () => {
        await parser.parseAsync(`add ${serverName} ${command}`);
        expect(mockSetValue).toHaveBeenCalledWith(
          SettingScope.Workspace,
          'mcpServers',
          expect.any(Object),
        );
      });
    });
  });

  describe('when updating an existing server', () => {
    const serverName = 'existing-server';
    const initialCommand = 'echo old';
    const updatedCommand = 'echo';
    const updatedArgs = ['new'];

    beforeEach(() => {
      mockedLoadSettings.mockReturnValue({
        forScope: () => ({
          settings: {
            mcpServers: {
              [serverName]: {
                command: initialCommand,
              },
            },
          },
        }),
        setValue: mockSetValue,
        workspace: { path: '/path/to/project' },
        user: { path: '/home/user' },
      });
    });

    it('should update the existing server in the project scope', async () => {
      await parser.parseAsync(
        `add ${serverName} ${updatedCommand} ${updatedArgs.join(' ')}`,
      );
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'mcpServers',
        expect.objectContaining({
          [serverName]: expect.objectContaining({
            command: updatedCommand,
            args: updatedArgs,
          }),
        }),
      );
    });

    it('should update the existing server in the user scope', async () => {
      await parser.parseAsync(
        `add --scope user ${serverName} ${updatedCommand} ${updatedArgs.join(' ')}`,
      );
      expect(mockSetValue).toHaveBeenCalledWith(
        SettingScope.User,
        'mcpServers',
        expect.objectContaining({
          [serverName]: expect.objectContaining({
            command: updatedCommand,
            args: updatedArgs,
          }),
        }),
      );
    });
  });
});
