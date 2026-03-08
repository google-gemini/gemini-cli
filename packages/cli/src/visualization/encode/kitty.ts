// ---------------------------------------------------------------------------
// Kitty graphics protocol emitter
// ---------------------------------------------------------------------------
//
// Ref: https://sw.kovidgoyal.net/kitty/graphics-protocol/
//
// We send the PNG in chunks via the Kitty graphics escape:
//   ESC _G <key=value pairs> ; <base64 data> ESC \
//
// Chunking is required for large images (Kitty expects ≤4096 bytes per chunk).

const CHUNK_SIZE = 4096;
const ESC = '\x1b';
const APC_START = `${ESC}_G`;
const ST = `${ESC}\\`;
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

interface KittyChunkOptions {
    action?: 'T' | 'q'; // T = transmit, q = query
    format?: 100 | 32; // 100 = PNG, 32 = RGBA
    medium?: 'f' | 'd'; // f = file, d = direct
    more?: 0 | 1; // 1 = more chunks follow
    width?: number;
    height?: number;
    columns?: number;
    rows?: number;
    id?: number;
}

function buildKittyChunk(b64: string, opts: KittyChunkOptions): string {
    const pairs: string[] = [];

    if (opts.action !== undefined) pairs.push(`a=${opts.action}`);
    if (opts.format !== undefined) pairs.push(`f=${opts.format}`);
    if (opts.medium !== undefined) pairs.push(`t=${opts.medium}`);
    if (opts.more !== undefined) pairs.push(`m=${opts.more}`);
    if (opts.width !== undefined) pairs.push(`s=${opts.width}`);
    if (opts.height !== undefined) pairs.push(`v=${opts.height}`);
    if (opts.columns !== undefined) pairs.push(`c=${opts.columns}`);
    if (opts.rows !== undefined) pairs.push(`r=${opts.rows}`);
    if (opts.id !== undefined) pairs.push(`i=${opts.id}`);

    return `${APC_START}${pairs.join(',')};${b64}${ST}`;
}

/**
 * Encode a PNG buffer as a Kitty graphics protocol escape sequence.
 * Returns the full escape string ready to write to stdout.
 */
export function encodeKitty(pngBuffer: Buffer, cols = 80, rows = 24): string {
    const b64 = pngBuffer.toString('base64');
    const chunks: string[] = [];
    const scale = getDisplayScale();
    const dims = readPngDimensions(pngBuffer);

    let offset = 0;
    let isFirst = true;

    const { widthCells: targetCols, heightCells: targetRows } = dims
        ? fitToTerminalCells(dims.width, dims.height, cols, rows, scale)
        : {
            widthCells: clamp(Math.round(cols * 0.9), 20, Math.max(20, cols - 2)),
            heightCells: clamp(Math.round(rows * 0.6), 10, Math.max(10, rows - 6)),
        };

    while (offset < b64.length) {
        const slice = b64.slice(offset, offset + CHUNK_SIZE);
        offset += CHUNK_SIZE;
        const more: 0 | 1 = offset < b64.length ? 1 : 0;

        if (isFirst) {
            chunks.push(
                buildKittyChunk(slice, {
                    action: 'T',
                    format: 100, // PNG
                    medium: 'd', // direct transfer
                    more,
                    columns: targetCols,
                    rows: targetRows,
                }),
            );
            isFirst = false;
        } else {
            chunks.push(buildKittyChunk(slice, { more }));
        }
    }

    // Newline after the image so subsequent text starts on a new line
    return chunks.join('') + '\n';
}
