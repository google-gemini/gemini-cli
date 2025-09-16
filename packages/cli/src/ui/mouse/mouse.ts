/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type MouseHandler = (event: MouseEvent) => void;

export interface MouseEvent {
  name:
    | 'mousedown'
    | 'mouseup'
    | 'mousemove'
    | 'wheel'
    | 'mousedrag'
    | 'unknown';
  button: 'left' | 'right' | 'middle' | 'none' | 'wheel';
  x: number;
  y: number;
  wheelDirection?: 'up' | 'down';
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
}

// Parses SGR mouse events (CSI<...M).
function parseSGR(data: string): MouseEvent | null {
  const match = data.match(/(\d+);(\d+);(\d+)([Mm])/);
  if (!match) {
    return null;
  }

  const [_, cb, cx, cy, m] = match;
  const buttonCode = parseInt(cb, 10);
  const x = parseInt(cx, 10);
  const y = parseInt(cy, 10);
  const isRelease = m === 'm';

  const event: MouseEvent = {
    name: 'unknown',
    button: 'none',
    x,
    y,
    shift: (buttonCode & 4) !== 0,
    meta: (buttonCode & 8) !== 0,
    ctrl: (buttonCode & 16) !== 0,
  };

  const buttonType = buttonCode & 3;
  switch (buttonType) {
    case 0:
      event.button = 'left';
      break;
    case 1:
      event.button = 'middle';
      break;
    case 2:
      event.button = 'right';
      break;
    default:
      break;
  }

  if (buttonCode & 64) {
    event.name = 'wheel';
    event.button = 'wheel';
    event.wheelDirection = buttonType === 0 ? 'up' : 'down';
  } else if (buttonCode & 32) {
    event.name = 'mousedrag';
  } else {
    event.name = isRelease ? 'mouseup' : 'mousedown';
  }

  if (isRelease && event.name !== 'wheel') {
    event.button = 'none';
  }

  return event;
}

export function parse(data: Buffer): MouseEvent | null {
  const s = data.toString('utf-8');

  // Check for SGR mouse event format
  if (s.startsWith('\x1b[<')) {
    return parseSGR(s.substring(2));
  }

  return null;
}
