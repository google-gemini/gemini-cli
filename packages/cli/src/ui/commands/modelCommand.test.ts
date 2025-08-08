/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { modelCommand } from './modelCommand.js';
import { CommandContext } from './types.js';

describe('/model command', () => {
  it('should return the correct action for /model set', () => {
    const setCommand = modelCommand.subCommands?.find(
      (sc) => sc.name === 'set',
    );
    const result = setCommand?.action?.({} as CommandContext, '');
    expect(result).toEqual({ type: 'dialog', dialog: 'model' });
  });
});
