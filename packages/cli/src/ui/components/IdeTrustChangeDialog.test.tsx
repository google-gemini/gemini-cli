/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as processUtils from '../../utils/processUtils.js';
import { renderWithProviders } from '../../test-utils/render.js';
import { IdeTrustChangeDialog } from './IdeTrustChangeDialog.js';

describe('IdeTrustChangeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the correct message for CONNECTION_CHANGE', () => {
    const { lastFrame } = renderWithProviders(
      <IdeTrustChangeDialog reason="CONNECTION_CHANGE" />,
    );

    const frameText = lastFrame();
    expect(frameText).toContain(
      'Workspace trust has changed due to a change in the IDE connection.',
    );
    expect(frameText).toContain("Press 'r' to restart Gemini");
  });

  it('renders the correct message for TRUST_CHANGE', () => {
    const { lastFrame } = renderWithProviders(
      <IdeTrustChangeDialog reason="TRUST_CHANGE" />,
    );

    const frameText = lastFrame();
    expect(frameText).toContain(
      'Workspace trust has changed due to a change in the IDE trust.',
    );
    expect(frameText).toContain("Press 'r' to restart Gemini");
  });

  it('renders a generic message and logs an error for NONE reason', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { lastFrame } = renderWithProviders(
      <IdeTrustChangeDialog reason="NONE" />,
    );

    const frameText = lastFrame();
    expect(frameText).toContain('Workspace trust has changed.');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'IdeTrustChangeDialog rendered with unexpected reason "NONE"',
    );
  });

  it('calls relaunchApp when "r" is pressed', () => {
    const relaunchAppSpy = vi.spyOn(processUtils, 'relaunchApp');
    const { stdin } = renderWithProviders(
      <IdeTrustChangeDialog reason="NONE" />,
    );

    stdin.write('r');

    expect(relaunchAppSpy).toHaveBeenCalledTimes(1);
  });

  it('calls relaunchApp when "R" is pressed', () => {
    const relaunchAppSpy = vi.spyOn(processUtils, 'relaunchApp');
    const { stdin } = renderWithProviders(
      <IdeTrustChangeDialog reason="CONNECTION_CHANGE" />,
    );

    stdin.write('R');

    expect(relaunchAppSpy).toHaveBeenCalledTimes(1);
  });

  it('does not call relaunchApp when another key is pressed', async () => {
    const relaunchAppSpy = vi.spyOn(processUtils, 'relaunchApp');
    const { stdin } = renderWithProviders(
      <IdeTrustChangeDialog reason="CONNECTION_CHANGE" />,
    );

    stdin.write('a');

    // Give it a moment to ensure no async actions are triggered
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(relaunchAppSpy).not.toHaveBeenCalled();
  });
});
