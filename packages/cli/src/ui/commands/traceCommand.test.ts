/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { traceCommand } from './traceCommand.js';

describe('traceCommand', () => {
  it('adds the trace inspector view to history', async () => {
    const context = createMockCommandContext();

    if (!traceCommand.action) {
      throw new Error('traceCommand.action is required for this test');
    }

    await traceCommand.action(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith({
      type: 'trace',
    });
  });

  it('exposes /perf as an alias for discoverability', () => {
    expect(traceCommand.altNames).toContain('perf');
  });
});
