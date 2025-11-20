/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { CloudPaidPrivacyNotice } from './CloudPaidPrivacyNotice.js';
import { useKeypress } from '../hooks/useKeypress.js';

// Mocks
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

const mockedUseKeypress = useKeypress as Mock;

describe('CloudPaidPrivacyNotice', () => {
  const onExit = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders correctly', () => {
    const { lastFrame } = render(<CloudPaidPrivacyNotice onExit={onExit} />);

    expect(lastFrame()).toContain('Vertex AI Notice');
    expect(lastFrame()).toContain('Service Specific Terms');
    expect(lastFrame()).toContain('Press Esc to exit');
  });

  it('exits on Escape', () => {
    render(<CloudPaidPrivacyNotice onExit={onExit} />);

    const keypressHandler = mockedUseKeypress.mock.calls[0][0];
    keypressHandler({ name: 'escape' });

    expect(onExit).toHaveBeenCalled();
  });
});
