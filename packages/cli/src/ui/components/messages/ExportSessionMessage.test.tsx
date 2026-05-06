/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { describe, it, expect, vi } from 'vitest';
import { ExportSessionMessage } from './ExportSessionMessage.js';

vi.mock('../CliSpinner.js', () => ({
  CliSpinner: () => '[spinner]',
}));

describe('ExportSessionMessage', () => {
  it('renders pending state correctly', async () => {
    const { lastFrame } = await render(
      <ExportSessionMessage
        exportSession={{ isPending: true }}
      />
    );
    expect(lastFrame()).toContain('[spinner]');
    expect(lastFrame()).toContain('Exporting session...');
  });

  it('renders success state correctly', async () => {
    const { lastFrame } = await render(
      <ExportSessionMessage
        exportSession={{ 
          isPending: false, 
          targetPath: '/path/to/session.json' 
        }}
      />
    );
    expect(lastFrame()).toContain('✓');
    expect(lastFrame()).toContain('Successfully exported session to /path/to/session.json');
  });
});
