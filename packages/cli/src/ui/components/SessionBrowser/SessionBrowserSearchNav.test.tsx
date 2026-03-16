/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { describe, it, expect } from 'vitest';
import {
  SearchModeDisplay,
  NavigationHelpDisplay,
  NoResultsDisplay,
} from './SessionBrowserNav.js';
import { SessionListHeader } from './SessionListHeader.js';
import type { SessionBrowserState } from '../SessionBrowser.js';

describe('SessionBrowser Search and Navigation Components', () => {
  it('SearchModeDisplay renders correctly with query', async () => {
    const mockState = { searchQuery: 'test query' } as SessionBrowserState;
    const { lastFrame, waitUntilReady } = render(
      <SearchModeDisplay state={mockState} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('NavigationHelp renders correctly', async () => {
    const { lastFrame, waitUntilReady } = render(<NavigationHelpDisplay />);
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('SessionListHeader renders correctly', async () => {
    const mockState = {
      totalSessions: 10,
      searchQuery: '',
      sortOrder: 'date',
      sortReverse: false,
    } as SessionBrowserState;
    const { lastFrame, waitUntilReady } = render(
      <SessionListHeader state={mockState} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('SessionListHeader renders correctly with filter', async () => {
    const mockState = {
      totalSessions: 5,
      searchQuery: 'test',
      sortOrder: 'name',
      sortReverse: true,
    } as SessionBrowserState;
    const { lastFrame, waitUntilReady } = render(
      <SessionListHeader state={mockState} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });

  it('NoResultsDisplay renders correctly', async () => {
    const mockState = { searchQuery: 'no match' } as SessionBrowserState;
    const { lastFrame, waitUntilReady } = render(
      <NoResultsDisplay state={mockState} />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
  });
});
