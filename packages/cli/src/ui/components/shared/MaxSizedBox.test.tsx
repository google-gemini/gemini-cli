/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { MaxSizedBox } from './MaxSizedBox.js';
import { Box, Text } from 'ink';
import { describe, it, expect } from 'vitest';

describe('<MaxSizedBox />', () => {
  it('renders children without truncation when they fit', () => {
    const { lastFrame } = render(
      <MaxSizedBox maxWidth={80} maxHeight={10}>
        <Box>
          <Text>Hello, World!</Text>
        </Box>
      </MaxSizedBox>,
    );
    expect(lastFrame()).equals('Hello, World!');
  });

  it('hides lines when content exceeds maxHeight', () => {
    const { lastFrame } = render(
      <MaxSizedBox maxWidth={80} maxHeight={2}>
        <Box>
          <Text>Line 1</Text>
        </Box>
        <Box>
          <Text>Line 2</Text>
        </Box>
        <Box>
          <Text>Line 3</Text>
        </Box>
      </MaxSizedBox>,
    );
    expect(lastFrame()).equals(`... first 2 lines hidden ...
Line 3`);
  });

  it('hides lines at the end when content exceeds maxHeight and overflowDirection is bottom', () => {
    const { lastFrame } = render(
      <MaxSizedBox maxWidth={80} maxHeight={2} overflowDirection="bottom">
        <Box>
          <Text>Line 1</Text>
        </Box>
        <Box>
          <Text>Line 2</Text>
        </Box>
        <Box>
          <Text>Line 3</Text>
        </Box>
      </MaxSizedBox>,
    );
    expect(lastFrame()).equals(`Line 1
... last 2 lines hidden ...`);
  });

  it('wraps text that exceeds maxWidth', () => {
    const { lastFrame } = render(
      <MaxSizedBox maxWidth={10} maxHeight={5}>
        <Box>
          <Text wrap="wrap">This is a long line of text</Text>
        </Box>
      </MaxSizedBox>,
    );

    expect(lastFrame()).equals(`This is a
long line
of text`);
  });

  it('handles mixed wrapping and non-wrapping segments', () => {
    const multilineText = `This part will wrap around.
And has a line break.
  Leading spaces preserved.`;
    const { lastFrame } = render(
      <MaxSizedBox maxWidth={20} maxHeight={20}>
        <Box>
          <Text>Example</Text>
        </Box>
        <Box>
          <Text>No Wrap: </Text>
          <Text wrap="wrap">{multilineText}</Text>
        </Box>
        <Box>
          <Text>Longer No Wrap: </Text>
          <Text wrap="wrap">This part will wrap around.</Text>
        </Box>
      </MaxSizedBox>,
    );

    expect(lastFrame()).equals(
      `Example
No Wrap: This part
         will wrap
         around.
         And has a
         line break.
           Leading
         spaces
         preserved.
Longer No Wrap: This
                part
                will
                wrap
                arou
                nd.`,
    );
  });

  it('handles words longer than maxWidth by splitting them', () => {
    const { lastFrame } = render(
      <MaxSizedBox maxWidth={5} maxHeight={5}>
        <Box>
          <Text wrap="wrap">Supercalifragilisticexpialidocious</Text>
        </Box>
      </MaxSizedBox>,
    );

    expect(lastFrame()).equals(`... …
istic
expia
lidoc
ious`);
  });

  it('does not truncate when maxHeight is undefined', () => {
    const { lastFrame } = render(
      <MaxSizedBox maxWidth={80} maxHeight={undefined}>
        <Box>
          <Text>Line 1</Text>
        </Box>
        <Box>
          <Text>Line 2</Text>
        </Box>
      </MaxSizedBox>,
    );
    expect(lastFrame()).equals(`Line 1
Line 2`);
  });

  it('shows plural "lines" when more than one line is hidden', () => {
    const { lastFrame } = render(
      <MaxSizedBox maxWidth={80} maxHeight={2}>
        <Box>
          <Text>Line 1</Text>
        </Box>
        <Box>
          <Text>Line 2</Text>
        </Box>
        <Box>
          <Text>Line 3</Text>
        </Box>
      </MaxSizedBox>,
    );
    expect(lastFrame()).equals(`... first 2 lines hidden ...
Line 3`);
  });

  it('shows plural "lines" when more than one line is hidden and overflowDirection is bottom', () => {
    const { lastFrame } = render(
      <MaxSizedBox maxWidth={80} maxHeight={2} overflowDirection="bottom">
        <Box>
          <Text>Line 1</Text>
        </Box>
        <Box>
          <Text>Line 2</Text>
        </Box>
        <Box>
          <Text>Line 3</Text>
        </Box>
      </MaxSizedBox>,
    );
    expect(lastFrame()).equals(`Line 1
... last 2 lines hidden ...`);
  });

  it('renders an empty box for empty children', () => {
    const { lastFrame } = render(
      <MaxSizedBox maxWidth={80} maxHeight={10}></MaxSizedBox>,
    );
    // Expect an empty string or a box with nothing in it.
    // Ink renders an empty box as an empty string.
    expect(lastFrame()).equals('');
  });

  it('wraps text with multi-byte unicode characters correctly', () => {
    const { lastFrame } = render(
      <MaxSizedBox maxWidth={5} maxHeight={5}>
        <Box>
          <Text wrap="wrap">你好世界</Text>
        </Box>
      </MaxSizedBox>,
    );

    // "你好" has a visual width of 4. "世界" has a visual width of 4.
    // With maxWidth=5, it should wrap after the second character.
    expect(lastFrame()).equals(`你好
世界`);
  });

  it('wraps text with multi-byte emoji characters correctly', () => {
    const { lastFrame } = render(
      <MaxSizedBox maxWidth={5} maxHeight={5}>
        <Box>
          <Text wrap="wrap">🐶🐶🐶🐶🐶</Text>
        </Box>
      </MaxSizedBox>,
    );

    // Each "🐶" has a visual width of 2.
    // With maxWidth=5, it should wrap every 2 emojis.
    expect(lastFrame()).equals(`🐶🐶
🐶🐶
🐶`);
  });

  it('accounts for additionalHiddenLinesCount', () => {
    const { lastFrame } = render(
      <MaxSizedBox maxWidth={80} maxHeight={2} additionalHiddenLinesCount={5}>
        <Box>
          <Text>Line 1</Text>
        </Box>
        <Box>
          <Text>Line 2</Text>
        </Box>
        <Box>
          <Text>Line 3</Text>
        </Box>
      </MaxSizedBox>,
    );
    // 1 line is hidden by overflow, 5 are additionally hidden.
    expect(lastFrame()).equals(`... first 7 lines hidden ...
Line 3`);
  });

  it('handles React.Fragment as a child', () => {
    const { lastFrame } = render(
      <MaxSizedBox maxWidth={80} maxHeight={10}>
        <>
          <Box>
            <Text>Line 1 from Fragment</Text>
          </Box>
          <Box>
            <Text>Line 2 from Fragment</Text>
          </Box>
        </>
        <Box>
          <Text>Line 3 direct child</Text>
        </Box>
      </MaxSizedBox>,
    );
    expect(lastFrame()).equals(`Line 1 from Fragment
Line 2 from Fragment
Line 3 direct child`);
  });

  it('clips a long single text child from the top', () => {
    const THIRTY_LINES = Array.from(
      { length: 30 },
      (_, i) => `Line ${i + 1}`,
    ).join('\n');

    const { lastFrame } = render(
      <MaxSizedBox maxWidth={80} maxHeight={10}>
        <Box>
          <Text>{THIRTY_LINES}</Text>
        </Box>
      </MaxSizedBox>,
    );

    const expected = [
      '... first 21 lines hidden ...',
      ...Array.from({ length: 9 }, (_, i) => `Line ${22 + i}`),
    ].join('\n');

    expect(lastFrame()).equals(expected);
  });

  it('clips a long single text child from the bottom', () => {
    const THIRTY_LINES = Array.from(
      { length: 30 },
      (_, i) => `Line ${i + 1}`,
    ).join('\n');

    const { lastFrame } = render(
      <MaxSizedBox maxWidth={80} maxHeight={10} overflowDirection="bottom">
        <Box>
          <Text>{THIRTY_LINES}</Text>
        </Box>
      </MaxSizedBox>,
    );

    const expected = [
      ...Array.from({ length: 9 }, (_, i) => `Line ${i + 1}`),
      '... last 21 lines hidden ...',
    ].join('\n');

    expect(lastFrame()).equals(expected);
  });
});
