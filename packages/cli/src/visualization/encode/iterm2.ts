// ---------------------------------------------------------------------------
// iTerm2 inline image protocol emitter
// ---------------------------------------------------------------------------
//
// Ref: https://iterm2.com/documentation-images.html
//
// Protocol: OSC 1337 ; File=<options> : <base64-PNG> BEL
//
// Options (semicolon-separated key=value):
//   inline=1         — display inline (not as attachment)
//   width=<N>        — width in characters, pixels (Npx), or percent (N%)
//   height=<N>       — height (same units)
//   preserveAspectRatio=1
//   name=<base64>    — optional display name

const OSC = '\x1b]';
const BEL = '\x07';

const DEFAULT_SCALE = 1;
const MIN_SCALE = 0.6;
const MAX_SCALE = 2.0;

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function getDisplayScale(): number {
    const raw = process.env['GEMINI_VIZ_SCALE'];
    if (!raw) return DEFAULT_SCALE;

    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_SCALE;
    return clamp(parsed, MIN_SCALE, MAX_SCALE);
}

/**
 * Encode a PNG buffer as an iTerm2 OSC 1337 inline image escape sequence.
 */
export function encodeIterm2(pngBuffer: Buffer, cols = 80, rows = 24): string {
    const b64 = pngBuffer.toString('base64');
    const size = pngBuffer.byteLength;
    const scale = getDisplayScale();

    // Give image more area by default while preserving enough rows for prompt/input.
    const maxCols = Math.max(20, cols - 2);
    const maxRows = Math.max(12, rows - 4);
    const widthCells = clamp(Math.round(cols * 0.95 * scale), 20, maxCols);
    const heightCells = clamp(Math.round(rows * 0.78 * scale), 12, maxRows);
    const widthSpec = widthCells.toString();
    const heightSpec = heightCells.toString();

    const args = [
        `inline=1`,
        `size=${size}`,
        `width=${widthSpec}`,
        `height=${heightSpec}`,
        `preserveAspectRatio=1`,
    ].join(';');

    return `${OSC}1337;File=${args}:${b64}${BEL}\n`;
}
