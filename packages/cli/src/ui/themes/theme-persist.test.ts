/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import { persistThemeAndReload } from './theme-persist.js';
import { themeManager } from './theme-manager.js';
import type { CustomTheme } from './theme.js';

vi.mock('fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  };
});

describe('theme-persist', () => {
  beforeEach(() => {
    vi.spyOn(themeManager, 'loadCustomThemes').mockResolvedValue(
      undefined as unknown as void,
    );
  });

  it('should persist a theme and trigger reload', async () => {
    const theme: CustomTheme = {
      type: 'custom',
      name: 'PersistedTheme',
    };
    const metadata = { name: 'PersistedTheme', source: 'test' };

    const path = await persistThemeAndReload(theme, metadata, {});

    expect(fs.mkdir).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalled();
    expect(themeManager.loadCustomThemes).toHaveBeenCalled();
    expect(path).toMatch(/PersistedTheme/);
  });
});
