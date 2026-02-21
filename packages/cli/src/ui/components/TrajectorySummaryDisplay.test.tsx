/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect } from 'vitest';
import { TrajectorySummaryDisplay } from './TrajectorySummaryDisplay.js';
import { UIStateContext, type UIState } from '../contexts/UIStateContext.js';

const renderWithHistory = async (history: UIState['history']) => {
  const uiState = { history } as Partial<UIState> as UIState;
  const result = render(
    <UIStateContext.Provider value={uiState}>
      <TrajectorySummaryDisplay />
    </UIStateContext.Provider>,
  );
  await result.waitUntilReady();
  return result;
};

describe('<TrajectorySummaryDisplay />', () => {
  it('renders the goal from the first user message', async () => {
    const { lastFrame } = await renderWithHistory([
      { id: 1, type: 'user', text: 'Add dark mode to the app' },
    ]);
    expect(lastFrame()).toContain('Goal: Add dark mode to the app');
  });

  it('extracts the goal from slash command arguments', async () => {
    const { lastFrame } = await renderWithHistory([
      { id: 1, type: 'user', text: '/plan Add support for evals' },
    ]);
    expect(lastFrame()).toContain('Goal: Add support for evals');
  });
});
