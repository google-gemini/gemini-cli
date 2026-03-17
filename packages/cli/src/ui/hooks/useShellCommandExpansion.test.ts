/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  extractShellCommandFromResponse,
  shouldExpandShellCommandInline,
} from './useShellCommandExpansion.js';

describe('useShellCommandExpansion helpers', () => {
  it('detects the inline shell expansion prefix only at the start', () => {
    expect(shouldExpandShellCommandInline('? list open tcp ports')).toBe(true);
    expect(shouldExpandShellCommandInline(' ? list open tcp ports')).toBe(
      false,
    );
    expect(shouldExpandShellCommandInline('l?ist open tcp ports')).toBe(false);
  });

  it('extracts a command from fenced output', () => {
    expect(
      extractShellCommandFromResponse(
        '```sh\nfind . -name "*.log" -mtime +7 -delete\n```',
      ),
    ).toBe('find . -name "*.log" -mtime +7 -delete');
  });

  it('extracts the first command line from noisy output', () => {
    expect(
      extractShellCommandFromResponse(
        '$ lsof -iTCP -sTCP:LISTEN -n -P\nThis lists listening TCP ports.',
      ),
    ).toBe('lsof -iTCP -sTCP:LISTEN -n -P');
  });
});
