/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { requestStorage } from './requestStorage.js';

describe('requestStorage', () => {
  it('should be an instance of AsyncLocalStorage', () => {
    expect(requestStorage).toBeInstanceOf(AsyncLocalStorage);
  });

  it('should have getStore method', () => {
    expect(requestStorage.getStore).toBeDefined();
    expect(typeof requestStorage.getStore).toBe('function');
  });

  it('should have run method', () => {
    expect(requestStorage.run).toBeDefined();
    expect(typeof requestStorage.run).toBe('function');
  });

  it('should have enterWith method', () => {
    expect(requestStorage.enterWith).toBeDefined();
    expect(typeof requestStorage.enterWith).toBe('function');
  });

  it('should return undefined when no context is set', () => {
    const store = requestStorage.getStore();
    expect(store).toBeUndefined();
  });

  it('should store and retrieve request context', async () => {
    const mockReq = { url: '/test', method: 'GET' } as never;

    await new Promise<void>((resolve) => {
      requestStorage.run({ req: mockReq }, () => {
        const stored = requestStorage.getStore();
        expect(stored).toBeDefined();
        expect(stored?.req).toBe(mockReq);
        resolve();
      });
    });
  });

  it('should isolate contexts', async () => {
    const req1 = { url: '/test1' } as never;
    const req2 = { url: '/test2' } as never;

    await new Promise<void>((resolve) => {
      requestStorage.run({ req: req1 }, () => {
        expect(requestStorage.getStore()?.req).toBe(req1);

        requestStorage.run({ req: req2 }, () => {
          expect(requestStorage.getStore()?.req).toBe(req2);
        });

        expect(requestStorage.getStore()?.req).toBe(req1);
        resolve();
      });
    });
  });
});
