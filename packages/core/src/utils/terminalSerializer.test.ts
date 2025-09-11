/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { Terminal } from '@xterm/headless';
import {
  serializeTerminalToObject,
  convertColorToHex,
  ColorMode,
} from './terminalSerializer.js';

const RED_FG = '\x1b[31m';
const RESET = '\x1b[0m';

function writeToTerminal(terminal: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => {
    terminal.write(data, resolve);
  });
}

describe('terminalSerializer', () => {
  describe('serializeTerminalToObject', () => {
    it('should handle an empty terminal', () => {
      const terminal = new Terminal({
        cols: 80,
        rows: 24,
        allowProposedApi: true,
      });
      const result = serializeTerminalToObject(terminal);
      expect(result).toHaveLength(24);
      result.forEach((line) => {
        // Expect each line to be either empty or contain a single token with spaces
        if (line.length > 0) {
          expect(line[0].text.trim()).toBe('');
        }
      });
    });

    it('should serialize a single line of text', async () => {
      const terminal = new Terminal({
        cols: 80,
        rows: 24,
        allowProposedApi: true,
      });
      await writeToTerminal(terminal, 'Hello, world!');
      const result = serializeTerminalToObject(terminal);
      expect(result[0][0].text).toContain('Hello, world!');
    });

    it('should serialize multiple lines of text', async () => {
      const terminal = new Terminal({
        cols: 7,
        rows: 24,
        allowProposedApi: true,
      });
      await writeToTerminal(terminal, 'Line 1\r\nLine 2');
      const result = serializeTerminalToObject(terminal);
      expect(result[0][0].text).toBe('Line 1 ');
      expect(result[1][0].text).toBe('Line 2');
    });

    it('should handle bold text', async () => {
      const terminal = new Terminal({
        cols: 80,
        rows: 24,
        allowProposedApi: true,
      });
      await writeToTerminal(terminal, '\x1b[1mBold text\x1b[0m');
      const result = serializeTerminalToObject(terminal);
      expect(result[0][0].bold).toBe(true);
      expect(result[0][0].text).toBe('Bold text');
    });

    it('should handle italic text', async () => {
      const terminal = new Terminal({
        cols: 80,
        rows: 24,
        allowProposedApi: true,
      });
      await writeToTerminal(terminal, '\x1b[3mItalic text\x1b[0m');
      const result = serializeTerminalToObject(terminal);
      expect(result[0][0].italic).toBe(true);
      expect(result[0][0].text).toBe('Italic text');
    });

    it('should handle underlined text', async () => {
      const terminal = new Terminal({
        cols: 80,
        rows: 24,
        allowProposedApi: true,
      });
      await writeToTerminal(terminal, '\x1b[4mUnderlined text\x1b[0m');
      const result = serializeTerminalToObject(terminal);
      expect(result[0][0].underline).toBe(true);
      expect(result[0][0].text).toBe('Underlined text');
    });

    it('should handle dim text', async () => {
      const terminal = new Terminal({
        cols: 80,
        rows: 24,
        allowProposedApi: true,
      });
      await writeToTerminal(terminal, '\x1b[2mDim text\x1b[0m');
      const result = serializeTerminalToObject(terminal);
      expect(result[0][0].dim).toBe(true);
      expect(result[0][0].text).toBe('Dim text');
    });

    it('should handle inverse text', async () => {
      const terminal = new Terminal({
        cols: 80,
        rows: 24,
        allowProposedApi: true,
      });
      await writeToTerminal(terminal, '\x1b[7mInverse text\x1b[0m');
      const result = serializeTerminalToObject(terminal);
      expect(result[0][0].inverse).toBe(true);
      expect(result[0][0].text).toBe('Inverse text');
    });

    it('should handle foreground colors', async () => {
      const terminal = new Terminal({
        cols: 80,
        rows: 24,
        allowProposedApi: true,
      });
      await writeToTerminal(terminal, `${RED_FG}Red text${RESET}`);
      const result = serializeTerminalToObject(terminal);
      expect(result[0][0].fg).toBe('#800000');
      expect(result[0][0].text).toBe('Red text');
    });

    it('should handle background colors', async () => {
      const terminal = new Terminal({
        cols: 80,
        rows: 24,
        allowProposedApi: true,
      });
      await writeToTerminal(terminal, '\x1b[42mGreen background\x1b[0m');
      const result = serializeTerminalToObject(terminal);
      expect(result[0][0].bg).toBe('#008000');
      expect(result[0][0].text).toBe('Green background');
    });

    it('should handle RGB colors', async () => {
      const terminal = new Terminal({
        cols: 80,
        rows: 24,
        allowProposedApi: true,
      });
      await writeToTerminal(terminal, '\x1b[38;2;100;200;50mRGB text\x1b[0m');
      const result = serializeTerminalToObject(terminal);
      expect(result[0][0].fg).toBe('#64c832');
      expect(result[0][0].text).toBe('RGB text');
    });

    it('should handle a combination of styles', async () => {
      const terminal = new Terminal({
        cols: 80,
        rows: 24,
        allowProposedApi: true,
      });
      await writeToTerminal(terminal, '\x1b[1;31;42mStyled text\x1b[0m');
      const result = serializeTerminalToObject(terminal);
      expect(result[0][0].bold).toBe(true);
      expect(result[0][0].fg).toBe('#800000');
      expect(result[0][0].bg).toBe('#008000');
      expect(result[0][0].text).toBe('Styled text');
    });
  });
  describe('convertColorToHex', () => {
    it('should convert RGB color to hex', () => {
      const color = (100 << 16) | (200 << 8) | 50;
      const hex = convertColorToHex(color, ColorMode.RGB, '#000000');
      expect(hex).toBe('#64c832');
    });

    it('should convert palette color to hex', () => {
      const hex = convertColorToHex(1, ColorMode.PALETTE, '#000000');
      expect(hex).toBe('#800000');
    });

    it('should return default color for ColorMode.DEFAULT', () => {
      const hex = convertColorToHex(0, ColorMode.DEFAULT, '#ffffff');
      expect(hex).toBe('#ffffff');
    });

    it('should return default color for invalid palette index', () => {
      const hex = convertColorToHex(999, ColorMode.PALETTE, '#000000');
      expect(hex).toBe('#000000');
    });
  });
});
