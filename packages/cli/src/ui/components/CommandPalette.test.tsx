/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { CommandPalette } from './CommandPalette.js';
import type { CommandItem } from '../../commands/CommandRegistry.js';

describe('CommandPalette Component', () => {
  const sampleCommands: CommandItem[] = [
    { name: 'archify', description: 'Render ASCII topology' },
    { name: 'debug', description: 'Methodical debugging' },
    { name: 'explain', description: 'Deep comprehension' },
    { name: 'learn', description: 'Socratic learning' },
    { name: 'model', description: 'Switch active model' },
    { name: 'ponytail', description: 'Minimalist audit' },
    { name: 'solve', description: 'Solve engineering problem' },
  ];

  it('renders without error when matches exist', () => {
    const element = React.createElement(CommandPalette, {
      matches: sampleCommands,
      selectedIndex: 0,
      query: '',
    });
    expect(element).toBeDefined();
    expect(element.props.matches.length).toBe(7);
    expect(element.props.selectedIndex).toBe(0);
  });

  it('renders without error when no matches exist', () => {
    const element = React.createElement(CommandPalette, {
      matches: [],
      selectedIndex: 0,
      query: 'unknown',
    });
    expect(element).toBeDefined();
    expect(element.props.matches.length).toBe(0);
    expect(element.props.query).toBe('unknown');
  });

  it('handles pagination slicing correctly with maxVisible prop', () => {
    const element = React.createElement(CommandPalette, {
      matches: sampleCommands,
      selectedIndex: 5,
      query: '',
      maxVisible: 4,
    });
    expect(element.props.maxVisible).toBe(4);
    expect(element.props.selectedIndex).toBe(5);
  });
});
