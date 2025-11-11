/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from 'ink';
import { describe, it, expect } from 'vitest';
import { StickyHeader } from './StickyHeader.js';
import { renderWithProviders } from '../../test-utils/render.js';

describe('StickyHeader', () => {
  it('renders children', () => {
    const { lastFrame } = renderWithProviders(
      <StickyHeader width={80}>
        <Text>Hello Sticky</Text>
      </StickyHeader>,
    );
    expect(lastFrame()).toContain('Hello Sticky');
  });
});
