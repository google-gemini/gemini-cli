/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect } from 'vitest';
import { Footer } from './Footer.js';

describe('<Footer />', () => {
  const baseProps = {
    model: 'gemini-pro',
    targetDir: '/',
    branchName: 'main',
    debugMode: false,
    debugMessage: '',
    corgiMode: false,
    errorCount: 0,
    showErrorDetails: false,
    showMemoryUsage: false,
    promptTokenCount: 0,
    nightly: false,
    display: { footer: true },
  };

  it('should render nothing when display.footer is false and there are no errors', () => {
    const { lastFrame } = render(
      <Footer {...baseProps} display={{ footer: false }} />,
    );
    expect(lastFrame()).toBe('');
  });

  it('should render only the error count when display.footer is false and there are errors', () => {
    const { lastFrame } = render(
      <Footer {...baseProps} display={{ footer: false }} errorCount={5} />,
    );
    expect(lastFrame()).toContain('5 errors');
  });

  it('should render the full footer when display.footer is true', () => {
    const { lastFrame } = render(<Footer {...baseProps} />);
    expect(lastFrame()).toContain('gemini-pro');
  });
});
