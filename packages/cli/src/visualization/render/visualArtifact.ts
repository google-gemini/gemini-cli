// ---------------------------------------------------------------------------
// Visual artifact renderer
// ---------------------------------------------------------------------------
//
// This is the "last mile" in the pipeline:
//   pngPath (from core) → detect terminal caps → pick encoder → write to stdout
//
// For the ASCII path, we read the original spec (not the PNG) since
// the ASCII renderer works from source, not from a raster.

import { readFile } from 'fs/promises';
import { detectTerminalCaps } from '../caps/detect.js';
import { encodeKitty } from '../encode/kitty.js';
import { encodeIterm2 } from '../encode/iterm2.js';
import { encodeSixel } from '../encode/sixel.js';
import { encodeAscii } from '../encode/ascii.js';
import type { RenderResult } from '../types.js';
import chalk from 'chalk';

export interface VisualArtifactOptions {
    /** Original Mermaid spec — needed for ASCII fallback path */
    spec?: string;
    /** Override terminal protocol detection */
    forceProtocol?: 'kitty' | 'iterm2' | 'sixel' | 'ascii';
    /** Show cache/protocol info line above the diagram */
    showMeta?: boolean;
}

/**
 * Render a VisualArtifact to the terminal.
 * Detects terminal capabilities and picks the best encoder automatically.
 */
export async function renderVisualArtifact(
    result: RenderResult,
    options: VisualArtifactOptions = {},
): Promise<void> {
    const caps = detectTerminalCaps();
    const protocol = options.forceProtocol ?? caps.protocol;

    if (options.showMeta !== false) {
        const cacheLabel = result.fromCache
            ? chalk.green('● cache hit')
            : chalk.yellow('◎ rendered');
        const protocolLabel = chalk.cyan(protocol.toUpperCase());
        process.stderr.write(
            `  ${cacheLabel}  ${protocolLabel}  ${result.widthPx}×${result.heightPx}px\n`,
        );
    }

    // ASCII path — we don't need to read the PNG at all
    if (protocol === 'ascii') {
        if (!options.spec) {
            process.stderr.write(
                chalk.yellow('  ⚠ ASCII fallback — no spec provided, showing PNG path instead.\n'),
            );
            process.stdout.write(`  PNG: ${result.pngPath}\n`);
            return;
        }
        const output = encodeAscii(options.spec, caps.columns);
        process.stdout.write(output);
        return;
    }

    // Graphic protocol paths — read the PNG from disk
    const pngBuffer = await readFile(result.pngPath);

    switch (protocol) {
        case 'kitty': {
            const output = encodeKitty(pngBuffer, caps.columns);
            process.stdout.write(output);
            break;
        }
        case 'iterm2': {
            const output = encodeIterm2(pngBuffer, caps.columns);
            process.stdout.write(output);
            break;
        }
        case 'sixel': {
            const output = await encodeSixel(pngBuffer, caps.columns);
            process.stdout.write(output);
            break;
        }
        default: {
            // Shouldn't reach here, but be safe
            process.stdout.write(`  PNG saved to: ${result.pngPath}\n`);
        }
    }
}
