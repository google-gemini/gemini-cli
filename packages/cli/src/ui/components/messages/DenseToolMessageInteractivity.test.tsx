/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { VirtualizedList } from '../shared/VirtualizedList.js';
import { DenseToolMessage } from './DenseToolMessage.js';
import { Box } from 'ink';
import { CoreToolCallStatus, makeFakeConfig } from '@google/gemini-cli-core';
import { createMockSettings } from '../../../test-utils/settings.js';
import { describe, it, expect } from 'vitest';

describe('DenseToolMessage Interactivity in VirtualizedList', () => {
  const keyExtractor = (item: { id: string }) => item.id;

  it('toggles expansion when header is clicked in a VirtualizedList', async () => {
    const data = [{ id: '1' }];
    const diffResult = {
      fileName: 'test.ts',
      filePath: 'test.ts',
      fileDiff: '--- test.ts\n+++ test.ts\n@@ -1,1 +1,1 @@\n-old\n+new',
      diffStat: { model_added_lines: 1, model_removed_lines: 1 },
      originalContent: 'old',
      newContent: 'new',
    };

    // We need to monitor if toggleItem is called on the list context
    // Actually, VirtualizedList handles its own state.
    // We can verify that it renders the payload after click.

    const { simulateClick, waitUntilReady, lastFrame } =
      await renderWithProviders(
        <Box height={20} width={80}>
          <VirtualizedList
            data={data}
            keyExtractor={keyExtractor}
            estimatedItemHeight={() => 1}
            renderItem={() => (
              <DenseToolMessage
                callId="call-1"
                itemKey="1-tool-call-1"
                groupKey="1"
                name="edit"
                status={CoreToolCallStatus.Success}
                resultDisplay={
                  diffResult as unknown as React.ComponentProps<
                    typeof DenseToolMessage
                  >['resultDisplay']
                }
                terminalWidth={80}
                description="test"
                confirmationDetails={undefined}
              />
            )}
          />
        </Box>,
        {
          config: makeFakeConfig({ useAlternateBuffer: true }),
          settings: createMockSettings({ ui: { useAlternateBuffer: true } }),
          mouseEventsEnabled: true,
        },
      );

    await waitUntilReady();

    // Initially it should be collapsed (no payload shown because of alternate buffer mode)
    expect(lastFrame()).toContain('edit');
    expect(lastFrame()).toContain('test.ts');
    expect(lastFrame()).not.toContain('new');

    // Click on the first line (the header), avoiding the left margin
    await simulateClick(10, 1);

    // Now it should be expanded and show the diff payload
    await waitFor(() => expect(lastFrame()).toContain('new'), {
      timeout: 5000,
    });
  });

  it('wakes up static DenseToolMessage and toggles on click', async () => {
    const data = [{ id: '1' }];
    const diffResult = {
      fileName: 'test.ts',
      filePath: 'test.ts',
      fileDiff: '--- test.ts\n+++ test.ts\n@@ -1,1 +1,1 @@\n-old\n+new',
      diffStat: { model_added_lines: 1, model_removed_lines: 1 },
      originalContent: 'old',
      newContent: 'new',
    };

    const { simulateClick, waitUntilReady, lastFrame } =
      await renderWithProviders(
        <Box height={20} width={80}>
          <VirtualizedList
            data={data}
            keyExtractor={keyExtractor}
            estimatedItemHeight={() => 1}
            renderItem={() => (
              <DenseToolMessage
                callId="call-1"
                itemKey="1-tool-call-1"
                groupKey="1"
                name="edit"
                status={CoreToolCallStatus.Success}
                resultDisplay={
                  diffResult as unknown as React.ComponentProps<
                    typeof DenseToolMessage
                  >['resultDisplay']
                }
                terminalWidth={80}
                description="test"
                confirmationDetails={undefined}
              />
            )}
            isStaticItem={() => true} // Force static rendering
          />
        </Box>,
        {
          config: makeFakeConfig({ useAlternateBuffer: true }),
          settings: createMockSettings({ ui: { useAlternateBuffer: true } }),
          mouseEventsEnabled: true,
        },
      );

    await waitUntilReady();

    // Static item should still show the header
    expect(lastFrame()).toContain('edit');
    expect(lastFrame()).not.toContain('new');

    // Click to wake up and toggle
    await simulateClick(10, 1);

    // Should wake up and expand
    await waitFor(() => expect(lastFrame()).toContain('new'), {
      timeout: 5000,
    });
  });
});
