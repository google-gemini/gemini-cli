/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const ESC = '\u001B';
const ST = '\u001B\\';

/** Conservative chunk size for GNU screen DCS passthrough. */
export const SCREEN_DCS_CHUNK_SIZE = 240;

export function isInTmux(): boolean {
  return Boolean(
    process.env['TMUX'] || (process.env['TERM'] ?? '').startsWith('tmux'),
  );
}

export function isInScreen(): boolean {
  return Boolean(
    process.env['STY'] || (process.env['TERM'] ?? '').startsWith('screen'),
  );
}

export function wrapForTmux(seq: string): string {
  const doubledEsc = seq.split(ESC).join(ESC + ESC);
  return `${ESC}Ptmux;${doubledEsc}${ST}`;
}

export function wrapForScreen(seq: string): string {
  let out = '';
  for (let i = 0; i < seq.length; i += SCREEN_DCS_CHUNK_SIZE) {
    out += `${ESC}P${seq.slice(i, i + SCREEN_DCS_CHUNK_SIZE)}${ST}`;
  }
  return out;
}

/**
 * Wraps an OSC/DCS sequence so multiplexers forward it to the outer terminal.
 */
export function wrapOscForMultiplexer(seq: string): string {
  if (isInTmux()) {
    return wrapForTmux(seq);
  }
  if (isInScreen()) {
    return wrapForScreen(seq);
  }
  return seq;
}
