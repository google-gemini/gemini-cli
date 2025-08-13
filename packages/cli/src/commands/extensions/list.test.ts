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
import { listCommand } from './list.js';
import {
  loadExtensions,
  annotateActiveExtensionsFromDisabled,
} from '../../config/extension.js';

vi.mock('../../config/extension.js');

const mockedLoadExtensions = loadExtensions as Mock;
const mockedAnnotateActiveExtensions =
  annotateActiveExtensionsFromDisabled as Mock;

describe('extensions list command', () => {
  let consoleSpy: vi.SpyInstance;

  beforeEach(() => {
    vi.resetAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should display message when no extensions are installed', () => {
    mockedLoadExtensions.mockReturnValue([]);
    mockedAnnotateActiveExtensions.mockReturnValue([]);
    if (listCommand.handler) {
      const handler = listCommand.handler as () => void;
      handler();
    }
    expect(consoleSpy).toHaveBeenCalledWith('No extensions installed.');
  });

  it('should list all installed extensions', () => {
    mockedLoadExtensions.mockReturnValue([
      {
        config: { name: 'extension-1', version: '1.0.0' },
        path: '/path/to/extension-1',
      },
      { config: { name: 'ext2', version: '2.0.0' }, path: '/path/to/ext2' },
    ]);
    mockedAnnotateActiveExtensions.mockReturnValue([
      {
        name: 'extension-1',
        version: '1.0.0',
        isActive: true,
        path: '/path/to/extension-1',
      },
      {
        name: 'ext2',
        version: '2.0.0',
        isActive: true,
        path: '/path/to/ext2',
      },
    ]);

    if (listCommand.handler) {
      const handler = listCommand.handler as () => void;
      handler();
    }

    expect(consoleSpy).toHaveBeenCalledWith(
      'Name        | Version | Enabled | Path',
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '----------- | ------- | ------- | ----',
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      'extension-1 | 1.0.0   | true    | /path/to/extension-1',
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      'ext2        | 2.0.0   | true    | /path/to/ext2',
    );
  });
});
