/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { customDeepMerge } from '../utils/deepMerge.js';
import { getMergeStrategyForPath } from './settings.js';

describe('customDeepMerge with REPLACE strategy for customThemes', () => {
  it('should replace global custom theme with project custom theme using real schema', () => {
    const globalSettings = {
      ui: {
        customThemes: {
          MyTheme: {
            name: 'My Theme',
            type: 'custom',
            text: {
              primary: '#ffffff',
            },
          },
        },
      },
    };

    const projectSettings = {
      ui: {
        customThemes: {
          MyTheme: {
            path: '/path/to/theme.json',
          },
        },
      },
    };

    const merged = customDeepMerge(
      getMergeStrategyForPath,
      globalSettings,
      projectSettings,
    );

    // This assertion verifies that:
    // 1. getMergeStrategyForPath correctly resolves the path ['ui', 'customThemes', 'MyTheme']
    //    against the real schema (which uses additionalProperties).
    // 2. The schema definition for customThemes.additionalProperties has mergeStrategy: REPLACE.
    // 3. customDeepMerge executes the replacement.
    expect(merged).toEqual({
      ui: {
        customThemes: {
          MyTheme: {
            path: '/path/to/theme.json',
          },
        },
      },
    });
  });

  it('should merge other settings normally while replacing custom themes', () => {
    const globalSettings = {
      ui: {
        theme: 'Default',
        customThemes: {
          ThemeA: { name: 'A', type: 'custom' },
        },
      },
    };

    const projectSettings = {
      ui: {
        customThemes: {
          ThemeA: { path: '/path/to/A.json' },
          ThemeB: { path: '/path/to/B.json' },
        },
      },
    };

    const merged = customDeepMerge(
      getMergeStrategyForPath,
      globalSettings,
      projectSettings,
    );

    expect(merged).toEqual({
      ui: {
        theme: 'Default',
        customThemes: {
          ThemeA: { path: '/path/to/A.json' },
          ThemeB: { path: '/path/to/B.json' },
        },
      },
    });
  });
});
