import { computeCacheKey, getCachedPath, setCached } from '../cache/index.js';
import { renderMermaidToPng } from '../render/mermaid.js';
import type { PipelineOptions, RenderResult } from '../types.js';
import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Renderer version (bump when render logic changes to bust cache)
// ---------------------------------------------------------------------------

export const PIPELINE_VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Pipeline orchestrator
// ---------------------------------------------------------------------------

/**
 * Main pipeline entry point.
 *
 * Flow:
 *   PipelineOptions
 *     → compute cache key
 *     → cache hit? return cached path
 *     → render (Mermaid → PNG buffer)
 *     → resize/optimize via Sharp
 *     → write to cache
 *     → return RenderResult
 *
 * Core never touches the terminal — it only returns paths to PNG files.
 */
export async function runPipeline(options: PipelineOptions): Promise<RenderResult> {
    const theme = options.theme ?? 'dark';
    const widthPx = options.widthPx ?? 1200;

    if (options.diagramType !== 'mermaid') {
        throw new Error(`Unsupported diagram type: ${options.diagramType}. Only 'mermaid' is supported in MVP.`);
    }

    // ASCII-only fast path — skip Puppeteer entirely
    if (options.asciiOnly) {
        return { pngPath: 'ascii', widthPx: 0, heightPx: 0, fromCache: false };
    }

    // 1. Check cache
    const key = computeCacheKey(options.spec, options.diagramType, theme, widthPx);
    const cachedPath = await getCachedPath(key);

    if (cachedPath) {
        // Read dimensions from the cached file
        const meta = await sharp(cachedPath).metadata();
        return {
            pngPath: cachedPath,
            widthPx: meta.width ?? widthPx,
            heightPx: meta.height ?? 0,
            fromCache: true,
        };
    }

    // 2. Render
    const rawBuffer = await renderMermaidToPng(options.spec, {
        theme,
        widthPx,
        backgroundColor: options.backgroundColor,
    });

    // 3. Post-process with Sharp (optimize, enforce max width)
    const processedBuffer = await sharp(rawBuffer)
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .resize({ width: widthPx, withoutEnlargement: true })
        .toBuffer();

    const meta = await sharp(processedBuffer).metadata();

    // 4. Cache
    const pngPath = await setCached(key, processedBuffer, {
        spec: options.spec,
        diagramType: options.diagramType,
        theme,
        widthPx: meta.width ?? widthPx,
        heightPx: meta.height ?? 0,
    });

    return {
        pngPath,
        widthPx: meta.width ?? widthPx,
        heightPx: meta.height ?? 0,
        fromCache: false,
    };
}
