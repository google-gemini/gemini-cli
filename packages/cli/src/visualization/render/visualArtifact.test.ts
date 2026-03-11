/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { renderVisualArtifact } from './visualArtifact.js';

describe('renderVisualArtifact', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0, tempDirs.length)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('renders HTML previews as ASCII art in ascii terminals', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gemini-preview-'));
    tempDirs.push(dir);
    const pngPath = join(dir, 'preview.png');

    const pixels = Buffer.from([
      255, 255, 255, 0, 0, 0, 255, 255, 255, 0, 0, 0, 0, 0, 0, 255, 255, 255, 0,
      0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 0, 0, 0, 0, 0,
      0, 255, 255, 255, 0, 0, 0, 255, 255, 255,
    ]);

    await sharp(pixels, {
      raw: { width: 4, height: 4, channels: 3 },
    })
      .png()
      .toFile(pngPath);

    const output = await renderVisualArtifact(
      {
        pngPath,
        widthPx: 4,
        heightPx: 4,
        fromCache: false,
      },
      {
        forceProtocol: 'ascii',
        diagramType: 'html',
        showMeta: false,
      },
    );

    expect(typeof output).toBe('string');
    expect(output).not.toContain('<!DOCTYPE html>');
    expect(output).not.toContain('PNG:');
    expect((output ?? '').trim().length).toBeGreaterThan(0);
  });
});
