/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { resolveVitestModes } from '../vitest/modes.js';

describe('resolveVitestModes', () => {
  it('enables verbose mode for an explicit forwarded flag', () => {
    const result = resolveVitestModes([
      'run',
      '--verbose',
      '--config',
      'vitest.config.ts',
    ]);

    expect(result.verboseMode).toBe(true);
    expect(result.forwardedArgs).toEqual([
      'run',
      '--config',
      'vitest.config.ts',
    ]);
  });

  it('enables verbose mode when npm consumes --verbose as loglevel', () => {
    const result = resolveVitestModes(['run', '--config', 'vitest.config.ts'], {
      npm_config_loglevel: 'verbose',
    });

    expect(result.verboseMode).toBe(true);
  });

  it('does not enable verbose mode for normal npm loglevels', () => {
    const result = resolveVitestModes(['run'], {
      npm_config_loglevel: 'notice',
    });

    expect(result.verboseMode).toBe(false);
  });
});
