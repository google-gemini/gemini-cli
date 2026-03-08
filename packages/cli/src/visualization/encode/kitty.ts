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

    let offset = 0;
    let isFirst = true;

    // Constrain height to roughly 50% of terminal rows (max 25)
    const maxRows = Math.min(Math.max(1, Math.floor(rows * 0.5)), 25);

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
                    columns: cols,
                    rows: maxRows,
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
