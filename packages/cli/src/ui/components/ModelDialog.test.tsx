/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { cleanup } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GEMINI_MODEL_ALIAS_FLASH_LITE,
  GEMINI_MODEL_ALIAS_FLASH,
  GEMINI_MODEL_ALIAS_PRO,
  DEFAULT_GEMINI_MODEL_AUTO,
} from '@google/gemini-cli-core';
import { ModelDialog } from './ModelDialog.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import type { Config } from '@google/gemini-cli-core';

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));
const mockedUseKeypress = vi.mocked(useKeypress);

vi.mock('./shared/DescriptiveRadioButtonSelect.js', () => ({
  DescriptiveRadioButtonSelect: vi.fn(() => null),
}));
const mockedSelect = vi.mocked(DescriptiveRadioButtonSelect);

const renderComponent = (
  props: Partial<React.ComponentProps<typeof ModelDialog>> = {},
  contextValue: Partial<Config> | undefined = undefined,
) => {
  const defaultProps = {
    onClose: vi.fn(),
  };
  const combinedProps = { ...defaultProps, ...props };

  const mockConfig = contextValue
    ? ({
        // --- Functions used by ModelDialog ---
        getModel: vi.fn(() => DEFAULT_GEMINI_MODEL_AUTO),
        setModel: vi.fn(),
        getPreviewFeatures: vi.fn(() => false),

        // --- Functions used by ClearcutLogger ---
        getUsageStatisticsEnabled: vi.fn(() => true),
        getSessionId: vi.fn(() => 'mock-session-id'),
        getDebugMode: vi.fn(() => false),
        getContentGeneratorConfig: vi.fn(() => ({ authType: 'mock' })),
        getUseSmartEdit: vi.fn(() => false),
        getProxy: vi.fn(() => undefined),
        isInteractive: vi.fn(() => false),
        getExperiments: () => {},

        // --- Spread test-specific overrides ---
        ...contextValue,
      } as Config)
    : undefined;

  const renderResult = render(
    <ConfigContext.Provider value={mockConfig}>
      <ModelDialog {...combinedProps} />
    </ConfigContext.Provider>,
  );

  return {
    ...renderResult,
    props: combinedProps,
    mockConfig,
  };
};

describe('<ModelDialog />', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the title and help text', () => {
    const { lastFrame, unmount } = renderComponent();
    expect(lastFrame()).toContain('Select Model');
    expect(lastFrame()).toContain('(Press Esc to close)');
    expect(lastFrame()).toContain(
      'To use a specific Gemini model on startup, use the --model flag.',
    );
    unmount();
  });

  it('passes all model options to DescriptiveRadioButtonSelect', () => {
    const { unmount } = renderComponent();
    expect(mockedSelect).toHaveBeenCalledTimes(1);

    const props = mockedSelect.mock.calls[0][0];
    expect(props.items).toHaveLength(4);
    expect(props.items[0].value).toBe(DEFAULT_GEMINI_MODEL_AUTO);
    expect(props.items[1].value).toBe(GEMINI_MODEL_ALIAS_PRO);
    expect(props.items[2].value).toBe(GEMINI_MODEL_ALIAS_FLASH);
    expect(props.items[3].value).toBe(GEMINI_MODEL_ALIAS_FLASH_LITE);
    expect(props.showNumbers).toBe(true);
    unmount();
  });

  it('initializes with the model from ConfigContext', () => {
    const mockGetModel = vi.fn(() => GEMINI_MODEL_ALIAS_FLASH);
    const { unmount } = renderComponent({}, { getModel: mockGetModel });

    expect(mockGetModel).toHaveBeenCalled();
    expect(mockedSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        initialIndex: 2,
      }),
      undefined,
    );
    unmount();
  });

  it('initializes with "auto" model if context is not provided', () => {
    const { unmount } = renderComponent({}, undefined);

    expect(mockedSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        initialIndex: 0,
      }),
      undefined,
    );
    unmount();
  });

  it('initializes with "auto" model if getModel returns undefined', () => {
    const mockGetModel = vi.fn(() => undefined);
    // @ts-expect-error This test validates component robustness when getModel
    // returns an unexpected undefined value.
    const { unmount } = renderComponent({}, { getModel: mockGetModel });

    expect(mockGetModel).toHaveBeenCalled();

    // When getModel returns undefined, preferredModel falls back to DEFAULT_GEMINI_MODEL_AUTO
    // which has index 0, so initialIndex should be 0
    expect(mockedSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        initialIndex: 0,
      }),
      undefined,
    );
    expect(mockedSelect).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('calls config.setModel and onClose when DescriptiveRadioButtonSelect.onSelect is triggered', () => {
    const { props, mockConfig, unmount } = renderComponent({}, {}); // Pass empty object for contextValue

    const childOnSelect = mockedSelect.mock.calls[0][0].onSelect;
    expect(childOnSelect).toBeDefined();

    childOnSelect(GEMINI_MODEL_ALIAS_PRO);

    // Assert against the default mock provided by renderComponent
    expect(mockConfig?.setModel).toHaveBeenCalledWith(GEMINI_MODEL_ALIAS_PRO);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does not pass onHighlight to DescriptiveRadioButtonSelect', () => {
    const { unmount } = renderComponent();

    const childOnHighlight = mockedSelect.mock.calls[0][0].onHighlight;
    expect(childOnHighlight).toBeUndefined();
    unmount();
  });

  it('calls onClose prop when "escape" key is pressed', () => {
    const { props, unmount } = renderComponent();

    expect(mockedUseKeypress).toHaveBeenCalled();

    const keyPressHandler = mockedUseKeypress.mock.calls[0][0];
    const options = mockedUseKeypress.mock.calls[0][1];

    expect(options).toEqual({ isActive: true });

    keyPressHandler({
      name: 'escape',
      ctrl: false,
      meta: false,
      shift: false,
      paste: false,
      insertable: false,
      sequence: '',
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);

    keyPressHandler({
      name: 'a',
      ctrl: false,
      meta: false,
      shift: false,
      paste: false,
      insertable: true,
      sequence: '',
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('updates initialIndex when config context changes', () => {
    const mockGetModel = vi.fn(() => DEFAULT_GEMINI_MODEL_AUTO);
    const oldMockConfig = {
      getModel: mockGetModel,
      getPreviewFeatures: vi.fn(() => false),
    } as unknown as Config;
    const { rerender, unmount } = render(
      <ConfigContext.Provider value={oldMockConfig}>
        <ModelDialog onClose={vi.fn()} />
      </ConfigContext.Provider>,
    );

    expect(mockedSelect.mock.calls[0][0].initialIndex).toBe(0);

    mockGetModel.mockReturnValue(GEMINI_MODEL_ALIAS_FLASH_LITE);
    const newMockConfig = {
      getModel: mockGetModel,
      getPreviewFeatures: vi.fn(() => false),
    } as unknown as Config;

    rerender(
      <ConfigContext.Provider value={newMockConfig}>
        <ModelDialog onClose={vi.fn()} />
      </ConfigContext.Provider>,
    );

    // Should be called at least twice: initial render + re-render after context change
    expect(mockedSelect).toHaveBeenCalledTimes(2);
    expect(mockedSelect.mock.calls[1][0].initialIndex).toBe(3);
    unmount();
  });
});
