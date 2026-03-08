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
const PNG_SIGNATURE = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const DEFAULT_SCALE = 1;
const MIN_SCALE = 0.6;
const MAX_SCALE = 2.0;
const CELL_HEIGHT_TO_WIDTH_RATIO = 2;

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

function readPngDimensions(pngBuffer: Buffer): { width: number; height: number } | null {
    if (pngBuffer.length < 24) {
        return null;
    }

    if (!pngBuffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
        return null;
    }

    const chunkType = pngBuffer.toString('ascii', 12, 16);
    if (chunkType !== 'IHDR') {
        return null;
    }

    const width = pngBuffer.readUInt32BE(16);
    const height = pngBuffer.readUInt32BE(20);

    if (width <= 0 || height <= 0) {
        return null;
    }

    return { width, height };
}

function fitToTerminalCells(
    imgWidth: number,
    imgHeight: number,
    cols: number,
    rows: number,
    scale: number,
): { widthCells: number; heightCells: number } {
    const maxCols = Math.max(20, cols - 2);
    const maxRows = Math.max(10, rows - 6);

    const colsCap = clamp(Math.round(maxCols * scale), 20, maxCols);
    const rowsCap = clamp(Math.round(maxRows * scale), 10, maxRows);

    const aspect = imgHeight / imgWidth;

    let widthCells = colsCap;
    let heightCells = Math.round(
        (widthCells * aspect) / CELL_HEIGHT_TO_WIDTH_RATIO,
    );

    if (heightCells > rowsCap) {
        heightCells = rowsCap;
        widthCells = Math.round(
            (heightCells * CELL_HEIGHT_TO_WIDTH_RATIO) / aspect,
        );
    }

    widthCells = clamp(widthCells, 20, colsCap);
    heightCells = clamp(heightCells, 10, rowsCap);

    return { widthCells, heightCells };
}

/**
 * Encode a PNG buffer as an iTerm2 OSC 1337 inline image escape sequence.
 */
export function encodeIterm2(pngBuffer: Buffer, cols = 80, rows = 24): string {
    const b64 = pngBuffer.toString('base64');
    const size = pngBuffer.byteLength;
    const scale = getDisplayScale();
    const dims = readPngDimensions(pngBuffer);

    const { widthCells, heightCells } = dims
        ? fitToTerminalCells(dims.width, dims.height, cols, rows, scale)
        : {
            widthCells: clamp(Math.round(cols * 0.9), 20, Math.max(20, cols - 2)),
            heightCells: clamp(Math.round(rows * 0.6), 10, Math.max(10, rows - 6)),
        };

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
