/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { SessionProvider, useSession } from './SessionContext.js';
import { describe, it, expect } from 'vitest';

const TestComponent = () => {
  const { startTime } = useSession();
  return <Text>{startTime.toISOString()}</Text>;
};

describe('SessionContext', () => {
  it('should provide a start time', () => {
    const { lastFrame } = render(
      <SessionProvider>
        <TestComponent />
      </SessionProvider>,
    );

    const frameText = lastFrame();
    // Check if the output is a valid ISO string, which confirms it's a Date object.
    expect(new Date(frameText!).toString()).not.toBe('Invalid Date');
  });
});
