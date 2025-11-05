/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { Scrollable } from './Scrollable.js';
import { Text } from 'ink';
import { describe, it, expect, vi } from 'vitest';

vi.mock('ink', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ink')>();
  return {
    ...actual,
    getInnerHeight: vi.fn(() => 5),
    getScrollHeight: vi.fn(() => 10),
    getBoundingBox: vi.fn(() => ({ x: 0, y: 0, width: 10, height: 5 })),
  };
});

describe('<Scrollable />', () => {
  it('renders children', () => {
    const { lastFrame } = renderWithProviders(
      <Scrollable hasFocus={false} height={5}>
        <Text>Hello World</Text>
      </Scrollable>,
    );
    expect(lastFrame()).toContain('Hello World');
  });

  it('renders multiple children', () => {
    const { lastFrame } = renderWithProviders(
      <Scrollable hasFocus={false} height={5}>
        <Text>Line 1</Text>
        <Text>Line 2</Text>
        <Text>Line 3</Text>
      </Scrollable>,
    );
    expect(lastFrame()).toContain('Line 1');
    expect(lastFrame()).toContain('Line 2');
    expect(lastFrame()).toContain('Line 3');
  });

  it('matches snapshot', () => {
    const { lastFrame } = renderWithProviders(
      <Scrollable hasFocus={false} height={5}>
        <Text>Line 1</Text>
        <Text>Line 2</Text>
        <Text>Line 3</Text>
      </Scrollable>,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});
