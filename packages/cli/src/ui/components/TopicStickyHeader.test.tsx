/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { TopicStickyHeader } from './TopicStickyHeader.js';
import { describe, it, expect } from 'vitest';

describe('<TopicStickyHeader />', () => {
  it('should render nothing when currentTopic is null', async () => {
    const uiState = {
      currentTopic: null,
      terminalWidth: 100,
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <TopicStickyHeader />,
      {
        uiState,
      },
    );

    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('should render nothing when currentTopic has no title and no summary', async () => {
    const uiState = {
      currentTopic: { title: undefined, summary: undefined },
      terminalWidth: 100,
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <TopicStickyHeader />,
      {
        uiState,
      },
    );

    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('should render topic title', async () => {
    const uiState = {
      currentTopic: { title: 'My Awesome Topic' },
      terminalWidth: 100,
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <TopicStickyHeader />,
      {
        uiState,
      },
    );

    expect(lastFrame()).toContain('My Awesome Topic');
    expect(lastFrame()).not.toContain('Topic:');
    unmount();
  });

  it('should render topic title and summary', async () => {
    const uiState = {
      currentTopic: { 
        title: 'My Awesome Topic',
        summary: 'This is a brief summary'
      },
      terminalWidth: 100,
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <TopicStickyHeader />,
      {
        uiState,
      },
    );

    expect(lastFrame()).toContain('My Awesome Topic');
    expect(lastFrame()).toContain(': This is a brief summary');
    unmount();
  });

  it('should render default title when only summary is present', async () => {
    const uiState = {
      currentTopic: { 
        summary: 'Just a summary'
      },
      terminalWidth: 100,
    };

    const { lastFrame, unmount } = await renderWithProviders(
      <TopicStickyHeader />,
      {
        uiState,
      },
    );

    expect(lastFrame()).toContain('Topic');
    expect(lastFrame()).toContain(': Just a summary');
    unmount();
  });
});
