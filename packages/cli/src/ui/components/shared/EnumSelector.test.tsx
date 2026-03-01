/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../../test-utils/render.js';
import { EnumSelector } from './EnumSelector.js';
import type { SettingEnumOption } from '../../../config/settingsSchema.js';
import { describe, it, expect } from 'vitest';
import { act } from 'react';

const LANGUAGE_OPTIONS: readonly SettingEnumOption[] = [
  { label: 'English', value: 'en' },
  { label: '中文 (简体)', value: 'zh' },
  { label: 'Español', value: 'es' },
  { label: 'Français', value: 'fr' },
];

const NUMERIC_OPTIONS: readonly SettingEnumOption[] = [
  { label: 'Low', value: 1 },
  { label: 'Medium', value: 2 },
  { label: 'High', value: 3 },
];

describe('<EnumSelector />', () => {
  it('renders with string options and matches snapshot', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <EnumSelector
        options={LANGUAGE_OPTIONS}
        currentValue="en"
        isActive={true}
        onValueChange={async () => {}}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders with numeric options and matches snapshot', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <EnumSelector
        options={NUMERIC_OPTIONS}
        currentValue={2}
        isActive={true}
        onValueChange={async () => {}}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders inactive state and matches snapshot', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <EnumSelector
        options={LANGUAGE_OPTIONS}
        currentValue="zh"
        isActive={false}
        onValueChange={async () => {}}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders with single option and matches snapshot', async () => {
    const singleOption: readonly SettingEnumOption[] = [
      { label: 'Only Option', value: 'only' },
    ];
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <EnumSelector
        options={singleOption}
        currentValue="only"
        isActive={true}
        onValueChange={async () => {}}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('renders nothing when no options are provided', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <EnumSelector
        options={[]}
        currentValue=""
        isActive={true}
        onValueChange={async () => {}}
      />,
    );
    await waitUntilReady();
    expect(lastFrame({ allowEmpty: true })).toBe('');
    unmount();
  });

  it('handles currentValue not found in options', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <EnumSelector
        options={LANGUAGE_OPTIONS}
        currentValue="invalid"
        isActive={true}
        onValueChange={async () => {}}
      />,
    );
    await waitUntilReady();
    // Should default to first option
    expect(lastFrame()).toContain('English');
    unmount();
  });

  it('updates when currentValue changes externally', async () => {
    const { rerender, lastFrame, waitUntilReady, unmount } =
      renderWithProviders(
        <EnumSelector
          options={LANGUAGE_OPTIONS}
          currentValue="en"
          isActive={true}
          onValueChange={async () => {}}
        />,
      );
    await waitUntilReady();
    expect(lastFrame()).toContain('English');

    await act(async () => {
      rerender(
        <EnumSelector
          options={LANGUAGE_OPTIONS}
          currentValue="zh"
          isActive={true}
          onValueChange={async () => {}}
        />,
      );
    });
    await waitUntilReady();
    expect(lastFrame()).toContain('中文 (简体)');
    unmount();
  });

  it('shows navigation arrows when multiple options available', async () => {
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <EnumSelector
        options={LANGUAGE_OPTIONS}
        currentValue="en"
        isActive={true}
        onValueChange={async () => {}}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('←');
    expect(lastFrame()).toContain('→');
    unmount();
  });

  it('hides navigation arrows when single option available', async () => {
    const singleOption: readonly SettingEnumOption[] = [
      { label: 'Only Option', value: 'only' },
    ];
    const { lastFrame, waitUntilReady, unmount } = renderWithProviders(
      <EnumSelector
        options={singleOption}
        currentValue="only"
        isActive={true}
        onValueChange={async () => {}}
      />,
    );
    await waitUntilReady();
    expect(lastFrame()).not.toContain('←');
    expect(lastFrame()).not.toContain('→');
    unmount();
  });
});
