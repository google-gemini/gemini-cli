/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Breakpoint Persistence Store.
 *
 * Saves breakpoints to `.gemini/debug-breakpoints.json` so they survive
 * across debug sessions. When the agent restarts a debugging session,
 * it can restore previously set breakpoints automatically.
 *
 * This addresses the "interactive debug mode" requirement by providing
 * session continuity — the agent says:
 *   "Restoring 3 breakpoints from your last debug session."
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredBreakpoint {
    /** Absolute file path */
    file: string;
    /** Line number */
    line: number;
    /** Optional condition expression */
    condition?: string;
    /** Optional log message (logpoint) */
    logMessage?: string;
    /** When this breakpoint was last set */
    lastSet: string;
}

export interface BreakpointStoreData {
    version: 1;
    breakpoints: StoredBreakpoint[];
}

// ---------------------------------------------------------------------------
// BreakpointStore
// ---------------------------------------------------------------------------

const STORE_FILENAME = 'debug-breakpoints.json';

/**
 * Persists breakpoints to disk so they survive across debug sessions.
 *
 * Usage:
 * ```ts
 * const store = new BreakpointStore('/path/to/project/.gemini');
 * store.add({ file: 'src/main.ts', line: 42 });
 * store.save();
 * // ... later ...
 * const store2 = new BreakpointStore('/path/to/project/.gemini');
 * store2.load();
 * const bps = store2.getForFile('src/main.ts');
 * ```
 */
export class BreakpointStore {
    private readonly filePath: string;
    private breakpoints: StoredBreakpoint[] = [];

    constructor(geminiDir: string) {
        this.filePath = join(geminiDir, STORE_FILENAME);
    }

    /**
     * Load breakpoints from disk. Returns false if no store file exists.
     */
    load(): boolean {
        try {
            const raw = readFileSync(this.filePath, 'utf-8');
            const data = JSON.parse(raw) as BreakpointStoreData;
            if (data.version === 1 && Array.isArray(data.breakpoints)) {
                this.breakpoints = data.breakpoints;
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    /**
     * Save current breakpoints to disk.
     */
    save(): void {
        const data: BreakpointStoreData = {
            version: 1,
            breakpoints: this.breakpoints,
        };

        try {
            mkdirSync(dirname(this.filePath), { recursive: true });
            writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
        } catch {
            // Non-critical — breakpoints will be lost but session continues
        }
    }

    /**
     * Add or update a breakpoint.
     */
    add(bp: Omit<StoredBreakpoint, 'lastSet'>): void {
        // Remove existing breakpoint at same location
        this.breakpoints = this.breakpoints.filter(
            (b) => !(b.file === bp.file && b.line === bp.line),
        );

        this.breakpoints.push({
            ...bp,
            lastSet: new Date().toISOString(),
        });
    }

    /**
     * Remove a breakpoint at a specific location.
     */
    remove(file: string, line: number): boolean {
        const before = this.breakpoints.length;
        this.breakpoints = this.breakpoints.filter(
            (b) => !(b.file === file && b.line === line),
        );
        return this.breakpoints.length < before;
    }

    /**
     * Get all breakpoints for a specific file.
     */
    getForFile(file: string): StoredBreakpoint[] {
        return this.breakpoints.filter((b) => b.file === file);
    }

    /**
     * Get all stored breakpoints.
     */
    getAll(): StoredBreakpoint[] {
        return [...this.breakpoints];
    }

    /**
     * Clear all breakpoints.
     */
    clear(): void {
        this.breakpoints = [];
    }

    /**
     * Get a summary for LLM context.
     */
    getSummary(): string {
        if (this.breakpoints.length === 0) {
            return 'No saved breakpoints.';
        }

        const byFile = new Map<string, StoredBreakpoint[]>();
        for (const bp of this.breakpoints) {
            const existing = byFile.get(bp.file) ?? [];
            existing.push(bp);
            byFile.set(bp.file, existing);
        }

        const lines: string[] = [`${String(this.breakpoints.length)} saved breakpoint(s):`];
        for (const [file, bps] of byFile) {
            const parts = file.split('/');
            const short = parts.length > 3 ? `.../${parts.slice(-3).join('/')}` : file;
            const lineNums = bps.map((b) => String(b.line)).join(', ');
            lines.push(`- \`${short}\`: line${bps.length > 1 ? 's' : ''} ${lineNums}`);
        }

        return lines.join('\n');
    }
}
