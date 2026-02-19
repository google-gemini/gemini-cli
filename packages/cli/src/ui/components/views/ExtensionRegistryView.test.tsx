/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders as render } from '../../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { ExtensionRegistryView } from './ExtensionRegistryView.js';
import {
  ExtensionRegistryClient,
  type RegistryExtension,
} from '../../../config/extensionRegistryClient.js';
import { type ExtensionManager } from '../../../config/extension-manager.js';

vi.mock('../../../config/extensionRegistryClient.js');

const mockExtensions = [
  {
    id: 'ext-1',
    extensionName: 'Extension 1',
    extensionDescription: 'Description 1',
    repoDescription: 'Repo Description 1',
  },
  {
    id: 'ext-2',
    extensionName: 'Extension 2',
    extensionDescription: 'Description 2',
    repoDescription: 'Repo Description 2',
  },
];

describe('ExtensionRegistryView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state initially', async () => {
    // Return a promise that doesn't resolve immediately to keep the loading state active
    vi.spyOn(
      ExtensionRegistryClient.prototype,
      'searchExtensions',
    ).mockReturnValue(new Promise(() => {}));

    const mockExtensionManager = {
      getExtensions: vi.fn().mockReturnValue([]),
    };

    const { lastFrame } = render(
      <ExtensionRegistryView
        extensionManager={mockExtensionManager as unknown as ExtensionManager}
      />,
    );
    expect(lastFrame()).toContain('Loading extensions...');
  });

  it('should render extensions after fetching', async () => {
    vi.spyOn(
      ExtensionRegistryClient.prototype,
      'searchExtensions',
    ).mockResolvedValue(mockExtensions as unknown as RegistryExtension[]);

    const mockExtensionManager = {
      getExtensions: vi.fn().mockReturnValue([]),
    };

    const { lastFrame } = render(
      <ExtensionRegistryView
        extensionManager={mockExtensionManager as unknown as ExtensionManager}
      />,
    );

    // Wait for effect and debounce
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      // Add a small delay for debounce/async logic if needed, though mocking resolved value should be enough if called immediately
    });

    const frame = lastFrame();
    expect(frame).toContain('Extension 1');
    expect(frame).toContain('Description 1');
    expect(frame).toContain('Extension 2');
    expect(frame).toContain('Description 2');
  });

  it('should render error message on fetch failure', async () => {
    vi.spyOn(
      ExtensionRegistryClient.prototype,
      'searchExtensions',
    ).mockRejectedValue(new Error('Fetch failed'));

    const mockExtensionManager = {
      getExtensions: vi.fn().mockReturnValue([]),
    };

    const { lastFrame } = render(
      <ExtensionRegistryView
        extensionManager={mockExtensionManager as unknown as ExtensionManager}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const frame = lastFrame();
    expect(frame).toContain('Error loading extensions:');
    expect(frame).toContain('Fetch failed');
  });

  it('should call onSelect when an item is selected', async () => {
    vi.spyOn(
      ExtensionRegistryClient.prototype,
      'searchExtensions',
    ).mockResolvedValue(mockExtensions as unknown as RegistryExtension[]);
    const onSelect = vi.fn();

    const mockExtensionManager = {
      getExtensions: vi.fn().mockReturnValue([]),
    };

    const { stdin } = render(
      <ExtensionRegistryView
        onSelect={onSelect}
        extensionManager={mockExtensionManager as unknown as ExtensionManager}
      />,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Press Enter to select the first item
    await act(async () => {
      stdin.write('\r');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSelect).toHaveBeenCalledWith(mockExtensions[0]);
  });
});
