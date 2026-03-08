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
// Handles both v1 API (encode function) and v2 API (SixelEncoder class)
async function encodeSixelData(rgbaData: Uint8ClampedArray, width: number, height: number): Promise<string> {
    try {
        const mod = await import('sixel');
        const candidate = (mod as any).default ?? mod;

        if (typeof candidate?.encode === 'function') {
            return candidate.encode(rgbaData, width, height);
        }

        const EncoderClass = (mod as any).SixelEncoder ?? candidate?.SixelEncoder;
        if (EncoderClass) {
            const encoder = new EncoderClass();
            encoder.init(width, height, undefined, undefined, true);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    encoder.addPixel(x, rgbaData[i]!, rgbaData[i + 1]!, rgbaData[i + 2]!, rgbaData[i + 3]!);
                }
            }
            return encoder.toString();
        }
    } catch (e) {
        throw new Error(`SIXEL package load failed: ${e}`);
    }

    throw new Error('sixel package API not recognized — try: npm install sixel@1 -w packages/cli');
}

/**
 * Encode a PNG buffer as a SIXEL escape sequence string.
 * Resizes to at most `maxHeight` pixels tall before encoding to avoid
 * overflowing the terminal scroll buffer.
 */
export async function encodeSixel(pngBuffer: Buffer, cols = 80, rows = 24): Promise<string> {
    // Dynamic maxHeight: roughly 50% of terminal rows * pixels-per-row estimate (e.g. 15px)
    const maxHeight = Math.min(Math.floor(rows * 0.5 * 15), 25 * 15);
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

    const sixelOutput = await encodeSixelData(rgbaData, width, height);
    return sixelOutput + '\n';
}
