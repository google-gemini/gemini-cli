/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandHandler } from './commandHandler.js';
import { describe, it, expect } from 'vitest';

describe('CommandHandler', () => {
  it('parses commands correctly', () => {
    const handler = new CommandHandler();
    // @ts-expect-error - testing private method
    const parse = (query: string) => handler.parseSlashCommand(query);

    const memShow = parse('/memory show');
    expect(memShow.commandToExecute?.name).toBe('memory show');
    expect(memShow.args).toBe('');

    const memAdd = parse('/memory add hello world');
    expect(memAdd.commandToExecute?.name).toBe('memory add');
    expect(memAdd.args).toBe('hello world');

    const extList = parse('/extensions list');
    expect(extList.commandToExecute?.name).toBe('extensions list');

    const init = parse('/init');
    expect(init.commandToExecute?.name).toBe('init');
  });
});
