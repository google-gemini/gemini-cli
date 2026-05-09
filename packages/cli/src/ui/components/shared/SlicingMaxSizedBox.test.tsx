/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { OverflowProvider } from '../../contexts/OverflowContext.js';
import { SlicingMaxSizedBox } from './SlicingMaxSizedBox.js';
import { Box, Text } from 'ink';
import { describe, it, expect } from 'vitest';

describe('<SlicingMaxSizedBox />', () => {
  it('renders string data without slicing when it fits', async () => {
    const { lastFrame, unmount } = await render(
      <OverflowProvider>
        <SlicingMaxSizedBox data="Hello World" maxWidth={80}>
          {(truncatedData) => <Text>{truncatedData}</Text>}
        </SlicingMaxSizedBox>
      </OverflowProvider>,
    );
    expect(lastFrame()).toContain('Hello World');
    unmount();
  });

  it('slices string data by characters when very long', async () => {
    const veryLongString = 'A'.repeat(25000);
    const { lastFrame, unmount } = await render(
      <OverflowProvider>
        <SlicingMaxSizedBox
          data={veryLongString}
          maxWidth={80}
          overflowDirection="bottom"
        >
          {(truncatedData) => <Text>{truncatedData.length}</Text>}
        </SlicingMaxSizedBox>
      </OverflowProvider>,
    );
    // 20000 characters + 3 for '...'
    expect(lastFrame()).toContain('20003');
    unmount();
  });

  it('slices string data by lines when maxLines is provided', async () => {
    const multilineString = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    const { lastFrame, unmount } = await render(
      <OverflowProvider>
        <SlicingMaxSizedBox
          data={multilineString}
          maxLines={3}
          maxWidth={80}
          maxHeight={10}
          overflowDirection="bottom"
        >
          {(truncatedData) => <Text>{truncatedData}</Text>}
        </SlicingMaxSizedBox>
      </OverflowProvider>,
    );
    // maxLines=3, so it should keep 3-1 = 2 lines
    expect(lastFrame()).toContain('Line 1');
    expect(lastFrame()).toContain('Line 2');
    expect(lastFrame()).not.toContain('Line 3');
    expect(lastFrame()).toContain(
      '... last 3 lines hidden (Ctrl+O to show) ...',
    );
    unmount();
  });

  it('slices array data when maxLines is provided', async () => {
    const dataArray = ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5'];
    const { lastFrame, unmount } = await render(
      <OverflowProvider>
        <SlicingMaxSizedBox
          data={dataArray}
          maxLines={3}
          maxWidth={80}
          maxHeight={10}
          overflowDirection="bottom"
        >
          {(truncatedData) => (
            <Box flexDirection="column">
              {truncatedData.map((item, i) => (
                <Text key={i}>{item}</Text>
              ))}
            </Box>
          )}
        </SlicingMaxSizedBox>
      </OverflowProvider>,
    );
    // maxLines=3, so it should keep 3-1 = 2 items
    expect(lastFrame()).toContain('Item 1');
    expect(lastFrame()).toContain('Item 2');
    expect(lastFrame()).not.toContain('Item 3');
    expect(lastFrame()).toContain(
      '... last 3 lines hidden (Ctrl+O to show) ...',
    );
    unmount();
  });

  it('does not slice when isAlternateBuffer is true', async () => {
    const multilineString = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    const { lastFrame, unmount } = await render(
      <OverflowProvider>
        <SlicingMaxSizedBox
          data={multilineString}
          maxLines={3}
          maxWidth={80}
          isAlternateBuffer={true}
        >
          {(truncatedData) => <Text>{truncatedData}</Text>}
        </SlicingMaxSizedBox>
      </OverflowProvider>,
    );
    expect(lastFrame()).toContain('Line 5');
    expect(lastFrame()).not.toContain('hidden');
    unmount();
  });
});
