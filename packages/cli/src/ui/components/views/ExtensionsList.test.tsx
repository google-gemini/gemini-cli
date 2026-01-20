/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { vi, describe, beforeEach, it, expect } from 'vitest';
import { useUIState } from '../../contexts/UIStateContext.js';
import { ExtensionUpdateState } from '../../state/extensions.js';
import { ExtensionsList } from './ExtensionsList.js';

vi.mock('../../contexts/UIStateContext.js');

const mockUseUIState = vi.mocked(useUIState);

const mockExtensions = [
  {
    name: 'ext-one',
    version: '1.0.0',
    isActive: true,
    path: '/path/to/ext-one',
    contextFiles: [],
    id: '',
  },
  {
    name: 'ext-two',
    version: '2.1.0',
    isActive: true,
    path: '/path/to/ext-two',
    contextFiles: [],
    id: '',
  },
  {
    name: 'ext-disabled',
    version: '3.0.0',
    isActive: false,
    path: '/path/to/ext-disabled',
    contextFiles: [],
    id: '',
  },
];

describe('<ExtensionsList />', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockUIState = (
    extensionsUpdateState: Map<string, ExtensionUpdateState>,
  ) => {
    mockUseUIState.mockReturnValue({
      extensionsUpdateState,
      // Add other required properties from UIState if needed by the component
    } as never);
  };

  it('should render "No extensions installed." if there are no extensions', () => {
    mockUIState(new Map());
    const { lastFrame, unmount } = render(<ExtensionsList extensions={[]} />);
    expect(lastFrame()).toContain('No extensions installed.');
    unmount();
  });

  it('should render a list of extensions with their version and status', () => {
    mockUIState(new Map());
    const { lastFrame, unmount } = render(
      <ExtensionsList extensions={mockExtensions} />,
    );
    const output = lastFrame();
    expect(output).toContain('ext-one (v1.0.0) - active');
    expect(output).toContain('ext-two (v2.1.0) - active');
    expect(output).toContain('ext-disabled (v3.0.0) - disabled');
    unmount();
  });

  it('should display "unknown state" if an extension has no update state', () => {
    mockUIState(new Map());
    const { lastFrame, unmount } = render(
      <ExtensionsList extensions={[mockExtensions[0]]} />,
    );
    expect(lastFrame()).toContain('(unknown state)');
    unmount();
  });

  const stateTestCases = [
    {
      state: ExtensionUpdateState.CHECKING_FOR_UPDATES,
      expectedText: '(checking for updates)',
    },
    {
      state: ExtensionUpdateState.UPDATING,
      expectedText: '(updating)',
    },
    {
      state: ExtensionUpdateState.UPDATE_AVAILABLE,
      expectedText: '(update available)',
    },
    {
      state: ExtensionUpdateState.UPDATED_NEEDS_RESTART,
      expectedText: '(updated, needs restart)',
    },
    {
      state: ExtensionUpdateState.UPDATED,
      expectedText: '(updated)',
    },
    {
      state: ExtensionUpdateState.ERROR,
      expectedText: '(error)',
    },
    {
      state: ExtensionUpdateState.UP_TO_DATE,
      expectedText: '(up to date)',
    },
  ];

  for (const { state, expectedText } of stateTestCases) {
    it(`should correctly display the state: ${state}`, () => {
      const updateState = new Map([[mockExtensions[0].name, state]]);
      mockUIState(updateState);
      const { lastFrame, unmount } = render(
        <ExtensionsList extensions={[mockExtensions[0]]} />,
      );
      expect(lastFrame()).toContain(expectedText);
      unmount();
    });
  }

  it('should render resolved settings for an extension', () => {
    mockUIState(new Map());
    const extensionWithSettings = {
      ...mockExtensions[0],
      resolvedSettings: [
        {
          name: 'sensitiveApiKey',
          value: '***',
          envVar: 'API_KEY',
          sensitive: true,
        },
        {
          name: 'maxTokens',
          value: '1000',
          envVar: 'MAX_TOKENS',
          sensitive: false,
          scope: 'user' as const,
          source: '/path/to/.env',
        },
        {
          name: 'model',
          value: 'gemini-pro',
          envVar: 'MODEL',
          sensitive: false,
          scope: 'workspace' as const,
          source: 'Keychain',
        },
      ],
    };
    const { lastFrame, unmount } = render(
      <ExtensionsList extensions={[extensionWithSettings]} />,
    );
    const output = lastFrame();
    expect(output).toContain('settings:');
    expect(output).toContain('- sensitiveApiKey: ***');
    expect(output).toContain('- maxTokens: 1000 (User - /path/to/.env)');
    expect(output).toContain('- model: gemini-pro (Workspace - Keychain)');
    unmount();
  });
});
