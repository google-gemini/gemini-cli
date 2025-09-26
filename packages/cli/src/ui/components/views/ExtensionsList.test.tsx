/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { vi } from 'vitest';
import { useUIState } from '../../contexts/UIStateContext.js';
import { ExtensionUpdateState } from '../../state/extensions.js';
import { ExtensionsList } from './ExtensionsList.js';
import { createMockCommandContext } from '../../../test-utils/mockCommandContext.js';

vi.mock('../../contexts/UIStateContext.js');

const mockUseUIState = vi.mocked(useUIState);

const mockExtensions = [
  { name: 'ext-one', version: '1.0.0', isActive: true },
  { name: 'ext-two', version: '2.1.0', isActive: true },
  { name: 'ext-disabled', version: '3.0.0', isActive: false },
];

describe('<ExtensionsList />', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockUIState = (
    extensions: unknown[],
    extensionsUpdateState: Map<string, ExtensionUpdateState>,
    disabledExtensions: string[] = [],
  ) => {
    mockUseUIState.mockReturnValue({
      commandContext: createMockCommandContext({
        services: {
          config: {
            getExtensions: () => extensions,
          },
          settings: {
            merged: {
              extensions: {
                disabled: disabledExtensions,
              },
            },
          },
        },
      }),
      extensionsUpdateState,
      // Add other required properties from UIState if needed by the component
    } as never);
  };

  it('should render "No extensions installed." if there are no extensions', () => {
    mockUIState([], new Map());
    const { lastFrame } = render(<ExtensionsList />);
    expect(lastFrame()).toContain('No extensions installed.');
  });

  it('should render a list of extensions with their version and status', () => {
    mockUIState(mockExtensions, new Map(), ['ext-disabled']);
    const { lastFrame } = render(<ExtensionsList />);
    const output = lastFrame();
    expect(output).toContain('ext-one (v1.0.0) - active');
    expect(output).toContain('ext-two (v2.1.0) - active');
    expect(output).toContain('ext-disabled (v3.0.0) - disabled');
  });

  it('should display "unknown state" if an extension has no update state', () => {
    mockUIState([mockExtensions[0]], new Map());
    const { lastFrame } = render(<ExtensionsList />);
    expect(lastFrame()).toContain('(unknown state)');
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
      mockUIState([mockExtensions[0]], updateState);
      const { lastFrame } = render(<ExtensionsList />);
      expect(lastFrame()).toContain(expectedText);
    });
  }
});
