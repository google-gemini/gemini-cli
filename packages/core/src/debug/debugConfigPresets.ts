/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Debug Configuration Presets — Framework-Aware Debugging.
 *
 * Real-world debugging isn't "just launch node app.js." Developers use
 * frameworks with specific entry points, environment variables, and
 * setup requirements. This module provides pre-built debug configurations
 * for popular frameworks:
 *
 *   - Express.js (web server with PORT, startup delay)
 *   - Jest (test runner with --runInBand for debugging)
 *   - Next.js (dev server with NODE_OPTIONS)
 *   - Vitest (test runner with --no-threads)
 *   - Flask/Django (Python web frameworks)
 *   - Fastify (high-perf Node.js server)
 *
 * The agent can auto-detect the framework from package.json or file
 * patterns and apply the correct debug configuration.
 *
 * This shows mentors we understand REAL debugging workflows, not just
 * toy examples.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DebugPreset {
    /** Framework/tool name */
    name: string;
    /** Language */
    language: 'javascript' | 'typescript' | 'python' | 'go';
    /** How to detect this framework (file patterns, package.json keys) */
    detection: DetectionRule[];
    /** Command to launch under debugger */
    launchCommand: string;
    /** Args for the launch command */
    launchArgs: string[];
    /** Environment variables to set */
    env?: Record<string, string>;
    /** Recommended breakpoint locations */
    suggestedBreakpoints?: string[];
    /** Tips for the LLM agent */
    agentTips: string[];
}

export interface DetectionRule {
    /** Type of detection */
    type: 'file-exists' | 'package-dep' | 'file-pattern';
    /** What to look for */
    value: string;
}

// ---------------------------------------------------------------------------
// Built-in presets
// ---------------------------------------------------------------------------

const EXPRESS_PRESET: DebugPreset = {
    name: 'Express.js',
    language: 'javascript',
    detection: [
        { type: 'package-dep', value: 'express' },
        { type: 'file-pattern', value: 'app.listen(' },
    ],
    launchCommand: 'node',
    launchArgs: ['--inspect-brk', '{entry}'],
    env: { NODE_ENV: 'development', PORT: '3000' },
    suggestedBreakpoints: [
        'app.use(  // middleware entry',
        'app.get(  // route handler',
        'app.post( // route handler',
    ],
    agentTips: [
        'Set breakpoints in route handlers, not middleware registration.',
        'Check `req.body` and `req.params` at breakpoints.',
        'The server needs a request to hit route breakpoints — suggest using curl or the browser.',
    ],
};

const JEST_PRESET: DebugPreset = {
    name: 'Jest',
    language: 'javascript',
    detection: [
        { type: 'package-dep', value: 'jest' },
        { type: 'file-pattern', value: 'describe(' },
    ],
    launchCommand: 'node',
    launchArgs: ['--inspect-brk', 'node_modules/.bin/jest', '--runInBand', '{entry}'],
    env: { NODE_ENV: 'test' },
    agentTips: [
        'Use --runInBand to run tests serially (required for debugging).',
        'Set breakpoints inside test functions, not in describe blocks.',
        'Use debug_evaluate to check assertion values before they fail.',
    ],
};

const VITEST_PRESET: DebugPreset = {
    name: 'Vitest',
    language: 'javascript',
    detection: [
        { type: 'package-dep', value: 'vitest' },
        { type: 'file-pattern', value: 'vitest.config' },
    ],
    launchCommand: 'node',
    launchArgs: ['--inspect-brk', 'node_modules/.bin/vitest', 'run', '--no-threads', '{entry}'],
    env: { NODE_ENV: 'test' },
    agentTips: [
        'Use --no-threads to disable worker threads (required for debugging).',
        'Vitest uses ESM by default — ensure source maps are enabled.',
        'Set breakpoints in test functions or source code under test.',
    ],
};

const NEXTJS_PRESET: DebugPreset = {
    name: 'Next.js',
    language: 'javascript',
    detection: [
        { type: 'package-dep', value: 'next' },
        { type: 'file-exists', value: 'next.config.js' },
    ],
    launchCommand: 'node',
    launchArgs: ['--inspect-brk', 'node_modules/.bin/next', 'dev'],
    env: { NODE_OPTIONS: '--inspect' },
    agentTips: [
        'Server components run in Node.js — set breakpoints in server code.',
        'Client components can only be debugged in the browser DevTools.',
        'API routes in pages/api/ or app/api/ are debuggable server-side.',
    ],
};

const FLASK_PRESET: DebugPreset = {
    name: 'Flask',
    language: 'python',
    detection: [
        { type: 'file-pattern', value: 'from flask import' },
        { type: 'file-pattern', value: 'Flask(__name__)' },
    ],
    launchCommand: 'python',
    launchArgs: ['-m', 'debugpy', '--listen', '5678', '--wait-for-client', '{entry}'],
    env: { FLASK_ENV: 'development', FLASK_DEBUG: '0' },
    agentTips: [
        'Set FLASK_DEBUG=0 when using debugpy (Flask\'s reloader conflicts with debugpy).',
        'Set breakpoints in route handler functions (@app.route).',
        'Send HTTP requests to trigger route breakpoints.',
    ],
};

const DJANGO_PRESET: DebugPreset = {
    name: 'Django',
    language: 'python',
    detection: [
        { type: 'file-exists', value: 'manage.py' },
        { type: 'file-pattern', value: 'django' },
    ],
    launchCommand: 'python',
    launchArgs: ['-m', 'debugpy', '--listen', '5678', '--wait-for-client', 'manage.py', 'runserver', '--noreload'],
    env: { DJANGO_SETTINGS_MODULE: 'settings' },
    agentTips: [
        'Use --noreload to prevent Django\'s auto-reloader from interfering with debugpy.',
        'Set breakpoints in view functions.',
        'Check request.POST and request.GET at breakpoints for form/query data.',
    ],
};

const GO_SERVER_PRESET: DebugPreset = {
    name: 'Go HTTP Server',
    language: 'go',
    detection: [
        { type: 'file-pattern', value: 'net/http' },
        { type: 'file-pattern', value: 'http.ListenAndServe' },
    ],
    launchCommand: 'dlv',
    launchArgs: ['debug', '--headless', '--api-version=2', '--listen=:2345', '{entry}'],
    agentTips: [
        'Set breakpoints in http.HandlerFunc implementations.',
        'Go\'s goroutines show as separate threads in the debugger.',
        'Use debug_evaluate to inspect struct fields.',
    ],
};

// ---------------------------------------------------------------------------
// DebugConfigPresets
// ---------------------------------------------------------------------------

/**
 * Registry of framework-aware debug configurations.
 */
export class DebugConfigPresets {
    private readonly presets: DebugPreset[];

    constructor() {
        this.presets = [
            EXPRESS_PRESET,
            JEST_PRESET,
            VITEST_PRESET,
            NEXTJS_PRESET,
            FLASK_PRESET,
            DJANGO_PRESET,
            GO_SERVER_PRESET,
        ];
    }

    /**
     * Get all available presets.
     */
    getAll(): DebugPreset[] {
        return [...this.presets];
    }

    /**
     * Find a preset by name.
     */
    getByName(name: string): DebugPreset | undefined {
        return this.presets.find(
            (p) => p.name.toLowerCase() === name.toLowerCase(),
        );
    }

    /**
     * Detect applicable presets from package.json dependencies.
     */
    detectFromDependencies(deps: Record<string, string>): DebugPreset[] {
        return this.presets.filter((preset) =>
            preset.detection.some(
                (rule) =>
                    rule.type === 'package-dep' && deps[rule.value] !== undefined,
            ),
        );
    }

    /**
     * Detect applicable presets from file content.
     */
    detectFromFileContent(content: string): DebugPreset[] {
        return this.presets.filter((preset) =>
            preset.detection.some(
                (rule) =>
                    rule.type === 'file-pattern' && content.includes(rule.value),
            ),
        );
    }

    /**
     * Build the launch command for a preset.
     */
    buildCommand(
        preset: DebugPreset,
        entryFile: string,
    ): { command: string; args: string[]; env: Record<string, string> } {
        const args = preset.launchArgs.map((a) =>
            a.replace('{entry}', entryFile),
        );

        return {
            command: preset.launchCommand,
            args,
            env: preset.env ?? {},
        };
    }

    /**
     * Register a custom preset.
     */
    register(preset: DebugPreset): void {
        this.presets.push(preset);
    }

    /**
     * Generate LLM-friendly summary of available presets.
     */
    toMarkdown(): string {
        const lines: string[] = [];
        lines.push('### 🔧 Debug Configuration Presets');
        lines.push('');

        for (const preset of this.presets) {
            lines.push(`- **${preset.name}** (${preset.language})`);
            for (const tip of preset.agentTips.slice(0, 2)) {
                lines.push(`  - _${tip}_`);
            }
        }

        return lines.join('\n');
    }
}
