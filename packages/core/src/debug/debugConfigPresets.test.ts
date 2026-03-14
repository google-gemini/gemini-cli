/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { DebugConfigPresets } from './debugConfigPresets.js';

describe('DebugConfigPresets', () => {
    const presets = new DebugConfigPresets();

    describe('getAll', () => {
        it('should return all built-in presets', () => {
            const all = presets.getAll();
            expect(all.length).toBe(7);
        });

        it('should include all major frameworks', () => {
            const names = presets.getAll().map((p) => p.name);
            expect(names).toContain('Express.js');
            expect(names).toContain('Jest');
            expect(names).toContain('Vitest');
            expect(names).toContain('Next.js');
            expect(names).toContain('Flask');
            expect(names).toContain('Django');
            expect(names).toContain('Go HTTP Server');
        });
    });

    describe('getByName', () => {
        it('should find preset by name (case-insensitive)', () => {
            expect(presets.getByName('express.js')).toBeDefined();
            expect(presets.getByName('Express.js')).toBeDefined();
            expect(presets.getByName('jest')).toBeDefined();
        });

        it('should return undefined for unknown preset', () => {
            expect(presets.getByName('rails')).toBeUndefined();
        });
    });

    describe('detectFromDependencies', () => {
        it('should detect Express from package.json deps', () => {
            const matches = presets.detectFromDependencies({
                express: '^4.18.0',
                cors: '^2.8.0',
            });

            expect(matches).toHaveLength(1);
            expect(matches[0].name).toBe('Express.js');
        });

        it('should detect multiple frameworks', () => {
            const matches = presets.detectFromDependencies({
                next: '^14.0.0',
                jest: '^29.0.0',
            });

            expect(matches.length).toBeGreaterThanOrEqual(2);
        });

        it('should return empty for no matches', () => {
            const matches = presets.detectFromDependencies({
                lodash: '^4.17.0',
            });

            expect(matches).toHaveLength(0);
        });
    });

    describe('detectFromFileContent', () => {
        it('should detect Express from import', () => {
            const content = "const express = require('express');\napp.listen(3000);";
            const matches = presets.detectFromFileContent(content);

            expect(matches.some((m) => m.name === 'Express.js')).toBe(true);
        });

        it('should detect Flask from import', () => {
            const content = 'from flask import Flask\napp = Flask(__name__)';
            const matches = presets.detectFromFileContent(content);

            expect(matches.some((m) => m.name === 'Flask')).toBe(true);
        });
    });

    describe('buildCommand', () => {
        it('should build Express launch command', () => {
            const preset = presets.getByName('Express.js')!;
            const cmd = presets.buildCommand(preset, 'server.js');

            expect(cmd.command).toBe('node');
            expect(cmd.args).toContain('server.js');
            expect(cmd.env['NODE_ENV']).toBe('development');
        });

        it('should build Jest launch command with entry file', () => {
            const preset = presets.getByName('Jest')!;
            const cmd = presets.buildCommand(preset, 'src/utils.test.js');

            expect(cmd.args).toContain('--runInBand');
            expect(cmd.args).toContain('src/utils.test.js');
        });
    });

    describe('register', () => {
        it('should allow registering custom presets', () => {
            const custom = new DebugConfigPresets();
            custom.register({
                name: 'Fastify',
                language: 'javascript',
                detection: [{ type: 'package-dep', value: 'fastify' }],
                launchCommand: 'node',
                launchArgs: ['--inspect-brk', '{entry}'],
                agentTips: ['Use request lifecycle hooks for debugging.'],
            });

            expect(custom.getAll().length).toBe(8);
            expect(custom.getByName('Fastify')).toBeDefined();
        });
    });

    describe('toMarkdown', () => {
        it('should generate markdown summary', () => {
            const md = presets.toMarkdown();
            expect(md).toContain('Debug Configuration Presets');
            expect(md).toContain('Express.js');
            expect(md).toContain('Flask');
        });
    });
});
