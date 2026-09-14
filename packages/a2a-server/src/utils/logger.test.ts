/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_LOG_LEVEL = process.env['LOG_LEVEL'];

/** Imports the logger fresh, so the module reads the current LOG_LEVEL. */
const loadLogger = async () => {
  vi.resetModules();
  const { logger } = await import('./logger.js');
  return logger;
};

describe('a2a-server logger', () => {
  beforeEach(() => {
    delete process.env['LOG_LEVEL'];
  });

  afterEach(() => {
    if (ORIGINAL_LOG_LEVEL === undefined) {
      delete process.env['LOG_LEVEL'];
    } else {
      process.env['LOG_LEVEL'] = ORIGINAL_LOG_LEVEL;
    }
  });

  it('defaults to info when LOG_LEVEL is not set', async () => {
    expect((await loadLogger()).level).toBe('info');
  });

  it('honours LOG_LEVEL, which startup deliberately allow-lists', async () => {
    process.env['LOG_LEVEL'] = 'debug';

    expect((await loadLogger()).level).toBe('debug');
  });

  it('accepts a level whatever its case or padding', async () => {
    process.env['LOG_LEVEL'] = '  WARN ';

    expect((await loadLogger()).level).toBe('warn');
  });

  it('falls back to info rather than failing on an unknown level', async () => {
    process.env['LOG_LEVEL'] = 'chatty';

    expect((await loadLogger()).level).toBe('info');
  });

  /** What the transport would be handed, straight from the format pipeline. */
  const render = (
    logger: Awaited<ReturnType<typeof loadLogger>>,
    meta: object,
  ) =>
    String(
      (
        logger.format.transform({
          level: 'info',
          message: '[CoreAgent] Received /executeCommand request: ',
          ...meta,
        }) as { [key: symbol]: unknown }
      )[Symbol.for('message')],
    );

  it('redacts a credential in the metadata of a log call', async () => {
    const written = render(await loadLogger(), {
      command: 'ls',
      headers: { authorization: 'Bearer super-secret' },
    });

    expect(written).not.toContain('super-secret');
    expect(written).toContain('[REDACTED]');
    // The rest of the body is still there to debug with.
    expect(written).toContain('ls');
  });

  it('leaves a log call with no metadata alone', async () => {
    const written = render(await loadLogger(), {});

    expect(written).toContain('[CoreAgent] Received /executeCommand request: ');
    expect(written).not.toContain('[REDACTED]');
  });
});
