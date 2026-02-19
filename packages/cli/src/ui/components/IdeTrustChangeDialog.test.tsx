/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import * as processUtils from '../../utils/processUtils.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { IdeTrustChangeDialog } from './IdeTrustChangeDialog.js';
import { debugLogger } from '@google/gemini-cli-core';

describe('IdeTrustChangeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the correct message for CONNECTION_CHANGE', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <IdeTrustChangeDialog reason="CONNECTION_CHANGE" />,
    );
    await waitUntilReady();

    const frameText = lastFrame();
    expect(frameText).toContain(
      'Workspace trust has changed due to a change in the IDE connection.',
    );
    expect(frameText).toContain("Press 'r' to restart Gemini");
    unmount();
  });

  it('renders the correct message for TRUST_CHANGE', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <IdeTrustChangeDialog reason="TRUST_CHANGE" />,
    );
    await waitUntilReady();

    const frameText = lastFrame();
    expect(frameText).toContain(
      'Workspace trust has changed due to a change in the IDE trust.',
    );
    expect(frameText).toContain("Press 'r' to restart Gemini");
    unmount();
  });

  it('renders a generic message and logs an error for NONE reason', async () => {
    const debugLoggerWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <IdeTrustChangeDialog reason="NONE" />,
    );
    await waitUntilReady();

    const frameText = lastFrame();
    expect(frameText).toContain('Workspace trust has changed.');
    expect(debugLoggerWarnSpy).toHaveBeenCalledWith(
      'IdeTrustChangeDialog rendered with unexpected reason "NONE"',
    );
    unmount();
  });

  it('calls relaunchApp when "r" is pressed', async () => {
    const relaunchAppSpy = vi.spyOn(processUtils, 'relaunchApp');
    const { stdin, waitUntilReady, unmount } = renderWithProviders(
      <IdeTrustChangeDialog reason="NONE" />,
    );
    await waitUntilReady();

    await act(async () => {
      stdin.write('r');
    });
    await waitUntilReady();

    expect(relaunchAppSpy).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('calls relaunchApp when "R" is pressed', async () => {
    const relaunchAppSpy = vi.spyOn(processUtils, 'relaunchApp');
    const { stdin, waitUntilReady, unmount } = renderWithProviders(
      <IdeTrustChangeDialog reason="CONNECTION_CHANGE" />,
    );
    await waitUntilReady();

    await act(async () => {
      stdin.write('R');
    });
    await waitUntilReady();

    expect(relaunchAppSpy).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does not call relaunchApp when another key is pressed', async () => {
    const relaunchAppSpy = vi.spyOn(processUtils, 'relaunchApp');
    const { stdin, waitUntilReady, unmount } = renderWithProviders(
      <IdeTrustChangeDialog reason="CONNECTION_CHANGE" />,
    );
    await waitUntilReady();

    await act(async () => {
      stdin.write('a');
    });
    await waitUntilReady();

    expect(relaunchAppSpy).not.toHaveBeenCalled();
    unmount();
  });
});
