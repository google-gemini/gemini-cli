/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';
import type { SpinnerName } from 'cli-spinners';

export function mockInkSpinner() {
  vi.mock('ink-spinner', async () => {
    const { Text } = await import('ink');
    const cliSpinners = (await import('cli-spinners')).default;

    return {
      default: function MockSpinner({ type = 'dots' }: { type?: SpinnerName }) {
        const spinner = cliSpinners[type];
        const frame = spinner ? spinner.frames[0] : '⠋';
        return <Text>{frame}</Text>;
      },
    };
  });
}
