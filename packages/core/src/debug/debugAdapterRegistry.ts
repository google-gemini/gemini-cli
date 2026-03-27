/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Multi-language Debug Adapter Registry.
 *
 * DAP is protocol-agnostic — the same client works with any debug adapter.
 * This registry knows how to spawn debug adapters for different languages,
 * matching the official GSoC Idea 7 requirement:
 *   "Node.js, Python, Go, etc."
 *
 * Currently supported:
 *   - Node.js (built-in `--inspect-brk`)
 *   - Python (debugpy)
 *   - Go (Delve)
 *
 * The registry auto-detects the language from file extension and returns
 * the correct debug adapter configuration.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdapterConfig {
    /** Human-readable name */
    name: string;
    /** Language identifier */
    language: string;
    /** Command to run the debuggee */
    command: string;
    /** Args template — `{port}` and `{program}` are replaced at launch */
    args: string[];
    /** Default DAP port */
    defaultPort: number;
    /** File extensions this adapter handles */
    extensions: string[];
    /** Whether the adapter uses the DAP protocol over TCP */
    protocol: 'tcp' | 'stdio';
    /** Additional launch configuration */
    launchConfig?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Built-in adapters
// ---------------------------------------------------------------------------

const NODE_ADAPTER: AdapterConfig = {
    name: 'Node.js Inspector',
    language: 'javascript',
    command: 'node',
    args: ['--inspect-brk=0.0.0.0:{port}', '{program}'],
    defaultPort: 9229,
    extensions: ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'],
    protocol: 'tcp',
    launchConfig: {
        type: 'node',
        request: 'launch',
        console: 'integratedTerminal',
    },
};

const PYTHON_ADAPTER: AdapterConfig = {
    name: 'debugpy (Python)',
    language: 'python',
    command: 'python',
    args: ['-m', 'debugpy', '--listen', '0.0.0.0:{port}', '--wait-for-client', '{program}'],
    defaultPort: 5678,
    extensions: ['.py'],
    protocol: 'tcp',
    launchConfig: {
        type: 'python',
        request: 'launch',
    },
};

const GO_ADAPTER: AdapterConfig = {
    name: 'Delve (Go)',
    language: 'go',
    command: 'dlv',
    args: ['debug', '--headless', '--api-version=2', '--listen=:{port}', '{program}'],
    defaultPort: 2345,
    extensions: ['.go'],
    protocol: 'tcp',
    launchConfig: {
        type: 'go',
        request: 'launch',
        mode: 'debug',
    },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Registry of debug adapters for different languages.
 * Supports auto-detection from file extension and manual language selection.
 */
export class DebugAdapterRegistry {
    private readonly adapters: Map<string, AdapterConfig>;

    constructor() {
        this.adapters = new Map([
            ['javascript', NODE_ADAPTER],
            ['typescript', NODE_ADAPTER],
            ['python', PYTHON_ADAPTER],
            ['go', GO_ADAPTER],
        ]);
    }

    /**
     * Get adapter config by language identifier.
     */
    getAdapter(language: string): AdapterConfig | undefined {
        return this.adapters.get(language.toLowerCase());
    }

    /**
     * Auto-detect the debug adapter from a file path's extension.
     */
    detectAdapter(filePath: string): AdapterConfig | undefined {
        const ext = filePath.slice(filePath.lastIndexOf('.'));
        for (const adapter of this.adapters.values()) {
            if (adapter.extensions.includes(ext)) {
                return adapter;
            }
        }
        return undefined;
    }

    /**
     * Build the complete command and args for launching a debug session.
     */
    buildLaunchCommand(
        adapter: AdapterConfig,
        program: string,
        port?: number,
        additionalArgs?: string[],
    ): { command: string; args: string[] } {
        const resolvedPort = port ?? adapter.defaultPort;
        const args = adapter.args.map((a) =>
            a.replace('{port}', String(resolvedPort)).replace('{program}', program),
        );

        if (additionalArgs) {
            args.push(...additionalArgs);
        }

        return { command: adapter.command, args };
    }

    /**
     * Get all registered language identifiers.
     */
    getLanguages(): string[] {
        return Array.from(this.adapters.keys());
    }

    /**
     * Register a custom adapter.
     */
    registerAdapter(language: string, config: AdapterConfig): void {
        this.adapters.set(language.toLowerCase(), config);
    }

    /**
     * Get a summary of supported languages for LLM context.
     */
    getSupportedLanguagesSummary(): string {
        const unique = new Map<string, AdapterConfig>();
        for (const [, config] of this.adapters) {
            unique.set(config.name, config);
        }

        return Array.from(unique.values())
            .map((c) => `- **${c.name}**: ${c.extensions.join(', ')} (port ${String(c.defaultPort)})`)
            .join('\n');
    }
}
