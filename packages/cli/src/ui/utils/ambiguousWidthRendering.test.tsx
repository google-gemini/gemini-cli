/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression test for https://github.com/google-gemini/gemini-cli/issues/24181
 * ("타이핑 한 글자마다 랜더가 되어서 계속 새 줄이뜬다" – a new copy of the UI
 * appears on every render).
 *
 * Some terminals render East Asian *Ambiguous*-width characters as two cells:
 * macOS Terminal.app ("Unicode East Asian Ambiguous characters are wide"),
 * iTerm2 ("Treat ambiguous-width characters as double width"), GNOME
 * Terminal/VTE ("Ambiguous-width characters: Wide"), WezTerm
 * (`treat_east_asian_ambiguous_width_as_wide`), GNU screen (`cjkwidth on`) and
 * CJK-locale terminals that rely on glibc `wcwidth`. Every box-drawing glyph
 * used by Ink borders (─ │ ╭ ╮ ╯ ╰) is in that class, while the CLI measures
 * them as one cell. Bordered rows are therefore wider than the terminal and
 * soft-wrap; the inline renderer erases the previous frame by its *logical*
 * line count, so the top of the previous frame survives in scrollback on every
 * render (spinner tick, keystroke, ...).
 *
 * The terminal is emulated with xterm.js (the same engine the test renderer in
 * `test-utils/render.tsx` uses) plus a Unicode provider that treats ambiguous
 * characters as wide, i.e. `string-width` with `ambiguousIsNarrow: false`.
 */

import { EventEmitter } from 'node:events';
import { act, useEffect, useState } from 'react';
import {
  Box,
  Text,
  render as inkRender,
  setStringWidthFunction,
  type Instance,
  type RenderOptions,
} from 'ink';
import { Terminal, type IUnicodeVersionProvider } from '@xterm/headless';
import stringWidth from 'string-width';
import { afterEach, describe, expect, it } from 'vitest';
import { shouldDisableLineWrapping } from '@google/gemini-cli-core';
import {
  getCachedStringWidth,
  setAmbiguousCharactersWide,
} from './textUtils.js';

type RenderMetrics = Parameters<NonNullable<RenderOptions['onRender']>>[0];

const COLUMNS = 80;
const ROWS = 40;
const RERENDERS = 5;
const SENTINEL = 'Waiting for authentication...';
const FRAME_TIMEOUT_MS = 2000;

/**
 * xterm.js Unicode provider emulating a terminal whose width table treats
 * East Asian Ambiguous characters as wide.
 */
const ambiguousWideProvider: IUnicodeVersionProvider = {
  version: 'ambiguous-wide',
  wcwidth(codepoint: number): 0 | 1 | 2 {
    const width = stringWidth(String.fromCodePoint(codepoint), {
      ambiguousIsNarrow: false,
    });
    return Math.min(width, 2) as 0 | 1 | 2;
  },
  // Mirrors xterm's built-in UnicodeV6.charProperties(): the result packs
  // `width` into bits 1-2 and the "join with preceding cell" flag into bit 0.
  charProperties(codepoint: number, preceding: number): number {
    let width: number = this.wcwidth(codepoint);
    let shouldJoin = width === 0 && preceding !== 0;
    if (shouldJoin) {
      const precedingWidth = (preceding >> 1) & 3;
      if (precedingWidth === 0) {
        shouldJoin = false;
      } else if (precedingWidth > width) {
        width = precedingWidth;
      }
    }
    return ((width & 3) << 1) | (shouldJoin ? 1 : 0);
  },
};

/** Minimal TTY-like stdout that feeds Ink's output into a headless xterm. */
class TerminalStdout extends EventEmitter {
  readonly isTTY = true;
  readonly columns = COLUMNS;
  readonly rows = ROWS;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly terminal: Terminal) {
    super();
  }

  getColorDepth(): number {
    return 24;
  }

  write = (data: string): boolean => {
    this.queue = this.queue.then(
      () => new Promise<void>((resolve) => this.terminal.write(data, resolve)),
    );
    return true;
  };

  /** Resolves once xterm has processed everything written so far. */
  flush(): Promise<void> {
    return this.queue;
  }
}

class TerminalStdin extends EventEmitter {
  readonly isTTY = true;
  setEncoding() {}
  setRawMode() {}
  resume() {}
  pause() {}
  ref() {}
  unref() {}
  read() {
    return null;
  }
}

let bumpRender: (() => void) | undefined;

/**
 * A round-bordered, full-width box like `AuthInProgress`/dialogs. Every call
 * to `bumpRender()` changes the content (like a spinner tick or a typed
 * character would) so Ink must write a new frame.
 */
function Dialog() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    bumpRender = () => setTick((t) => t + 1);
    return () => {
      bumpRender = undefined;
    };
  }, []);
  return (
    <Box borderStyle="round" flexDirection="column" padding={1} width="100%">
      <Text>{`${SENTINEL} (render ${tick})`}</Text>
    </Box>
  );
}

const renderMarker = (tick: number) => `(render ${tick})`;

interface Harness {
  terminal: Terminal;
  stdout: TerminalStdout;
  instance: Instance;
  /** Resolves once Ink has produced a frame containing `text`. */
  waitForFrame: (text: string) => Promise<void>;
  bufferLines: () => string[];
  dispose: () => void;
}

async function mountDialog(options: {
  ambiguousWide: boolean;
}): Promise<Harness> {
  const terminal = new Terminal({
    cols: COLUMNS,
    rows: ROWS,
    scrollback: 1000,
    allowProposedApi: true,
    // A real TTY translates "\n" to "\r\n" (ONLCR); xterm needs the same.
    convertEol: true,
  });
  if (options.ambiguousWide) {
    terminal.unicode.register(ambiguousWideProvider);
    terminal.unicode.activeVersion = ambiguousWideProvider.version;
  }

  const stdout = new TerminalStdout(terminal);
  const stdin = new TerminalStdin();
  const frames: string[] = [];
  const frameEvents = new EventEmitter();

  // Mirror what startup does once terminalCapabilityManager has probed how the
  // terminal renders ambiguous-width glyphs: setupTerminalAndTheme() switches
  // the width measurements, and interactiveCli hands getCachedStringWidth to
  // Ink and turns auto-wrap off (DECAWM).
  setAmbiguousCharactersWide(options.ambiguousWide);
  setStringWidthFunction(getCachedStringWidth);
  if (shouldDisableLineWrapping(false, options.ambiguousWide)) {
    stdout.write('\x1b[?7l');
  }

  // Ink throttles frames (30 fps, trailing edge), so a state update is not
  // necessarily on screen when `act()` returns; wait for the actual frame.
  const waitForFrame = async (text: string): Promise<void> => {
    if (!frames.some((frame) => frame.includes(text))) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          frameEvents.off('frame', onFrame);
          reject(
            new Error(
              `Timed out waiting for a frame containing "${text}". ` +
                `Frames so far: ${frames.length}`,
            ),
          );
        }, FRAME_TIMEOUT_MS);
        function onFrame(frame: string) {
          if (frame.includes(text)) {
            clearTimeout(timer);
            frameEvents.off('frame', onFrame);
            resolve();
          }
        }
        frameEvents.on('frame', onFrame);
      });
    }
    await stdout.flush();
  };

  let instance!: Instance;
  await act(async () => {
    instance = inkRender(<Dialog />, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      debug: false,
      exitOnCtrlC: false,
      patchConsole: false,
      onRender: (metrics: RenderMetrics) => {
        frames.push(metrics.output);
        frameEvents.emit('frame', metrics.output);
      },
    });
  });
  await waitForFrame(renderMarker(0));

  return {
    terminal,
    stdout,
    instance,
    waitForFrame,
    bufferLines: () => {
      const buffer = terminal.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < buffer.length; i++) {
        lines.push(buffer.getLine(i)?.translateToString(true) ?? '');
      }
      return lines;
    },
    dispose: () => {
      act(() => instance.unmount());
      terminal.dispose();
    },
  };
}

async function rerenderTimes(harness: Harness, times: number): Promise<void> {
  for (let tick = 1; tick <= times; tick++) {
    await act(async () => {
      bumpRender?.();
    });
    await harness.waitForFrame(renderMarker(tick));
  }
}

describe('inline rendering in a terminal that renders ambiguous-width characters as wide (#24181)', () => {
  let harness: Harness | undefined;

  afterEach(() => {
    harness?.dispose();
    harness = undefined;
    setAmbiguousCharactersWide(false);
  });

  it('control: a standard terminal keeps exactly one copy of the dialog after re-renders', async () => {
    harness = await mountDialog({ ambiguousWide: false });
    await rerenderTimes(harness, RERENDERS);

    const lines = harness.bufferLines();
    const copies = lines.filter((l) => l.includes(SENTINEL));
    expect(copies).toHaveLength(1);
    expect(copies[0]).toContain(renderMarker(RERENDERS));
    // Borders are intact and fit the terminal width.
    expect(lines[0]).toBe(`╭${'─'.repeat(COLUMNS - 2)}╮`);
  });

  it('does not leave a ghost copy of the dialog in scrollback on every render', async () => {
    harness = await mountDialog({ ambiguousWide: true });
    await rerenderTimes(harness, RERENDERS);

    const lines = harness.bufferLines();
    const copies = lines.filter((l) => l.includes(SENTINEL));

    // The live frame must be the latest one...
    expect(copies.at(-1)).toContain(renderMarker(RERENDERS));
    // ...and it must be the only one. Without width-aware measurement this
    // yields one copy per frame: the 80-column border is drawn as 160 cells,
    // every row of the box wraps, and `eraseLines(previousLineCount)` erases 5
    // logical rows out of 10 physical rows, so the top half of each previous
    // frame is left behind.
    expect(copies).toHaveLength(1);
    // Nothing but the live frame (top border, padding, text, padding, bottom
    // border) may be on screen: no wrapped border remnants, no stray bars.
    const nonEmpty = lines.filter((l) => l.trim() !== '');
    expect(nonEmpty).toHaveLength(5);
  });

  it('draws rows that fit the terminal width', async () => {
    harness = await mountDialog({ ambiguousWide: true });

    const lines = harness.bufferLines();
    // Physical width as the (ambiguous-wide) terminal sees each row.
    const physicalWidth = (line: string) =>
      stringWidth(line, { ambiguousIsNarrow: false });
    const [top, , text, , bottom] = lines;

    // Every row of the box must end on the physical row it started on, i.e.
    // nothing may wrap. Without width-aware measurement the top border holds
    // 40 glyphs (= 80 cells) and the remaining 40 glyphs spill onto the next
    // row; the right-hand border of every content row wraps as well.
    expect(top.startsWith('╭')).toBe(true);
    expect(bottom.startsWith('╰')).toBe(true);
    expect(text).toContain(SENTINEL);
    for (const row of [top, text, bottom]) {
      expect(physicalWidth(row)).toBeLessThanOrEqual(COLUMNS);
    }
  });
});
