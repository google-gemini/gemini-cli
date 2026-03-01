/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { getToolGroupBorderAppearance } from './borderStyles.js';
import { CoreToolCallStatus } from '@google/gemini-cli-core';
import { theme } from '../semantic-colors.js';
import type { IndividualToolCallDisplay } from '../types.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { MainContent } from '../components/MainContent.js';

describe('getToolGroupBorderAppearance', () => {
  it('should use warning color for pending non-shell tools', () => {
    const item = {
      type: 'tool_group' as const,
      tools: [
        {
          name: 'google_web_search',
          status: CoreToolCallStatus.Executing,
          resultDisplay: '',
          callId: 'call-1',
        },
      ] as IndividualToolCallDisplay[],
    };
    const appearance = getToolGroupBorderAppearance(item, undefined, false, []);
    expect(appearance.borderColor).toBe(theme.status.warning);
    expect(appearance.borderDimColor).toBe(true);
  });

  it('should use correct color for empty slice by looking at pending items', () => {
    const pendingItem = {
      type: 'tool_group' as const,
      tools: [
        {
          name: 'google_web_search',
          status: CoreToolCallStatus.Executing,
          resultDisplay: '',
          callId: 'call-1',
        },
      ] as IndividualToolCallDisplay[],
    };
    const sliceItem = {
      type: 'tool_group' as const,
      tools: [] as IndividualToolCallDisplay[],
    };
    const allPendingItems = [pendingItem, sliceItem];

    const appearance = getToolGroupBorderAppearance(
      sliceItem,
      undefined,
      false,
      allPendingItems,
    );

    // It should match the pendingItem appearance
    expect(appearance.borderColor).toBe(theme.status.warning);
    expect(appearance.borderDimColor).toBe(true);
  });

  it('should use symbol color for shell tools', () => {
    const item = {
      type: 'tool_group' as const,
      tools: [
        {
          name: 'run_shell_command',
          status: CoreToolCallStatus.Executing,
          resultDisplay: '',
          callId: 'call-1',
        },
      ] as IndividualToolCallDisplay[],
    };
    const appearance = getToolGroupBorderAppearance(item, undefined, false, []);
    expect(appearance.borderColor).toBe(theme.ui.symbol);
    expect(appearance.borderDimColor).toBe(true);
  });
});

describe('MainContent tool group border SVG snapshots', () => {
  it('should render SVG snapshot for a pending search dialog (google_web_search)', async () => {
    const renderResult = renderWithProviders(<MainContent />, {
      uiState: {
        history: [],
        pendingHistoryItems: [
          {
            type: 'tool_group',
            tools: [
              {
                name: 'google_web_search',
                status: CoreToolCallStatus.Executing,
                resultDisplay: 'Searching...',
                callId: 'call-1',
              } as unknown as IndividualToolCallDisplay,
            ],
          },
        ],
      },
    });

    await renderResult.waitUntilReady();
    await expect(renderResult).toMatchSvgSnapshot();
  });

  it('should render SVG snapshot for an empty slice following a search tool', async () => {
    const renderResult = renderWithProviders(<MainContent />, {
      uiState: {
        history: [],
        pendingHistoryItems: [
          {
            type: 'tool_group',
            tools: [
              {
                name: 'google_web_search',
                status: CoreToolCallStatus.Executing,
                resultDisplay: 'Searching...',
                callId: 'call-1',
              } as unknown as IndividualToolCallDisplay,
            ],
          },
          {
            type: 'tool_group',
            tools: [],
          },
        ],
      },
    });

    await renderResult.waitUntilReady();
    await expect(renderResult).toMatchSvgSnapshot();
  });

  it('should render SVG snapshot for a shell tool', async () => {
    const renderResult = renderWithProviders(<MainContent />, {
      uiState: {
        history: [],
        pendingHistoryItems: [
          {
            type: 'tool_group',
            tools: [
              {
                name: 'run_shell_command',
                status: CoreToolCallStatus.Executing,
                resultDisplay: 'Running command...',
                callId: 'call-1',
              } as unknown as IndividualToolCallDisplay,
            ],
          },
        ],
      },
    });

    await renderResult.waitUntilReady();
    await expect(renderResult).toMatchSvgSnapshot();
  });
});
