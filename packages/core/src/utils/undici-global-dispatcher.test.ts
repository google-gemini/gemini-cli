/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Undici global dispatcher compatibility', () => {
  it('publishes the dispatcher symbol used by Node 26 built-in fetch', () => {
    const script = `
      import { Agent, setGlobalDispatcher } from 'undici';

      const node26GlobalDispatcher = Symbol.for('undici.globalDispatcher.2');
      const legacyGlobalDispatcher = Symbol.for('undici.globalDispatcher.1');
      const dispatcher = new Agent();

      setGlobalDispatcher(dispatcher);

      if (
        globalThis[node26GlobalDispatcher] !== dispatcher ||
        globalThis[legacyGlobalDispatcher] !== dispatcher
      ) {
        throw new Error('Undici did not publish both global dispatcher symbols.');
      }

      await dispatcher.close();
      console.log('dispatcher symbols published');
    `;

    const output = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(output.trim()).toBe('dispatcher symbols published');
  });
});
