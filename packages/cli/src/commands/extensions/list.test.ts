/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { listCommand } from './list.js';
import { loadExtensions } from '../../config/extension.js';

vi.mock('../../config/extension.js');

const mockedLoadExtensions = loadExtensions as vi.Mock;

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
    if (listCommand.handler) {
        const handler = listCommand.handler as () => void;
        handler();
    }
    expect(consoleSpy).toHaveBeenCalledWith('Installed extensions:');
  });

  it('should list all installed extensions', () => {
    mockedLoadExtensions.mockReturnValue([
      { config: { name: 'extension-1' } },
      { config: { name: 'extension-2' } },
    ]);

    if (listCommand.handler) {
        const handler = listCommand.handler as () => void;
        handler();
    }

    expect(consoleSpy).toHaveBeenCalledWith('Installed extensions:');
    expect(consoleSpy).toHaveBeenCalledWith('- extension-1');
    expect(consoleSpy).toHaveBeenCalledWith('- extension-2');
  });
});
