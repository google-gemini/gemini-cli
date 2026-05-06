/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import { render } from '../../../test-utils/render.js';
import { Text } from 'ink';
import { describe, it, expect, vi } from 'vitest';
import { ExportSessionMessage } from './ExportSessionMessage.js';

vi.mock('../CliSpinner.js', () => ({
  CliSpinner: () => <Text>[spinner]</Text>,
}));

describe('ExportSessionMessage', () => {
  it('renders pending state correctly', async () => {
    const { lastFrame } = await render(
      <ExportSessionMessage exportSession={{ isPending: true }} />,
    );
    expect(lastFrame()).toContain('[spinner]');
    expect(lastFrame()).toContain('Exporting session...');
  });

  it('renders success state correctly', async () => {
    const testPath = path.join(path.sep, 'path', 'to', 'session.json');
    const { lastFrame } = await render(
      <ExportSessionMessage
        exportSession={{
          isPending: false,
          targetPath: testPath,
        }}
      />,
    );
    expect(lastFrame()).toContain('✓');
    expect(lastFrame()).toContain(
      `Successfully exported session to ${testPath}`,
    );
  });
});
