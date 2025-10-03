/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { ChatList } from './ChatList.js';
import type { ChatDetail } from '../../types.js';

const mockChats: ChatDetail[] = [
  {
    name: 'chat-1',
    mtime: '2025-10-02T10:00:00.000Z',
  },
  {
    name: 'another-chat',
    mtime: '2025-10-01T12:30:00.000Z',
  },
];

describe('<ChatList />', () => {
  it('renders correctly with a list of chats', () => {
    const { lastFrame } = render(<ChatList chats={mockChats} />);
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with no chats', () => {
    const { lastFrame } = render(<ChatList chats={[]} />);
    expect(lastFrame()).toContain('No saved conversation checkpoints found.');
    expect(lastFrame()).toMatchSnapshot();
  });

  it('handles invalid date formats gracefully', () => {
    const mockChatsWithInvalidDate: ChatDetail[] = [
      {
        name: 'bad-date-chat',
        mtime: 'an-invalid-date-string',
      },
    ];
    const { lastFrame } = render(<ChatList chats={mockChatsWithInvalidDate} />);
    expect(lastFrame()).toContain('(Invalid Date)');
    expect(lastFrame()).toMatchSnapshot();
  });
});
