/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runServerMode } from './serverMode.js';
import * as nonInteractiveCli from './nonInteractiveCli.js';
import { Readable } from 'node:stream';

vi.mock('./nonInteractiveCli.js', () => ({
  runNonInteractive: vi.fn(),
}));

describe('Server Mode', () => {
  let stdinSpy: vi.SpyInstance;
  let stdinStream: Readable;

  beforeEach(() => {
    vi.clearAllMocks();
    stdinStream = new Readable({ read() {} });
    stdinSpy = vi.spyOn(process, 'stdin', 'get').mockReturnValue(stdinStream);
  });

  afterEach(() => {
    stdinSpy.mockRestore();
  });

  it('should process a single prompt', (done) => {
    (nonInteractiveCli.runNonInteractive as vi.Mock).mockImplementation(() => {
      expect(nonInteractiveCli.runNonInteractive).toHaveBeenCalledTimes(1);
      done();
      return Promise.resolve();
    });

    runServerMode();

    stdinStream.push('Hello\n');
    stdinStream.push('---GEMINI_CLI_PROMPT_END---\n');
    stdinStream.push(null);
  });
});
