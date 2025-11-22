/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { UserMessage } from './UserMessage.js';
import { describe, it, expect, vi } from 'vitest';

// Mock the commandUtils to control isSlashCommand behavior
vi.mock('../../utils/commandUtils.js', () => ({
  isSlashCommand: vi.fn((text: string) => text.startsWith('/')),
}));

describe('UserMessage', () => {
  it('renders normal user message with correct prefix', () => {
    const { lastFrame } = render(
      <UserMessage text="Hello Gemini" width={80} />,
    );
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });

  it('renders slash command message', () => {
    const { lastFrame } = render(<UserMessage text="/help" width={80} />);
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });

  it('renders multiline user message', () => {
    const message = 'Line 1\nLine 2';
    const { lastFrame } = render(<UserMessage text={message} width={80} />);
    const output = lastFrame();

    expect(output).toMatchSnapshot();
  });
});
