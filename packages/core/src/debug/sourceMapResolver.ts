/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Source Map Resolver — Handle Transpiled Code.
 *
 * In the real world, people debug TypeScript, not JavaScript.
 * When the debugger stops in a `.js` file, the developer wants
 * to see the original `.ts` source.
 *
 * This module:
 *   1. Detects source map files (.map) or inline source maps
 *   2. Maps transpiled positions back to original source
 *   3. Reads the original source for display
 *   4. Handles common source map scenarios:
 *      - TypeScript → JavaScript
 *      - Bundled code → original modules
 *      - Minified → readable
 *
 * This is CRITICAL for real-world use — without source maps,
 * the debug companion shows garbled transpiled code.
 */

import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceMapping {
    /** Original source file path */
    originalFile: string;
    /** Original line number */
    originalLine: number;
    /** Original column number */
    originalColumn: number;
    /** Original source content (if embedded in source map) */
    sourceContent?: string;
}

export interface SourceMapData {
    /** Source map version (always 3) */
    version: number;
    /** Generated file name */
    file?: string;
    /** Source root */
    sourceRoot?: string;
    /** Original source file names */
    sources: string[];
    /** Original source content (if embedded) */
    sourcesContent?: Array<string | null>;
    /** VLQ-encoded mappings */
    mappings: string;
    /** Original names */
    names?: string[];
}

// ---------------------------------------------------------------------------
// Source Map VLQ Decoder
// ---------------------------------------------------------------------------

const VLQ_BASE_SHIFT = 5;
const VLQ_BASE = 1 << VLQ_BASE_SHIFT;
const VLQ_BASE_MASK = VLQ_BASE - 1;
const VLQ_CONTINUATION_BIT = VLQ_BASE;

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeVLQ(encoded: string): number[] {
    const values: number[] = [];
    let shift = 0;
    let value = 0;

    for (const char of encoded) {
        const digit = B64_CHARS.indexOf(char);
        if (digit === -1) continue;

        const hasContinuation = (digit & VLQ_CONTINUATION_BIT) !== 0;
        const digitValue = digit & VLQ_BASE_MASK;
        value += digitValue << shift;

        if (hasContinuation) {
            shift += VLQ_BASE_SHIFT;
        } else {
            // Sign is in the least significant bit
            const isNegative = (value & 1) !== 0;
            const absValue = value >> 1;
            values.push(isNegative ? -absValue : absValue);
            value = 0;
            shift = 0;
        }
    }

    return values;
}

// ---------------------------------------------------------------------------
// SourceMapResolver
// ---------------------------------------------------------------------------

/**
 * Resolves transpiled positions back to original source.
 */
export class SourceMapResolver {
    private readonly cache = new Map<string, SourceMapData>();

    /**
     * Try to find and load a source map for a generated file.
     */
    async loadSourceMap(generatedFile: string): Promise<SourceMapData | null> {
        // Check cache
        if (this.cache.has(generatedFile)) {
            return this.cache.get(generatedFile)!;
        }

        try {
            // Strategy 1: Look for .map file
            const mapFile = `${generatedFile}.map`;
            if (fs.existsSync(mapFile)) {
                const content = await fs.promises.readFile(mapFile, 'utf-8');
                const data = JSON.parse(content) as SourceMapData;
                this.cache.set(generatedFile, data);
                return data;
            }

            // Strategy 2: Check for inline source map in the generated file
            const fileContent = await fs.promises.readFile(generatedFile, 'utf-8');
            const inlineMatch = /\/\/[#@]\s*sourceMappingURL=data:application\/json;base64,(.+)$/m.exec(
                fileContent,
            );
            if (inlineMatch) {
                const decoded = Buffer.from(inlineMatch[1], 'base64').toString('utf-8');
                const data = JSON.parse(decoded) as SourceMapData;
                this.cache.set(generatedFile, data);
                return data;
            }

            // Strategy 3: Check for external source map reference
            const refMatch = /\/\/[#@]\s*sourceMappingURL=(.+)$/m.exec(fileContent);
            if (refMatch) {
                const refPath = refMatch[1].trim();
                const dir = generatedFile.substring(0, generatedFile.lastIndexOf('/'));
                const fullPath = `${dir}/${refPath}`;
                if (fs.existsSync(fullPath)) {
                    const content = await fs.promises.readFile(fullPath, 'utf-8');
                    const data = JSON.parse(content) as SourceMapData;
                    this.cache.set(generatedFile, data);
                    return data;
                }
            }
        } catch {
            // Source map loading failed — not critical
        }

        return null;
    }

    /**
     * Resolve a position in a generated file to the original source.
     */
    resolve(
        sourceMap: SourceMapData,
        generatedLine: number,
        generatedColumn: number = 0,
    ): SourceMapping | null {
        const segments = this.parseMappings(sourceMap.mappings);

        // Find the mapping for the given line
        const lineIndex = generatedLine - 1; // 0-indexed
        if (lineIndex < 0 || lineIndex >= segments.length) {
            return null;
        }

        const lineSegments = segments[lineIndex];
        if (!lineSegments || lineSegments.length === 0) {
            return null;
        }

        // Find the best segment for the column
        let bestSegment = lineSegments[0];
        for (const seg of lineSegments) {
            if (seg.length >= 4 && seg[0] <= generatedColumn) {
                bestSegment = seg;
            }
        }

        if (bestSegment.length < 4) {
            return null;
        }

        const sourceIndex = bestSegment[1];
        const originalLine = bestSegment[2] + 1; // 1-indexed
        const originalColumn = bestSegment[3];

        const originalFile = sourceMap.sources[sourceIndex];
        if (!originalFile) return null;

        const sourceContent =
            sourceMap.sourcesContent?.[sourceIndex] ?? undefined;

        const root = sourceMap.sourceRoot ?? '';
        const fullPath = root ? `${root}${originalFile}` : originalFile;

        return {
            originalFile: fullPath,
            originalLine,
            originalColumn,
            sourceContent: sourceContent ?? undefined,
        };
    }

    /**
     * Parse the VLQ-encoded mappings string.
     */
    private parseMappings(mappings: string): number[][][] {
        const lines = mappings.split(';');
        const result: number[][][] = [];

        let sourceIndex = 0;
        let originalLine = 0;
        let originalColumn = 0;
        let nameIndex = 0;

        for (const line of lines) {
            const lineSegments: number[][] = [];

            if (line.length > 0) {
                const segments = line.split(',');
                let generatedColumn = 0;

                for (const segment of segments) {
                    const values = decodeVLQ(segment);
                    if (values.length === 0) continue;

                    generatedColumn += values[0];

                    const decoded = [generatedColumn];

                    if (values.length >= 4) {
                        sourceIndex += values[1];
                        originalLine += values[2];
                        originalColumn += values[3];

                        decoded.push(sourceIndex, originalLine, originalColumn);

                        if (values.length >= 5) {
                            nameIndex += values[4];
                            decoded.push(nameIndex);
                        }
                    }

                    lineSegments.push(decoded);
                }
            }

            result.push(lineSegments);
        }

        return result;
    }

    /**
     * Check if a file likely has a source map.
     */
    hasSourceMap(generatedFile: string): boolean {
        return (
            fs.existsSync(`${generatedFile}.map`) ||
            generatedFile.endsWith('.js') ||
            generatedFile.endsWith('.mjs')
        );
    }

    /**
     * Clear the source map cache.
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Generate LLM-friendly markdown about a resolved mapping.
     */
    toMarkdown(mapping: SourceMapping, generatedFile: string, generatedLine: number): string {
        const lines: string[] = [];
        lines.push('### 🗺️ Source Map Resolution');
        lines.push('');
        lines.push(`**Generated**: \`${generatedFile}:${String(generatedLine)}\``);
        lines.push(`**Original**: \`${mapping.originalFile}:${String(mapping.originalLine)}\``);

        if (mapping.sourceContent) {
            const srcLines = mapping.sourceContent.split('\n');
            const start = Math.max(0, mapping.originalLine - 3);
            const end = Math.min(srcLines.length, mapping.originalLine + 2);
            lines.push('');
            lines.push('```typescript');
            for (let i = start; i < end; i++) {
                const marker = i === mapping.originalLine - 1 ? '→' : ' ';
                lines.push(`${marker} ${String(i + 1).padStart(4)} | ${srcLines[i]}`);
            }
            lines.push('```');
        }

        return lines.join('\n');
    }
}
