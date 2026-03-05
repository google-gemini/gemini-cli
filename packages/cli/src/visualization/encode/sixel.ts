// ---------------------------------------------------------------------------
// SIXEL encoder emitter
// ---------------------------------------------------------------------------
//
// SIXEL is the oldest terminal graphics protocol (DEC VT240, 1983).
// It's still used in xterm, mlterm, Windows Terminal (recent), and others.
//
// We use the `sixel` npm package for the actual encoding work,
// with Sharp to resize the PNG to a reasonable height first (SIXEL
// doesn't handle massive images well in all terminals).

import sharp from 'sharp';

// Dynamic import of sixel (ESM-only package)
async function getSixelEncoder(): Promise<{ encode: (data: Uint8ClampedArray, width: number, height: number) => string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = await import('sixel') as any;
    return mod.default ?? mod;
}

/**
 * Encode a PNG buffer as a SIXEL escape sequence string.
 * Resizes to at most `maxHeight` pixels tall before encoding to avoid
 * overflowing the terminal scroll buffer.
 */
export async function encodeSixel(pngBuffer: Buffer, cols = 80, maxHeight = 600): Promise<string> {
    // Resize: cap height and scale width proportionally
    const resized = await sharp(pngBuffer)
        .resize({ height: maxHeight, withoutEnlargement: true, fit: 'inside' })
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { data, info } = resized;
    const { width, height, channels } = info;

    // SIXEL encoder expects RGBA Uint8ClampedArray
    let rgbaData: Uint8ClampedArray;
    if (channels === 4) {
        rgbaData = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    } else {
        // Convert to RGBA
        const rgba = Buffer.alloc(width * height * 4);
        for (let i = 0; i < width * height; i++) {
            const src = i * channels;
            rgba[i * 4] = data[src]!;
            rgba[i * 4 + 1] = data[src + 1]!;
            rgba[i * 4 + 2] = data[src + 2]!;
            rgba[i * 4 + 3] = 255;
        }
        rgbaData = new Uint8ClampedArray(rgba.buffer);
    }

    const encoder = await getSixelEncoder();
    const sixelOutput = encoder.encode(rgbaData, width, height);
    return sixelOutput + '\n';
}
