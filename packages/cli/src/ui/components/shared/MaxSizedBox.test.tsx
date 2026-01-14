/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { OverflowProvider } from '../../contexts/OverflowContext.js';
import { MaxSizedBox } from './MaxSizedBox.js';
import { Box, Text } from 'ink';
import { describe, it, expect } from 'vitest';

describe('<MaxSizedBox />', () => {
  it('renders children without truncation when they fit', async () => {
    const { lastFrame, unmount } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={10}>
          <Box>
            <Text>Hello, World!</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    await waitFor(() => expect(lastFrame()).toContain('Hello, World!'));
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('hides lines when content exceeds maxHeight', async () => {
    const { lastFrame, unmount } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={2}>
          <Box flexDirection="column">
            <Text>Line 1</Text>
            <Text>Line 2</Text>
            <Text>Line 3</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    await waitFor(() =>
      expect(lastFrame()).toContain('... first 2 lines hidden ...'),
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('hides lines at the end when content exceeds maxHeight and overflowDirection is bottom', async () => {
    const { lastFrame, unmount } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={2} overflowDirection="bottom">
          <Box flexDirection="column">
            <Text>Line 1</Text>
            <Text>Line 2</Text>
            <Text>Line 3</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    await waitFor(() =>
      expect(lastFrame()).toContain('... last 2 lines hidden ...'),
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('shows plural "lines" when more than one line is hidden', async () => {
    const { lastFrame, unmount } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={2}>
          <Box flexDirection="column">
            <Text>Line 1</Text>
            <Text>Line 2</Text>
            <Text>Line 3</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    await waitFor(() =>
      expect(lastFrame()).toContain('... first 2 lines hidden ...'),
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('shows singular "line" when exactly one line is hidden', async () => {
    const { lastFrame, unmount } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={2} additionalHiddenLinesCount={1}>
          <Box flexDirection="column">
            <Text>Line 1</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    await waitFor(() =>
      expect(lastFrame()).toContain('... first 1 line hidden ...'),
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('accounts for additionalHiddenLinesCount', async () => {
    const { lastFrame, unmount } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={2} additionalHiddenLinesCount={5}>
          <Box flexDirection="column">
            <Text>Line 1</Text>
            <Text>Line 2</Text>
            <Text>Line 3</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    await waitFor(() =>
      expect(lastFrame()).toContain('... first 7 lines hidden ...'),
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('wraps text that exceeds maxWidth', async () => {
    const { lastFrame, unmount } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={10} maxHeight={5}>
          <Box>
            <Text wrap="wrap">This is a long line of text</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );

    await waitFor(() => expect(lastFrame()).toContain('This is a'));
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('does not truncate when maxHeight is undefined', async () => {
    const { lastFrame, unmount } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={undefined}>
          <Box flexDirection="column">
            <Text>Line 1</Text>
            <Text>Line 2</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    await waitFor(() => expect(lastFrame()).toContain('Line 1'));
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders an empty box for empty children', async () => {
    const { lastFrame, unmount } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={10}></MaxSizedBox>
      </OverflowProvider>,
    );
    // Use waitFor to ensure ResizeObserver has a chance to run
    await waitFor(() => expect(lastFrame()).toBeDefined());
    expect(lastFrame()?.trim()).equals('');
    unmount();
  });

  it('handles React.Fragment as a child', async () => {
    const { lastFrame, unmount } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={10}>
          <Box flexDirection="column">
            <>
              <Text>Line 1 from Fragment</Text>
              <Text>Line 2 from Fragment</Text>
            </>
            <Text>Line 3 direct child</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );
    await waitFor(() => expect(lastFrame()).toContain('Line 1 from Fragment'));
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('clips a long single text child from the top', async () => {
    const THIRTY_LINES = Array.from(
      { length: 30 },
      (_, i) => `Line ${i + 1}`,
    ).join('\n');
    const { lastFrame, unmount } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={10} overflowDirection="top">
          <Box>
            <Text>{THIRTY_LINES}</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );

    await waitFor(() =>
      expect(lastFrame()).toContain('... first 21 lines hidden ...'),
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('clips a long single text child from the bottom', async () => {
    const THIRTY_LINES = Array.from(
      { length: 30 },
      (_, i) => `Line ${i + 1}`,
    ).join('\n');
    const { lastFrame, unmount } = render(
      <OverflowProvider>
        <MaxSizedBox maxWidth={80} maxHeight={10} overflowDirection="bottom">
          <Box>
            <Text>{THIRTY_LINES}</Text>
          </Box>
        </MaxSizedBox>
      </OverflowProvider>,
    );

    await waitFor(() =>
      expect(lastFrame()).toContain('... last 21 lines hidden ...'),
    );
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
