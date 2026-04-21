/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { btwCommand } from './btwCommand.js';
import { CommandKind } from './types.js';
import type { CommandContext } from './types.js';

describe('btwCommand', () => {
  it('has the correct metadata', () => {
    expect(btwCommand.name).toBe('btw');
    expect(btwCommand.kind).toBe(CommandKind.BUILT_IN);
    expect(btwCommand.autoExecute).toBe(true);
    expect(btwCommand.isSafeConcurrent).toBe(true);
  });

  it('returns an error message when btw is not enabled in settings', () => {
    const context = {
      services: {
        settings: {
          merged: {
            experimental: {
              btw: false,
            },
          },
        },
      },
    } as unknown as CommandContext;
    const result = btwCommand.action!(context, 'question');
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content:
        '/btw is an experimental feature. To enable it, run `gemini settings set experimental.btw true`.',
    });
  });

  it('returns an error message when args are empty and btw is enabled', () => {
    const context = {
      services: {
        settings: {
          merged: {
            experimental: {
              btw: true,
            },
          },
        },
      },
    } as unknown as CommandContext;
    const result = btwCommand.action!(context, '   ');
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content:
        'Please provide a question, e.g. /btw what does this function do?',
    });
  });

  it('returns a btw action when query is provided and btw is enabled', () => {
    const context = {
      services: {
        settings: {
          merged: {
            experimental: {
              btw: true,
            },
          },
        },
      },
    } as unknown as CommandContext;
    const result = btwCommand.action!(context, ' what is this regex doing? ');
    expect(result).toEqual({
      type: 'btw',
      query: 'what is this regex doing?',
    });
  });
});
