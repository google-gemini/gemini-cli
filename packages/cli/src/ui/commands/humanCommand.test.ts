/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { humanCommand } from './humanCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

describe('humanCommand', () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'human-cmd-'));
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
  });

  it('writes guidance to rules.json', async () => {
    const ctx = createMockCommandContext({});
    await humanCommand.action!(ctx, 'stay focused');
    const data = await fs.readFile(path.join(tmpDir, 'rules.json'), 'utf8');
    expect(JSON.parse(data)).toEqual(['stay focused']);
  });

  it('shows usage message when no args provided', async () => {
    const ctx = createMockCommandContext({});
    await humanCommand.action!(ctx, '');
    expect(ctx.ui.addItem).toHaveBeenCalledWith(
      { type: MessageType.ERROR, text: 'Usage: /human <guidance>' },
      expect.any(Number),
    );
  });
});
