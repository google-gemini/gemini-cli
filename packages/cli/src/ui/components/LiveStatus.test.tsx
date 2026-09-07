/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { LiveStatus, StreamingCursor } from './LiveStatus.js';

describe('LiveStatus & StreamingCursor', () => {
  it('instantiates LiveStatus component with default label', () => {
    const element = React.createElement(LiveStatus, {});
    expect(element).toBeDefined();
  });

  it('instantiates LiveStatus with custom statusText and startTime', () => {
    const startTime = Date.now() - 1500;
    const element = React.createElement(LiveStatus, {
      statusText: 'Thinking with agy (gemini-3.8-flash-high)...',
      startTime,
    });
    expect(element).toBeDefined();
    expect(element.props.statusText).toBe('Thinking with agy (gemini-3.8-flash-high)...');
    expect(element.props.startTime).toBe(startTime);
  });

  it('instantiates StreamingCursor component', () => {
    const element = React.createElement(StreamingCursor);
    expect(element).toBeDefined();
  });
});
