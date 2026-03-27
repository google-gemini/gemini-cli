/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { DebugAdapterRegistry } from './debugAdapterRegistry.js';

describe('DebugAdapterRegistry', () => {
    const registry = new DebugAdapterRegistry();

    describe('getAdapter', () => {
        it('should return Node.js adapter for javascript', () => {
            const adapter = registry.getAdapter('javascript');
            expect(adapter).toBeDefined();
            expect(adapter?.name).toBe('Node.js Inspector');
            expect(adapter?.command).toBe('node');
            expect(adapter?.defaultPort).toBe(9229);
        });

        it('should return Node.js adapter for typescript', () => {
            const adapter = registry.getAdapter('typescript');
            expect(adapter).toBeDefined();
            expect(adapter?.name).toBe('Node.js Inspector');
        });

        it('should return Python adapter', () => {
            const adapter = registry.getAdapter('python');
            expect(adapter).toBeDefined();
            expect(adapter?.name).toBe('debugpy (Python)');
            expect(adapter?.command).toBe('python');
            expect(adapter?.defaultPort).toBe(5678);
        });

        it('should return Go adapter', () => {
            const adapter = registry.getAdapter('go');
            expect(adapter).toBeDefined();
            expect(adapter?.name).toBe('Delve (Go)');
            expect(adapter?.command).toBe('dlv');
            expect(adapter?.defaultPort).toBe(2345);
        });

        it('should be case-insensitive', () => {
            expect(registry.getAdapter('Python')).toBeDefined();
            expect(registry.getAdapter('GO')).toBeDefined();
        });

        it('should return undefined for unknown language', () => {
            expect(registry.getAdapter('rust')).toBeUndefined();
        });
    });

    describe('detectAdapter', () => {
        it('should detect Node.js from .js extension', () => {
            const adapter = registry.detectAdapter('/app/src/main.js');
            expect(adapter?.language).toBe('javascript');
        });

        it('should detect Node.js from .ts extension', () => {
            const adapter = registry.detectAdapter('/app/src/main.ts');
            expect(adapter?.language).toBe('javascript');
        });

        it('should detect Python from .py extension', () => {
            const adapter = registry.detectAdapter('/app/script.py');
            expect(adapter?.language).toBe('python');
        });

        it('should detect Go from .go extension', () => {
            const adapter = registry.detectAdapter('/app/main.go');
            expect(adapter?.language).toBe('go');
        });

        it('should return undefined for unknown extension', () => {
            expect(registry.detectAdapter('/app/main.rs')).toBeUndefined();
        });
    });

    describe('buildLaunchCommand', () => {
        it('should build Node.js launch command with port substitution', () => {
            const adapter = registry.getAdapter('javascript')!;
            const result = registry.buildLaunchCommand(adapter, 'app.js', 9230);

            expect(result.command).toBe('node');
            expect(result.args).toContain('--inspect-brk=0.0.0.0:9230');
            expect(result.args).toContain('app.js');
        });

        it('should use default port when none specified', () => {
            const adapter = registry.getAdapter('python')!;
            const result = registry.buildLaunchCommand(adapter, 'script.py');

            expect(result.args).toEqual(
                expect.arrayContaining([expect.stringContaining('5678')]),
            );
        });

        it('should append additional args', () => {
            const adapter = registry.getAdapter('javascript')!;
            const result = registry.buildLaunchCommand(adapter, 'app.js', undefined, ['--env', 'dev']);

            expect(result.args).toContain('--env');
            expect(result.args).toContain('dev');
        });
    });

    describe('getLanguages', () => {
        it('should list all registered languages', () => {
            const langs = registry.getLanguages();
            expect(langs).toContain('javascript');
            expect(langs).toContain('typescript');
            expect(langs).toContain('python');
            expect(langs).toContain('go');
        });
    });

    describe('registerAdapter', () => {
        it('should support custom adapter registration', () => {
            const custom = new DebugAdapterRegistry();
            custom.registerAdapter('ruby', {
                name: 'Ruby Debug',
                language: 'ruby',
                command: 'ruby',
                args: ['-r', 'debug/open', '{program}'],
                defaultPort: 1234,
                extensions: ['.rb'],
                protocol: 'tcp',
            });

            expect(custom.getAdapter('ruby')).toBeDefined();
            expect(custom.detectAdapter('app.rb')?.name).toBe('Ruby Debug');
        });
    });

    describe('getSupportedLanguagesSummary', () => {
        it('should generate markdown-formatted summary', () => {
            const summary = registry.getSupportedLanguagesSummary();
            expect(summary).toContain('Node.js Inspector');
            expect(summary).toContain('debugpy');
            expect(summary).toContain('Delve');
        });
    });
});
