/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { UriSecurityWarning } from './UriSecurityWarning.js';
import { renderWithProviders } from '../../../test-utils/render.js';

describe('UriSecurityWarning', () => {
  it('should render nothing if there are no warnings', () => {
    const { lastFrame } = renderWithProviders(
      <UriSecurityWarning warnings={[]} />,
    );
    expect(lastFrame()).toBe('');
  });

  it('should render a warning for a single homograph', () => {
    const warnings = [
      {
        original: 'https://täst.com',
        punycode: 'https://xn--tst-qla.com/',
        punycodeHost: 'xn--tst-qla.com',
      },
    ];
    const { lastFrame } = renderWithProviders(
      <UriSecurityWarning warnings={warnings} />,
    );
    const output = lastFrame();
    expect(output).toContain('Potential homograph attack detected');
    expect(output).toContain('Original: https://täst.com');
    expect(output).toContain(
      'Actual Host (Punycode): https://xn--tst-qla.com/',
    );
    expect(output).toMatchSnapshot();
  });

  it('should render multiple warnings', () => {
    const warnings = [
      {
        original: 'https://täst.com',
        punycode: 'https://xn--tst-qla.com/',
        punycodeHost: 'xn--tst-qla.com',
      },
      {
        original: 'https://еxample.com',
        punycode: 'https://xn--xample-2of.com/',
        punycodeHost: 'xn--xample-2of.com',
      },
    ];
    const { lastFrame } = renderWithProviders(
      <UriSecurityWarning warnings={warnings} />,
    );
    const output = lastFrame();
    expect(output).toContain('https://täst.com');
    expect(output).toContain('https://еxample.com');
    expect(output).toMatchSnapshot();
  });
});
