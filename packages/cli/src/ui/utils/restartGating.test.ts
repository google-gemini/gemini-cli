/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  isCommandAllowedDuringRestart,
  shouldBlockPromptForRestart,
} from './restartGating.js';

describe('restartGating', () => {
  it.each(['/about', '/help', '/quit'])(
    'allows %s during restart-required mode',
    (command) => {
      expect(isCommandAllowedDuringRestart(command)).toBe(true);
      expect(shouldBlockPromptForRestart(command, true)).toBe(false);
    },
  );

  it('allows supported commands with arguments', () => {
    expect(isCommandAllowedDuringRestart('/help commands')).toBe(true);
    expect(isCommandAllowedDuringRestart('/about details')).toBe(true);
  });

  it.each(['normal prompt', '/clear', '//comment', ''])(
    'blocks "%s" during restart-required mode',
    (query) => {
      expect(shouldBlockPromptForRestart(query, true)).toBe(true);
    },
  );

  it('does not block anything when restart is not required', () => {
    expect(shouldBlockPromptForRestart('normal prompt', false)).toBe(false);
    expect(shouldBlockPromptForRestart('/clear', false)).toBe(false);
    expect(shouldBlockPromptForRestart('/help', false)).toBe(false);
  });
});
