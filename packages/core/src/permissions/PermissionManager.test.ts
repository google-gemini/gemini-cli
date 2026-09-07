/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { PermissionManager } from './PermissionManager.js';
import { CapabilityDeniedError } from './Capability.js';

describe('PermissionManager', () => {
  it('allows read-only operations by default', () => {
    const manager = new PermissionManager();
    expect(manager.check('filesystem.read')).toBe('ALLOW');
    expect(manager.check('filesystem.search')).toBe('ALLOW');
    expect(manager.check('git.status')).toBe('ALLOW');
    expect(manager.check('git.diff')).toBe('ALLOW');
    expect(manager.check('git.log')).toBe('ALLOW');

    expect(() => manager.assertAllowed('filesystem.read')).not.toThrow();
  });

  it('denies mutating operations by default', () => {
    const manager = new PermissionManager();
    expect(manager.check('filesystem.write')).toBe('DENY');
    expect(manager.check('code.patch')).toBe('DENY');
    expect(manager.check('code.generate')).toBe('DENY');
    expect(manager.check('git.commit')).toBe('DENY');

    expect(() => manager.assertAllowed('filesystem.write')).toThrow(CapabilityDeniedError);
    expect(() => manager.assertAllowed('code.patch')).toThrow(CapabilityDeniedError);
  });

  it('asks for shell.execute by default', () => {
    const manager = new PermissionManager();
    expect(manager.check('shell.execute')).toBe('ASK');
  });

  it('allows custom capability overrides', () => {
    const manager = new PermissionManager({
      'shell.execute': 'ALLOW',
    });
    expect(manager.check('shell.execute')).toBe('ALLOW');
  });
});
