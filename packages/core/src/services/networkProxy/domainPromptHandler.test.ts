/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { DomainPromptHandler } from './domainPromptHandler.js';
import { DomainFilterAction } from './types.js';
import type { NetworkProxyManager } from './networkProxyManager.js';

function createMockManager(): EventEmitter & Partial<NetworkProxyManager> {
  return new EventEmitter();
}

describe('DomainPromptHandler', () => {
  it('attaches and detaches correctly', () => {
    const manager = createMockManager();
    const callback = vi.fn().mockResolvedValue(DomainFilterAction.ALLOW);
    const handler = new DomainPromptHandler(
      manager as NetworkProxyManager,
      callback,
    );

    expect(handler.isAttached()).toBe(false);

    handler.attach();
    expect(handler.isAttached()).toBe(true);
    expect(manager.listenerCount('domainCheck')).toBe(1);

    handler.detach();
    expect(handler.isAttached()).toBe(false);
    expect(manager.listenerCount('domainCheck')).toBe(0);
  });

  it('does not double-attach', () => {
    const manager = createMockManager();
    const callback = vi.fn().mockResolvedValue(DomainFilterAction.ALLOW);
    const handler = new DomainPromptHandler(
      manager as NetworkProxyManager,
      callback,
    );

    handler.attach();
    handler.attach(); // should be a no-op
    expect(manager.listenerCount('domainCheck')).toBe(1);

    handler.detach();
  });

  it('calls the prompt callback with the hostname', async () => {
    const manager = createMockManager();
    const callback = vi.fn().mockResolvedValue(DomainFilterAction.ALLOW);
    const handler = new DomainPromptHandler(
      manager as NetworkProxyManager,
      callback,
    );

    handler.attach();

    const decision = await new Promise<DomainFilterAction>((resolve) => {
      manager.emit('domainCheck', 'test.example.com', resolve);
    });

    expect(callback).toHaveBeenCalledWith('test.example.com');
    expect(decision).toBe(DomainFilterAction.ALLOW);

    handler.detach();
  });

  it('relays deny decisions from the callback', async () => {
    const manager = createMockManager();
    const callback = vi.fn().mockResolvedValue(DomainFilterAction.DENY);
    const handler = new DomainPromptHandler(
      manager as NetworkProxyManager,
      callback,
    );

    handler.attach();

    const decision = await new Promise<DomainFilterAction>((resolve) => {
      manager.emit('domainCheck', 'blocked.com', resolve);
    });

    expect(decision).toBe(DomainFilterAction.DENY);

    handler.detach();
  });

  it('denies on callback failure for safety', async () => {
    const manager = createMockManager();
    const callback = vi.fn().mockRejectedValue(new Error('prompt failed'));
    const handler = new DomainPromptHandler(
      manager as NetworkProxyManager,
      callback,
    );

    handler.attach();

    const decision = await new Promise<DomainFilterAction>((resolve) => {
      manager.emit('domainCheck', 'error.com', resolve);
    });

    expect(decision).toBe(DomainFilterAction.DENY);

    handler.detach();
  });

  it('detach is safe to call when not attached', () => {
    const manager = createMockManager();
    const callback = vi.fn().mockResolvedValue(DomainFilterAction.ALLOW);
    const handler = new DomainPromptHandler(
      manager as NetworkProxyManager,
      callback,
    );

    // Should not throw
    handler.detach();
    expect(handler.isAttached()).toBe(false);
  });
});
