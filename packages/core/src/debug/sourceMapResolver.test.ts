/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import { SourceMapResolver } from './sourceMapResolver.js';
import type { SourceMapData } from './sourceMapResolver.js';

// Mock fs for file operations
vi.mock('fs', async () => {
    const actual = await vi.importActual<typeof import('fs')>('fs');
    return {
        ...actual,
        existsSync: vi.fn(() => false),
        promises: {
            ...actual.promises,
            readFile: vi.fn(async () => ''),
        },
    };
});

describe('SourceMapResolver', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('resolve', () => {
        it('should resolve a simple mapping', () => {
            // A simple source map: line 1, col 0 in generated = line 1, col 0 in source 0
            // VLQ: "AAAA" means generatedCol=0, sourceIdx=0, originalLine=0, originalCol=0
            const sourceMap: SourceMapData = {
                version: 3,
                sources: ['original.ts'],
                mappings: 'AAAA',
                sourcesContent: ['const x = 1;'],
            };

            const resolver = new SourceMapResolver();
            const mapping = resolver.resolve(sourceMap, 1, 0);

            expect(mapping).not.toBeNull();
            expect(mapping!.originalFile).toBe('original.ts');
            expect(mapping!.originalLine).toBe(1);
        });

        it('should handle source root', () => {
            const sourceMap: SourceMapData = {
                version: 3,
                sourceRoot: 'src/',
                sources: ['app.ts'],
                mappings: 'AAAA',
            };

            const resolver = new SourceMapResolver();
            const mapping = resolver.resolve(sourceMap, 1, 0);

            expect(mapping).not.toBeNull();
            expect(mapping!.originalFile).toBe('src/app.ts');
        });

        it('should return null for out-of-range line', () => {
            const sourceMap: SourceMapData = {
                version: 3,
                sources: ['app.ts'],
                mappings: 'AAAA',
            };

            const resolver = new SourceMapResolver();
            expect(resolver.resolve(sourceMap, 100, 0)).toBeNull();
        });

        it('should handle multi-line mappings', () => {
            // Two lines: first maps to source, second maps to source line 2
            // Line 1: AAAA (gen 0 → src 0, line 0, col 0)
            // Line 2: AACA (gen 0 → src 0, line 1, col 0)
            const sourceMap: SourceMapData = {
                version: 3,
                sources: ['app.ts'],
                mappings: 'AAAA;AACA',
            };

            const resolver = new SourceMapResolver();

            const line1 = resolver.resolve(sourceMap, 1, 0);
            expect(line1).not.toBeNull();
            expect(line1!.originalLine).toBe(1);

            const line2 = resolver.resolve(sourceMap, 2, 0);
            expect(line2).not.toBeNull();
            expect(line2!.originalLine).toBe(2);
        });

        it('should include source content when available', () => {
            const sourceMap: SourceMapData = {
                version: 3,
                sources: ['app.ts'],
                mappings: 'AAAA',
                sourcesContent: ['const hello = "world";'],
            };

            const resolver = new SourceMapResolver();
            const mapping = resolver.resolve(sourceMap, 1, 0);

            expect(mapping!.sourceContent).toBe('const hello = "world";');
        });
    });

    describe('loadSourceMap', () => {
        it('should load .map file when exists', async () => {
            const mapContent = JSON.stringify({
                version: 3,
                sources: ['app.ts'],
                mappings: 'AAAA',
            });

            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.promises.readFile).mockResolvedValue(mapContent);

            const resolver = new SourceMapResolver();
            const result = await resolver.loadSourceMap('/dist/app.js');

            expect(result).not.toBeNull();
            expect(result!.sources).toContain('app.ts');
        });

        it('should detect inline source maps', async () => {
            const inlineMap = {
                version: 3,
                sources: ['inline.ts'],
                mappings: 'AAAA',
            };
            const base64 = Buffer.from(JSON.stringify(inlineMap)).toString('base64');
            const fileContent = `console.log("hello");\n//# sourceMappingURL=data:application/json;base64,${base64}`;

            vi.mocked(fs.existsSync).mockReturnValue(false);
            vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);

            const resolver = new SourceMapResolver();
            const result = await resolver.loadSourceMap('/dist/app.js');

            expect(result).not.toBeNull();
            expect(result!.sources).toContain('inline.ts');
        });

        it('should return null when no source map found', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            vi.mocked(fs.promises.readFile).mockResolvedValue('console.log("hello");');

            const resolver = new SourceMapResolver();
            const result = await resolver.loadSourceMap('/dist/app.js');

            expect(result).toBeNull();
        });

        it('should cache source maps', async () => {
            const mapContent = JSON.stringify({
                version: 3,
                sources: ['cached.ts'],
                mappings: 'AAAA',
            });

            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.promises.readFile).mockResolvedValue(mapContent);

            const resolver = new SourceMapResolver();
            await resolver.loadSourceMap('/dist/app.js');
            await resolver.loadSourceMap('/dist/app.js');

            // readFile should only be called once (cached)
            expect(fs.promises.readFile).toHaveBeenCalledTimes(1);
        });
    });

    describe('clearCache', () => {
        it('should clear the cache', async () => {
            const mapContent = JSON.stringify({
                version: 3,
                sources: ['app.ts'],
                mappings: 'AAAA',
            });

            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.promises.readFile).mockResolvedValue(mapContent);

            const resolver = new SourceMapResolver();
            await resolver.loadSourceMap('/dist/app.js');
            resolver.clearCache();
            await resolver.loadSourceMap('/dist/app.js');

            expect(fs.promises.readFile).toHaveBeenCalledTimes(2);
        });
    });

    describe('toMarkdown', () => {
        it('should generate markdown with source context', () => {
            const resolver = new SourceMapResolver();
            const md = resolver.toMarkdown(
                {
                    originalFile: 'src/app.ts',
                    originalLine: 5,
                    originalColumn: 0,
                    sourceContent: 'line1\nline2\nline3\nline4\nconst x = null;\nreturn x.name;\nline7',
                },
                'dist/app.js',
                10,
            );

            expect(md).toContain('Source Map Resolution');
            expect(md).toContain('src/app.ts:5');
            expect(md).toContain('dist/app.js:10');
        });
    });
});
