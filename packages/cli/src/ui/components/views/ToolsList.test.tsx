/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ToolsList } from './ToolsList.js';
import { type ToolDefinition } from '../../types.js';

const mockTools: ToolDefinition[] = [
  {
    name: 'test-tool-one',
    displayName: 'Test Tool One',
    description: 'This is the first test tool.',
  },
  {
    name: 'test-tool-two',
    displayName: 'Test Tool Two',
    description: `This is the second test tool.
  1. Tool descriptions support markdown formatting.
  2. **note** use this tool wisely and be sure to consider how this tool interacts with word wrap.
  3. **important** this tool is awesome.`,
  },
  {
    name: 'test-tool-three',
    displayName: 'Test Tool Three',
    description: 'This is the third test tool.',
  },
];

describe('<ToolsList />', () => {
  it('renders correctly with descriptions', () => {
    const { lastFrame } = render(
      <ToolsList
        tools={mockTools}
        showDescriptions={true}
        terminalWidth={40}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly without descriptions', () => {
    const { lastFrame } = render(
      <ToolsList
        tools={mockTools}
        showDescriptions={false}
        terminalWidth={40}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with no tools', () => {
    const { lastFrame } = render(
      <ToolsList tools={[]} showDescriptions={true} terminalWidth={40} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });
});
