/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { TerminalOutput } from './TerminalOutput.js';
import { Box, Text } from 'ink';

describe('<TerminalOutput />', () => {
  it('renders the output text correctly', () => {
    const { lastFrame } = render(
      <TerminalOutput output="Hello, World!" cursor={null} />,
    );

    expect(lastFrame()).toEqual(
      render(
        <Box flexDirection="column">
          <Text>Hello, World!</Text>
        </Box>,
      ).lastFrame(),
    );
  });

  it('renders a visible cursor at the correct position', () => {
    const { lastFrame } = render(
      <TerminalOutput output="Hello, World!" cursor={{ x: 7, y: 0 }} />,
    );

    expect(lastFrame()).toEqual(
      render(
        <Box flexDirection="column">
          <Text>
            Hello, <Text inverse>W</Text>orld!
          </Text>
        </Box>,
      ).lastFrame(),
    );
  });

  it('renders a visible cursor as a space at the end of a line', () => {
    const { lastFrame } = render(
      <TerminalOutput output="Hello" cursor={{ x: 5, y: 0 }} />,
    );

    expect(lastFrame()).toEqual(
      render(
        <Box flexDirection="column">
          <Text>
            Hello<Text inverse> </Text>
          </Text>
        </Box>,
      ).lastFrame(),
    );
  });

  it('does not render the cursor when isCursorVisible is false', () => {
    const { lastFrame } = render(
      <TerminalOutput output="Hello, World!" cursor={{ x: 7, y: 0 }} />,
    );

    expect(lastFrame()).toEqual(
      render(
        <Box flexDirection="column">
          <Text>Hello, World!</Text>
        </Box>,
      ).lastFrame(),
    );
  });

  it('handles multi-line output correctly', () => {
    const output = 'Line 1\nLine 2\nLine 3';
    const { lastFrame } = render(
      <TerminalOutput output={output} cursor={null} />,
    );

    expect(lastFrame()).toEqual(
      render(
        <Box flexDirection="column">
          <Text>Line 1</Text>
          <Text>Line 2</Text>
          <Text>Line 3</Text>
        </Box>,
      ).lastFrame(),
    );
  });

  it('renders a cursor on the correct line in multi-line output', () => {
    const output = 'Line 1\nLine 2\nLine 3';
    const { lastFrame } = render(
      <TerminalOutput output={output} cursor={{ x: 2, y: 1 }} />,
    );

    expect(lastFrame()).toEqual(
      render(
        <Box flexDirection="column">
          <Text>Line 1</Text>
          <Text>
            Li<Text inverse>n</Text>e 2
          </Text>
          <Text>Line 3</Text>
        </Box>,
      ).lastFrame(),
    );
  });

  it('handles empty output', () => {
    const { lastFrame } = render(<TerminalOutput output="" cursor={null} />);

    // Renders a single empty line
    expect(lastFrame()).toEqual(
      render(
        <Box flexDirection="column">
          <Text></Text>
        </Box>,
      ).lastFrame(),
    );
  });

  it('renders a cursor correctly in an empty output', () => {
    const { lastFrame } = render(
      <TerminalOutput output="" cursor={{ x: 0, y: 0 }} />,
    );

    expect(lastFrame()).toEqual(
      render(
        <Box flexDirection="column">
          <Text>
            <Text inverse> </Text>
          </Text>
        </Box>,
      ).lastFrame(),
    );
  });
});
