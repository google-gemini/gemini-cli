/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import { handleValidate, validateCommand } from './validate.js';
import yargs from 'yargs';
import { createExtension } from '../../test-utils/createExtension.js';
import path from 'node:path';
import * as os from 'node:os';
import { debugLogger } from '@google/gemini-cli-core';

vi.mock('../utils.js', () => ({
  exitCli: vi.fn(),
}));

describe('extensions validate command', () => {
  it('should fail if no path is provided', () => {
    const validationParser = yargs([])
      .locale('en')
      .command(validateCommand)
      .fail(false);
    expect(() => validationParser.parse('validate')).toThrow(
      'Not enough non-option arguments: got 0, need at least 1',
    );
  });
});

describe('handleValidate', () => {
  let debugLoggerLogSpy: MockInstance;
  let debugLoggerWarnSpy: MockInstance;
  let debugLoggerErrorSpy: MockInstance;
  let processSpy: MockInstance;
  let tempHomeDir: string;
  let tempWorkspaceDir: string;

  beforeEach(() => {
    debugLoggerLogSpy = vi.spyOn(debugLogger, 'log');
    debugLoggerWarnSpy = vi.spyOn(debugLogger, 'warn');
    debugLoggerErrorSpy = vi.spyOn(debugLogger, 'error');
    processSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-home'));
    tempWorkspaceDir = fs.mkdtempSync(path.join(tempHomeDir, 'test-workspace'));
    vi.spyOn(process, 'cwd').mockReturnValue(tempWorkspaceDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
    fs.rmSync(tempWorkspaceDir, { recursive: true, force: true });
  });

  it('should validate an extension from a local dir', async () => {
    createExtension({
      extensionsDir: tempWorkspaceDir,
      name: 'local-ext-name',
      version: '1.0.0',
    });

    await handleValidate({
      path: 'local-ext-name',
    });
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      'Extension local-ext-name has been successfully validated.',
    );
  });

  it('should throw an error if the extension name is invalid', async () => {
    createExtension({
      extensionsDir: tempWorkspaceDir,
      name: 'INVALID_NAME',
      version: '1.0.0',
    });

    await handleValidate({
      path: 'INVALID_NAME',
    });
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Invalid extension name: "INVALID_NAME". Only letters (a-z, A-Z), numbers (0-9), and dashes (-) are allowed.',
      ),
    );
    expect(processSpy).toHaveBeenCalledWith(1);
  });

  it('should warn if version is not formatted with semver', async () => {
    createExtension({
      extensionsDir: tempWorkspaceDir,
      name: 'valid-name',
      version: '1',
    });

    await handleValidate({
      path: 'valid-name',
    });
    expect(debugLoggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "Version '1' does not appear to be standard semver (e.g., 1.0.0).",
      ),
    );
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      'Extension valid-name has been successfully validated.',
    );
  });

  it('should throw an error if context files are missing', async () => {
    createExtension({
      extensionsDir: tempWorkspaceDir,
      name: 'valid-name',
      version: '1.0.0',
      contextFileName: 'contextFile.md',
    });
    fs.rmSync(path.join(tempWorkspaceDir, 'valid-name/contextFile.md'));
    await handleValidate({
      path: 'valid-name',
    });
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'The following context files referenced in gemini-extension.json are missing: contextFile.md',
      ),
    );
    expect(processSpy).toHaveBeenCalledWith(1);
  });

  it('should throw an error if context file uses relative parent directory navigation', async () => {
    createExtension({
      extensionsDir: tempWorkspaceDir,
      name: 'parent-nav-ext',
      version: '1.0.0',
      contextFileName: '../secret.txt',
    });
    await handleValidate({
      path: 'parent-nav-ext',
    });
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Invalid context file path: "../secret.txt". Relative parent directory references ("..") are not allowed.',
      ),
    );
    expect(processSpy).toHaveBeenCalledWith(1);
  });

  it('should throw an error if context file uses URL-encoded relative parent directory navigation', async () => {
    createExtension({
      extensionsDir: tempWorkspaceDir,
      name: 'encoded-nav-ext',
      version: '1.0.0',
      contextFileName: '%2e%2e/secret.txt',
    });
    await handleValidate({
      path: 'encoded-nav-ext',
    });
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Invalid context file path: "%2e%2e/secret.txt". Relative parent directory references ("..") are not allowed.',
      ),
    );
    expect(processSpy).toHaveBeenCalledWith(1);
  });

  it('should throw an error if context file uses absolute path', async () => {
    createExtension({
      extensionsDir: tempWorkspaceDir,
      name: 'abs-path-ext',
      version: '1.0.0',
      contextFileName: '/etc/hosts',
    });
    await handleValidate({
      path: 'abs-path-ext',
    });
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Invalid context file path: "/etc/hosts". Absolute paths are not allowed.',
      ),
    );
    expect(processSpy).toHaveBeenCalledWith(1);
  });

  it('should successfully validate an extension with context file containing percent characters', async () => {
    createExtension({
      extensionsDir: tempWorkspaceDir,
      name: 'percent-name-ext',
      version: '1.0.0',
      contextFileName: '100%_complete.md',
    });
    await handleValidate({
      path: 'percent-name-ext',
    });
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      'Extension percent-name-ext has been successfully validated.',
    );
  });

  it('should validate an extension with a valid stdio MCP server', async () => {
    createExtension({
      extensionsDir: tempWorkspaceDir,
      name: 'stdio-ext',
      version: '1.0.0',
      mcpServers: {
        myServer: {
          command: 'node',
          args: ['server.js'],
        },
      },
    });
    await handleValidate({
      path: 'stdio-ext',
    });
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      'Extension stdio-ext has been successfully validated.',
    );
  });

  it('should validate an extension with a valid remote MCP server using url and type', async () => {
    createExtension({
      extensionsDir: tempWorkspaceDir,
      name: 'remote-ext',
      version: '1.0.0',
      mcpServers: {
        remoteServer: {
          url: 'https://example.com/mcp',
          type: 'http',
        },
      },
    });
    await handleValidate({
      path: 'remote-ext',
    });
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      'Extension remote-ext has been successfully validated.',
    );
  });

  it('should warn when an MCP server uses deprecated httpUrl but succeed validation', async () => {
    createExtension({
      extensionsDir: tempWorkspaceDir,
      name: 'deprecated-http-ext',
      version: '1.0.0',
      mcpServers: {
        myServer: {
          httpUrl: 'https://example.com/mcp',
        },
      },
    });
    await handleValidate({
      path: 'deprecated-http-ext',
    });
    expect(debugLoggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'MCP server "myServer" uses deprecated "httpUrl". Consider using "url" with "type": "http" instead.',
      ),
    );
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      'Extension deprecated-http-ext has been successfully validated.',
    );
  });

  it('should successfully validate the citlyze-mcp extension configuration with deprecation warning', async () => {
    createExtension({
      extensionsDir: tempWorkspaceDir,
      name: 'citlyze',
      version: '1.0.0',
      contextFileName: 'GEMINI.md',
      mcpServers: {
        citlyze: {
          httpUrl: 'https://app.citlyze.com/api/mcp',
          headers: {
            Authorization: 'Bearer ${CITLYZE_API_KEY}',
          },
          timeout: 30000,
        },
      },
    });
    await handleValidate({
      path: 'citlyze',
    });
    expect(debugLoggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'MCP server "citlyze" uses deprecated "httpUrl". Consider using "url" with "type": "http" instead.',
      ),
    );
    expect(debugLoggerLogSpy).toHaveBeenCalledWith(
      'Extension citlyze has been successfully validated.',
    );
  });

  it('should throw an error if an MCP server does not specify a transport', async () => {
    createExtension({
      extensionsDir: tempWorkspaceDir,
      name: 'missing-transport-ext',
      version: '1.0.0',
      mcpServers: {
        invalidServer: {
          timeout: 5000,
        },
      },
    });
    await handleValidate({
      path: 'missing-transport-ext',
    });
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'MCP server "invalidServer" must specify a transport (e.g., "command", "url", or "httpUrl").',
      ),
    );
    expect(processSpy).toHaveBeenCalledWith(1);
  });

  it('should throw an error if an MCP server specifies an invalid URL', async () => {
    createExtension({
      extensionsDir: tempWorkspaceDir,
      name: 'invalid-url-ext',
      version: '1.0.0',
      mcpServers: {
        invalidServer: {
          url: 'not-a-valid-url',
        },
      },
    });
    await handleValidate({
      path: 'invalid-url-ext',
    });
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'MCP server "invalidServer" specifies an invalid URL: "not-a-valid-url".',
      ),
    );
    expect(processSpy).toHaveBeenCalledWith(1);
  });

  it('should throw an error if mcpServers is not an object', async () => {
    const extDir = path.join(tempWorkspaceDir, 'bad-mcp-ext');
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(
      path.join(extDir, 'gemini-extension.json'),
      JSON.stringify({
        name: 'bad-mcp-ext',
        version: '1.0.0',
        mcpServers: 'not-an-object',
      }),
    );
    await handleValidate({
      path: 'bad-mcp-ext',
    });
    expect(debugLoggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('The "mcpServers" field must be an object.'),
    );
    expect(processSpy).toHaveBeenCalledWith(1);
  });
});
