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

/**
 * Encode a PNG buffer as an iTerm2 OSC 1337 inline image escape sequence.
 */
export function encodeIterm2(pngBuffer: Buffer, cols = 80): string {
    const b64 = pngBuffer.toString('base64');
    const size = pngBuffer.byteLength;

    // Width capped to terminal column count
    const widthSpec = `${Math.min(cols, 200)}`;

    const args = [
        `inline=1`,
        `size=${size}`,
        `width=${widthSpec}`,
        `preserveAspectRatio=1`,
    ].join(';');

    return `${OSC}1337;File=${args}:${b64}${BEL}\n`;
}
