/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  isTouchTerminalEnvironment,
  shouldAllowMouseEvents,
  shouldEnableMouseEvents,
} from './mouseEvents.js';

describe('mouseEvents', () => {
  it('enables mouse events in alternate buffer by default on desktop', () => {
    expect(shouldEnableMouseEvents(true, 'auto', {})).toBe(true);
  });

  it('does not enable mouse events outside alternate buffer', () => {
    expect(shouldEnableMouseEvents(false, 'enabled', {})).toBe(false);
    expect(shouldAllowMouseEvents('enabled', {})).toBe(true);
  });

  it('honors explicit disabled and enabled settings', () => {
    expect(shouldEnableMouseEvents(true, 'disabled', {})).toBe(false);
    expect(
      shouldEnableMouseEvents(true, 'enabled', { TERMUX_VERSION: '0.118.0' }),
    ).toBe(true);
  });

  it.each([
    [{ TERMUX_VERSION: '0.118.0' }],
    [{ ANDROID_ROOT: '/system' }],
    [{ ANDROID_DATA: '/data' }],
    [{ PREFIX: '/data/data/com.termux/files/usr' }],
  ])('detects touch terminal environment %#', (env) => {
    expect(isTouchTerminalEnvironment(env)).toBe(true);
    expect(shouldEnableMouseEvents(true, 'auto', env)).toBe(false);
  });
});
