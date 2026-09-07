/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { AsciiBox } from './AsciiBox.js';

describe('AsciiBox', () => {
  it('creates rounded border boxes with title and content', () => {
    const box = AsciiBox.create(['First Line', 'Second Line'], {
      title: 'TEST BOX',
      style: 'rounded',
    });
    expect(box).toContain('╭');
    expect(box).toContain('╮');
    expect(box).toContain('╰');
    expect(box).toContain('╯');
    expect(box).toContain('TEST BOX');
    expect(box).toContain('First Line');
    expect(box).toContain('Second Line');
  });

  it('creates double border boxes with alignment', () => {
    const box = AsciiBox.create('Centered Content', {
      style: 'double',
      align: 'center',
      minWidth: 30,
    });
    expect(box).toContain('╔');
    expect(box).toContain('╗');
    expect(box).toContain('╚');
    expect(box).toContain('╝');
    expect(box).toContain('Centered Content');
  });

  it('connects two boxes horizontally with an arrow', () => {
    const boxA = AsciiBox.create('Box A');
    const boxB = AsciiBox.create('Box B');
    const connected = AsciiBox.horizontalConnect(boxA, '──►', boxB);

    expect(connected).toContain('Box A');
    expect(connected).toContain('──►');
    expect(connected).toContain('Box B');
  });

  it('renders tree hierarchies', () => {
    const tree = AsciiBox.tree('Root Workspace', [
      { name: 'packages/core', details: 'Core primitives' },
      { name: 'packages/cli', details: 'Terminal interface' },
    ]);
    expect(tree).toContain('Root Workspace');
    expect(tree).toContain('├── packages/core (Core primitives)');
    expect(tree).toContain('└── packages/cli (Terminal interface)');
  });
});
