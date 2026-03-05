import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import type { CacheMeta, DiagramType, Theme } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RENDERER_VERSION = '0.1.0';
const MAX_CACHE_FILES = 100;
const CACHE_DIR = join(homedir(), '.cache', 'termviz');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureCacheDir(): void {
    if (!existsSync(CACHE_DIR)) {
        mkdirSync(CACHE_DIR, { recursive: true });
    }
}

/**
 * Compute the content-hash cache key.
 * Deterministic: same inputs always produce the same key.
 */
export function computeCacheKey(
    spec: string,
    diagramType: DiagramType,
    theme: Theme,
    widthPx: number,
): string {
    const payload = JSON.stringify({ spec, diagramType, theme, widthPx, v: RENDERER_VERSION });
    return createHash('sha256').update(payload).digest('hex');
}

// ---------------------------------------------------------------------------
// Core cache API
// ---------------------------------------------------------------------------

/**
 * Check if a rendered PNG is already cached.
 * Returns the absolute PNG path if found, null otherwise.
 */
export async function getCachedPath(key: string): Promise<string | null> {
    ensureCacheDir();
    const pngPath = join(CACHE_DIR, `${key}.png`);
    const metaPath = join(CACHE_DIR, `${key}.meta.json`);
    if (existsSync(pngPath) && existsSync(metaPath)) {
        return pngPath;
    }
    return null;
}

/**
 * Read cached metadata for a key.
 */
export async function getCacheMeta(key: string): Promise<CacheMeta | null> {
    ensureCacheDir();
    const metaPath = join(CACHE_DIR, `${key}.meta.json`);
    if (!existsSync(metaPath)) return null;
    try {
        const raw = await readFile(metaPath, 'utf-8');
        return JSON.parse(raw) as CacheMeta;
    } catch {
        return null;
    }
}

/**
 * Write PNG buffer + metadata to cache.
 * Returns the absolute path of the saved PNG.
 */
export async function setCached(
    key: string,
    buffer: Buffer,
    meta: Omit<CacheMeta, 'key' | 'pngPath' | 'createdAt' | 'rendererVersion'>,
): Promise<string> {
    ensureCacheDir();

    // Evict old entries if at capacity
    await evictIfNeeded();

    const pngPath = join(CACHE_DIR, `${key}.png`);
    const metaPath = join(CACHE_DIR, `${key}.meta.json`);

    const fullMeta: CacheMeta = {
        ...meta,
        key,
        pngPath,
        createdAt: new Date().toISOString(),
        rendererVersion: RENDERER_VERSION,
    };

    // writeFileSync for the buffer (no async overload issue with Buffer in ESM)
    writeFileSync(pngPath, buffer);
    await writeFile(metaPath, JSON.stringify(fullMeta, null, 2), 'utf-8');

    return pngPath;
}

// ---------------------------------------------------------------------------
// Eviction (oldest-first, simple LRU by mtime)
// ---------------------------------------------------------------------------

async function evictIfNeeded(): Promise<void> {
    const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.png'));
    if (files.length < MAX_CACHE_FILES) return;

    // Sort by mtime ascending (oldest first)
    const sorted = files
        .map((f) => ({ name: f, mtime: statSync(join(CACHE_DIR, f)).mtimeMs }))
        .sort((a, b) => a.mtime - b.mtime);

    // Remove oldest 20% to avoid per-render eviction churn
    const toRemove = sorted.slice(0, Math.max(1, Math.floor(MAX_CACHE_FILES * 0.2)));
    for (const { name } of toRemove) {
        const base = name.replace(/\.png$/, '');
        try {
            unlinkSync(join(CACHE_DIR, `${base}.png`));
            unlinkSync(join(CACHE_DIR, `${base}.meta.json`));
        } catch {
            // best-effort
        }
    }
}

export { CACHE_DIR };
