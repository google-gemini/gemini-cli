/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { renderWithProviders } from '../../../test-utils/render.js';
import { waitFor } from '../../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtensionDetails } from './ExtensionDetails.js';
import { type RegistryExtension } from '../../../config/extensionRegistryClient.js';

const mockExtension: RegistryExtension = {
  id: 'ext1',
  extensionName: 'Test Extension',
  extensionDescription: 'A test extension description',
  fullName: 'author/test-extension',
  extensionVersion: '1.2.3',
  rank: 1,
  stars: 123,
  url: 'https://github.com/author/test-extension',
  repoDescription: 'Repo description',
  avatarUrl: '',
  lastUpdated: '2023-10-27',
  hasMCP: true,
  hasContext: true,
  hasHooks: true,
  hasSkills: true,
  hasCustomCommands: true,
  isGoogleOwned: true,
  licenseKey: 'Apache-2.0',
};

describe('ExtensionDetails', () => {
  let mockOnBack: ReturnType<typeof vi.fn>;
  let mockOnInstall: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnBack = vi.fn();
    mockOnInstall = vi.fn();
  });

  const renderDetails = (isInstalled = false) =>
    renderWithProviders(
      <ExtensionDetails
        extension={mockExtension}
        onBack={mockOnBack}
        onInstall={mockOnInstall}
        isInstalled={isInstalled}
      />,
    );

  it('should render extension details correctly', async () => {
    const { lastFrame } = renderDetails();
    await waitFor(() => {
      expect(lastFrame()).toContain('Test Extension');
      expect(lastFrame()).toContain('v1.2.3');
      expect(lastFrame()).toContain('123');
      expect(lastFrame()).toContain('[G]');
      expect(lastFrame()).toContain('author/test-extension');
      expect(lastFrame()).toContain('A test extension description');
      expect(lastFrame()).toContain('MCP');
      expect(lastFrame()).toContain('Context file');
      expect(lastFrame()).toContain('Hooks');
      expect(lastFrame()).toContain('Skills');
      expect(lastFrame()).toContain('Commands');
    });
  });

  it('should show install prompt when not installed', async () => {
    const { lastFrame } = renderDetails(false);
    await waitFor(() => {
      expect(lastFrame()).toContain('[Enter] Install');
      expect(lastFrame()).not.toContain('Already Installed');
    });
  });

  it('should show already installed message when installed', async () => {
    const { lastFrame } = renderDetails(true);
    await waitFor(() => {
      expect(lastFrame()).toContain('Already Installed');
      expect(lastFrame()).not.toContain('[Enter] Install');
    });
  });

  it('should call onBack when Escape is pressed', async () => {
    const { stdin } = renderDetails();
    await React.act(async () => {
      stdin.write('\x1b'); // Escape
    });
    await waitFor(() => {
      expect(mockOnBack).toHaveBeenCalled();
    });
  });

  it('should call onInstall when Enter is pressed and not installed', async () => {
    const { stdin } = renderDetails(false);
    await React.act(async () => {
      stdin.write('\r'); // Enter
    });
    await waitFor(() => {
      expect(mockOnInstall).toHaveBeenCalled();
    });
  });

  it('should NOT call onInstall when Enter is pressed and already installed', async () => {
    vi.useFakeTimers();
    const { stdin } = renderDetails(true);
    await React.act(async () => {
      stdin.write('\r'); // Enter
    });
    // Advance timers to trigger the keypress flush
    await React.act(async () => {
      vi.runAllTimers();
    });
    expect(mockOnInstall).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
