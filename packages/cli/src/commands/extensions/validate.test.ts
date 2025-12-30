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
    const validationParser = yargs([]).command(validateCommand).fail(false);
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
});
