/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agent, setGlobalDispatcher } from 'undici';
import { afterEach, describe, expect, it } from 'vitest';

const node26GlobalDispatcher = Symbol.for('undici.globalDispatcher.2');
const legacyGlobalDispatcher = Symbol.for('undici.globalDispatcher.1');
const globalSymbols = globalThis as Record<symbol, unknown>;
const originalDispatcher = globalSymbols[legacyGlobalDispatcher];
let dispatcher: Agent | undefined;

describe('Undici global dispatcher compatibility', () => {
  afterEach(async () => {
    if (originalDispatcher) {
      setGlobalDispatcher(originalDispatcher as Agent);
    }
    await dispatcher?.close();
    dispatcher = undefined;
  });

  it('publishes the dispatcher symbol used by Node 26 built-in fetch', () => {
    dispatcher = new Agent();

    setGlobalDispatcher(dispatcher);

    expect(globalSymbols[node26GlobalDispatcher]).toBe(dispatcher);
    expect(globalSymbols[legacyGlobalDispatcher]).toBe(dispatcher);
  });
});
