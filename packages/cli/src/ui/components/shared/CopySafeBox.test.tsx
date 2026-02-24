/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text, measureElement } from 'ink';
import { describe, it, expect } from 'vitest';
import { renderWithProviders } from '../../../test-utils/render.js';
import { CopySafeBox } from './CopySafeBox.js';

describe('CopySafeBox', () => {
  it('renders with borders in normal mode', async () => {
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <CopySafeBox borderStyle="round" borderColor="white" paddingX={1}>
        <Text>Content</Text>
      </CopySafeBox>,
      { uiState: { copyModeEnabled: false } },
    );
    await waitUntilReady();
    const frame = lastFrame();
    expect(frame).toContain('╭');
    expect(frame).toContain('Content');
    expect(frame).toMatchSnapshot();
  });

  it('removes borders and padding in copy mode', async () => {
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <CopySafeBox borderStyle="round" borderColor="white" paddingX={1}>
        <Text>Content</Text>
      </CopySafeBox>,
      { uiState: { copyModeEnabled: true } },
    );
    await waitUntilReady();
    const frame = lastFrame();
    // Border should be gone
    expect(frame).not.toContain('╭');
    expect(frame).not.toContain('─');
    // Content should be present
    expect(frame).toContain('Content');
    // In copy mode, all leading indentation should be gone
    expect(frame).toContain('\nContent\n');
  });

  it('handles partial borders correctly in copy mode', async () => {
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <CopySafeBox borderLeft borderStyle="round" paddingLeft={1}>
        <Text>Content</Text>
      </CopySafeBox>,
      { uiState: { copyModeEnabled: true } },
    );
    await waitUntilReady();
    const frame = lastFrame();
    // Indentation should be 0
    expect(frame).toContain('\nContent\n');
  });

  it('preserves top/bottom padding in copy mode', async () => {
    const { lastFrame, waitUntilReady } = renderWithProviders(
      <Box flexDirection="column">
        <CopySafeBox borderTop borderStyle="round" paddingTop={1}>
          <Text>Content</Text>
        </CopySafeBox>
      </Box>,
      { uiState: { copyModeEnabled: true } },
    );
    await waitUntilReady();
    const frame = lastFrame();
    // 1 for borderTop + 1 for paddingTop = 2 empty lines before content
    const lines = frame.split('\n');
    expect(lines[0]).toBe('');
    expect(lines[1]).toBe('');
    expect(lines[2]).toContain('Content');
  });

  it('content is left-aligned when border is removed in copy mode', async () => {
    // Normal Mode
    const normalMode = renderWithProviders(
      <CopySafeBox borderStyle="round" paddingX={2}>
        <Text>Content</Text>
      </CopySafeBox>,
      { uiState: { copyModeEnabled: false } },
    );
    await normalMode.waitUntilReady();
    const normalFrame = normalMode.lastFrame();

    // Copy Mode
    const copyMode = renderWithProviders(
      <CopySafeBox borderStyle="round" paddingX={2}>
        <Text>Content</Text>
      </CopySafeBox>,
      { uiState: { copyModeEnabled: true } },
    );
    await copyMode.waitUntilReady();
    const copyFrame = copyMode.lastFrame();

    // In normal mode: 1 (border) + 2 (paddingX) = 3 spaces before Content
    expect(normalFrame).toContain('│  Content');
    // In copy mode: 0 spaces before Content
    expect(copyFrame).toContain('\nContent\n');
  });

  it('box height is unchanged in copy mode (width may change due to border removal)', async () => {
    let normalSize: { width: number; height: number } | undefined;
    let copySize: { width: number; height: number } | undefined;

    const normalMode = renderWithProviders(
      <CopySafeBox
        borderStyle="round"
        paddingX={2}
        paddingY={1}
        width={80}
        ref={(el) => {
          if (el && !normalSize) {
            normalSize = measureElement(el);
          }
        }}
      >
        <Text>Content</Text>
      </CopySafeBox>,
      { uiState: { copyModeEnabled: false } },
    );
    await normalMode.waitUntilReady();

    const copyMode = renderWithProviders(
      <CopySafeBox
        borderStyle="round"
        paddingX={2}
        paddingY={1}
        width={80}
        ref={(el) => {
          if (el && !copySize) {
            copySize = measureElement(el);
          }
        }}
      >
        <Text>Content</Text>
      </CopySafeBox>,
      { uiState: { copyModeEnabled: true } },
    );
    await copyMode.waitUntilReady();

    // Provide a small delay to let `measureElement` run.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(normalSize).toBeDefined();
    expect(copySize).toBeDefined();
    // Height should be same (borders are compensated by padding)
    expect(copySize!.height).toBe(normalSize!.height);
  });
});
