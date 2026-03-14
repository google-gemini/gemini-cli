/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const toolsReferencePath = resolve(
  import.meta.dirname,
  '../../docs/reference/tools.md',
);

async function getAvailableToolsSection(): Promise<string> {
  const toolsReference = await readFile(toolsReferencePath, 'utf8');
  const [, afterHeading = ''] = toolsReference.split('## Available tools');
  const [section = ''] = afterHeading.split('## Under the hood');
  return section;
}

describe('tools reference docs', () => {
  it('keeps table descriptions free of embedded parameter lists', async () => {
    await expect(getAvailableToolsSection()).resolves.not.toContain(
      '**Parameters:**',
    );
  });
});
