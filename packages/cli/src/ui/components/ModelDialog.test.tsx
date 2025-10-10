/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
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

        // --- Functions used by ClearcutLogger ---
        getUsageStatisticsEnabled: vi.fn(() => true),
        getSessionId: vi.fn(() => 'mock-session-id'),
        getDebugMode: vi.fn(() => false),
        getContentGeneratorConfig: vi.fn(() => ({ authType: 'mock' })),
        getUseSmartEdit: vi.fn(() => false),
        getUseModelRouter: vi.fn(() => false),
        getProxy: vi.fn(() => undefined),

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
    const { getByText } = renderComponent();
    expect(getByText('Select Model')).toBeDefined();
    expect(getByText('(Press Esc to close)')).toBeDefined();
    expect(
      getByText('> To use a specific Gemini model, use the --model flag.'),
    ).toBeDefined();
  });

  it('passes all model options to DescriptiveRadioButtonSelect', () => {
    renderComponent();
    expect(mockedSelect).toHaveBeenCalledTimes(1);

    const props = mockedSelect.mock.calls[0][0];
    expect(props.items).toHaveLength(4);
    expect(props.items[0].value).toBe(DEFAULT_GEMINI_MODEL_AUTO);
    expect(props.items[1].value).toBe(DEFAULT_GEMINI_MODEL);
    expect(props.items[2].value).toBe(DEFAULT_GEMINI_FLASH_MODEL);
    expect(props.items[3].value).toBe(DEFAULT_GEMINI_FLASH_LITE_MODEL);
    expect(props.showNumbers).toBe(true);
  });

  it('initializes with the model from ConfigContext', () => {
    const mockGetModel = vi.fn(() => DEFAULT_GEMINI_FLASH_MODEL);
    renderComponent({}, { getModel: mockGetModel });

    expect(mockGetModel).toHaveBeenCalled();
    expect(mockedSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        initialIndex: 2,
      }),
      undefined,
    );
  });

  it('initializes with "auto" model if context is not provided', () => {
    renderComponent({}, undefined);

    expect(mockedSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        initialIndex: 0,
      }),
      undefined,
    );
  });

  it('initializes with "auto" model if getModel returns undefined', () => {
    const mockGetModel = vi.fn(() => undefined);
    // @ts-expect-error This test validates component robustness when getModel
    // returns an unexpected undefined value.
    renderComponent({}, { getModel: mockGetModel });

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
  });

  it('calls config.setModel and onClose when DescriptiveRadioButtonSelect.onSelect is triggered', () => {
    const { props, mockConfig } = renderComponent({}, {}); // Pass empty object for contextValue

    const childOnSelect = mockedSelect.mock.calls[0][0].onSelect;
    expect(childOnSelect).toBeDefined();

    childOnSelect(DEFAULT_GEMINI_MODEL);

    // Assert against the default mock provided by renderComponent
    expect(mockConfig?.setModel).toHaveBeenCalledWith(DEFAULT_GEMINI_MODEL);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('does not pass onHighlight to DescriptiveRadioButtonSelect', () => {
    renderComponent();

    const childOnHighlight = mockedSelect.mock.calls[0][0].onHighlight;
    expect(childOnHighlight).toBeUndefined();
  });

  it('calls onClose prop when "escape" key is pressed', () => {
    const { props } = renderComponent();

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
      sequence: '',
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);

    keyPressHandler({
      name: 'a',
      ctrl: false,
      meta: false,
      shift: false,
      paste: false,
      sequence: '',
    });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('updates initialIndex when config context changes', () => {
    const mockGetModel = vi.fn(() => DEFAULT_GEMINI_MODEL_AUTO);
    const { rerender } = render(
      <ConfigContext.Provider
        value={{ getModel: mockGetModel } as unknown as Config}
      >
        <ModelDialog onClose={vi.fn()} />
      </ConfigContext.Provider>,
    );

    expect(mockedSelect.mock.calls[0][0].initialIndex).toBe(0);

    mockGetModel.mockReturnValue(DEFAULT_GEMINI_FLASH_LITE_MODEL);
    const newMockConfig = { getModel: mockGetModel } as unknown as Config;

    rerender(
      <ConfigContext.Provider value={newMockConfig}>
        <ModelDialog onClose={vi.fn()} />
      </ConfigContext.Provider>,
    );

    // Should be called at least twice: initial render + re-render after context change
    expect(mockedSelect).toHaveBeenCalledTimes(2);
    expect(mockedSelect.mock.calls[1][0].initialIndex).toBe(3);
  });
});
