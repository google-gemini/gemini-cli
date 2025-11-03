/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import process from 'node:process';
import {
  SGR_MOUSE_REGEX,
  X11_MOUSE_REGEX,
  SGR_EVENT_PREFIX,
  X11_EVENT_PREFIX,
  couldBeMouseSequence as inputCouldBeMouseSequence,
} from './input.js';

export type MouseEventName =
  | 'left-press'
  | 'left-release'
  | 'right-press'
  | 'right-release'
  | 'middle-press'
  | 'middle-release'
  | 'scroll-up'
  | 'scroll-down'
  | 'scroll-left'
  | 'scroll-right'
  | 'move';

export interface MouseEvent {
  name: MouseEventName;
  col: number;
  row: number;
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
}

export type MouseHandler = (event: MouseEvent) => void;

export function getMouseEventName(
  buttonCode: number,
  isRelease: boolean,
): MouseEventName | null {
  const isMove = (buttonCode & 32) !== 0;

  if (buttonCode === 66) {
    return 'scroll-left';
  } else if (buttonCode === 67) {
    return 'scroll-right';
  } else if ((buttonCode & 64) === 64) {
    if ((buttonCode & 1) === 0) {
      return 'scroll-up';
    } else {
      return 'scroll-down';
    }
  } else if (isMove) {
    return 'move';
  } else {
    const button = buttonCode & 3;
    const type = isRelease ? 'release' : 'press';
    switch (button) {
      case 0:
        return `left-${type}`;
      case 1:
        return `middle-${type}`;
      case 2:
        return `right-${type}`;
      default:
        return null;
    }
  }
}

export function parseSGRMouseEvent(
  buffer: string,
): { event: MouseEvent; length: number } | null {
  const match = buffer.match(SGR_MOUSE_REGEX);

  if (match) {
    const buttonCode = parseInt(match[1], 10);
    const col = parseInt(match[2], 10);
    const row = parseInt(match[3], 10);
    const action = match[4];
    const isRelease = action === 'm';

    const shift = (buttonCode & 4) !== 0;
    const meta = (buttonCode & 8) !== 0;
    const ctrl = (buttonCode & 16) !== 0;

    const name = getMouseEventName(buttonCode, isRelease);

    if (name) {
      return {
        event: {
          name,
          ctrl,
          meta,
          shift,
          col,
          row,
        },
        length: match[0].length,
      };
    }
    return null;
  }

  return null;
}

export function parseX11MouseEvent(
  buffer: string,
): { event: MouseEvent; length: number } | null {
  const match = buffer.match(X11_MOUSE_REGEX);
  if (!match) return null;

  // The 3 bytes are in match[1]
  const b = match[1].charCodeAt(0) - 32;
  const col = match[1].charCodeAt(1) - 32;
  const row = match[1].charCodeAt(2) - 32;

  const shift = (b & 4) !== 0;
  const meta = (b & 8) !== 0;
  const ctrl = (b & 16) !== 0;
  const isMove = (b & 32) !== 0;
  const isWheel = (b & 64) !== 0;

  let name: MouseEventName | null = null;

  if (isWheel) {
    const button = b & 3;
    switch (button) {
      case 0:
        name = 'scroll-up';
        break;
      case 1:
        name = 'scroll-down';
        break;
      default:
        break;
    }
  } else if (isMove) {
    name = 'move';
  } else {
    const button = b & 3;
    if (button === 3) {
      // X11 reports 'release' (3) for all button releases without specifying which one.
      // We'll default to 'left-release' as a best-effort guess if we don't track state.
      name = 'left-release';
    } else {
      switch (button) {
        case 0:
          name = 'left-press';
          break;
        case 1:
          name = 'middle-press';
          break;
        case 2:
          name = 'right-press';
          break;
        default:
          break;
      }
    }
  }

  if (name) {
    return {
      event: { name, ctrl, meta, shift, col, row },
      length: match[0].length,
    };
  }
  return null;
}

export function parseMouseEvent(
  buffer: string,
): { event: MouseEvent; length: number } | null {
  return parseSGRMouseEvent(buffer) || parseX11MouseEvent(buffer);
}

export function isIncompleteMouseSequence(buffer: string): boolean {
  if (!inputCouldBeMouseSequence(buffer)) return false;

  // If it matches a complete sequence, it's not incomplete.
  if (parseMouseEvent(buffer)) return false;

  if (buffer.startsWith(X11_EVENT_PREFIX)) {
    // X11 needs exactly 3 bytes after prefix.
    return buffer.length < X11_EVENT_PREFIX.length + 3;
  }

  if (buffer.startsWith(SGR_EVENT_PREFIX)) {
    // SGR sequences end with 'm' or 'M'.
    // If it doesn't have it yet, it's incomplete.
    // Add a reasonable max length check to fail early on garbage.
    return !/[mM]/.test(buffer) && buffer.length < 50;
  }

  // It's a prefix of the prefix (e.g. "ESC" or "ESC [")
  return true;
}

export function enableMouseEvents() {
  // Enable mouse tracking with SGR format
  // ?1002h = button event tracking (clicks + drags + scroll wheel)
  // ?1006h = SGR extended mouse mode (better coordinate handling)
  process.stdout.write('\u001b[?1002h\u001b[?1006h');
}

export function disableMouseEvents() {
  // Disable mouse tracking with SGR format
  process.stdout.write('\u001b[?1006l\u001b[?1002l');
}
