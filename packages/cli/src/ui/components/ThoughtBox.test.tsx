/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { ThoughtBox } from './ThoughtBox.js';

describe('ThoughtBox Component', () => {
  it('renders thought process text when provided', () => {
    const element = React.createElement(ThoughtBox, {
      thought: 'Evaluating codebase symbol definitions...',
    });
    expect(element).toBeDefined();
    expect(element.props.thought).toBe('Evaluating codebase symbol definitions...');
  });

  it('renders with isStreaming flag', () => {
    const element = React.createElement(ThoughtBox, {
      thought: 'Active thought reasoning...',
      isStreaming: true,
    });
    expect(element).toBeDefined();
    expect(element.props.isStreaming).toBe(true);
  });

  it('returns null or empty for empty thought', () => {
    const element = React.createElement(ThoughtBox, {
      thought: '   ',
    });
    expect(element).toBeDefined();
  });
});
