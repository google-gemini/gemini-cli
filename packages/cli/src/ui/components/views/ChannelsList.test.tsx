/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ChannelsList } from './ChannelsList.js';
import { type ChannelInfo } from '../../types.js';
import { renderWithProviders } from '../../../test-utils/render.js';

const mockChannels: ChannelInfo[] = [
  {
    name: 'telegram',
    displayName: 'Telegram',
    supportsReply: true,
  },
  {
    name: 'minimal-channel',
    supportsReply: false,
  },
];

describe('<ChannelsList />', () => {
  it('renders correctly with active channels', async () => {
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <ChannelsList channels={mockChannels} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders correctly with no active channels', async () => {
    const { lastFrame, waitUntilReady } = await renderWithProviders(
      <ChannelsList channels={[]} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });
});
