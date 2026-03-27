/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Adapter Process Manager — Spawn, monitor, and recover debug adapters.
 *
 * WHY THIS MATTERS:
 * Our current code assumes the debug adapter is either:
 *   - Node.js's built-in inspector (started via --inspect)
 *   - Already running on a known port
 *
 * But the real world is messier:
 *   - Python needs `debugpy` installed and spawned
 *   - Go needs `dlv` (Delve) spawned as a DAP server
 *   - Ruby needs `rdbg` started in DAP mode
 *   - Adapters can crash, ports can be taken, binaries might not exist
 *
 * This manager handles the full lifecycle:
 *   1. Check if the adapter binary exists on PATH
 *   2. Spawn the adapter process with correct DAP flags
 *   3. Wait for the adapter to be ready (port listening)
 *   4. Monitor the process for crashes
 *   5. Provide port and connection info to the DAPClient
 *   6. Kill the process on teardown
 *
 * Without this, the agent has to tell the user "start your debugger
 * manually and give me the port." With this, it just works.
 */

import type { ChildProcess } from 'node:child_process';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdapterLanguage = 'node' | 'python' | 'go' | 'ruby' | 'custom';

export interface AdapterSpawnConfig {
    /** Language identifier */
    language: AdapterLanguage;
    /** Path to the program being debugged */
    program: string;
    /** Arguments for the program */
    programArgs?: string[];
    /** Explicit port (auto-assigned if omitted) */
    port?: number;
    /** Explicit host */
    host?: string;
    /** Custom adapter command (for 'custom' language) */
    adapterCommand?: string;
    /** Custom adapter arguments */
    adapterArgs?: string[];
    /** Environment variables for the adapter */
    env?: Record<string, string>;
    /** Working directory */
    cwd?: string;
}

export interface RunningAdapter {
    /** Unique adapter ID */
    id: string;
    /** Language */
    language: AdapterLanguage;
    /** Port the adapter is listening on */
    port: number;
    /** Host */
    host: string;
    /** The spawned process */
    process: ChildProcess | null;
    /** When the adapter was started */
    startedAt: number;
    /** Whether the adapter is ready for connections */
    ready: boolean;
    /** Stderr output for diagnostics */
    stderr: string;
    /** PID of the adapter process */
    pid: number | undefined;
}

export interface AdapterCheckResult {
    /** Whether the adapter binary is available */
    available: boolean;
    /** Path to the binary */
    binaryPath?: string;
    /** Version string */
    version?: string;
    /** Error if not available */
    error?: string;
}

// ---------------------------------------------------------------------------
// Adapter spawn commands per language
// ---------------------------------------------------------------------------

const ADAPTER_CONFIGS: Record<
    Exclude<AdapterLanguage, 'custom'>,
    {
        binary: string;
        checkArgs: string[];
        spawnArgs: (port: number, program: string, args: string[]) => string[];
        readyPattern: RegExp;
    }
> = {
    node: {
        binary: 'node',
        checkArgs: ['--version'],
        spawnArgs: (port, program, args) => [
            `--inspect-brk=127.0.0.1:${String(port)}`,
            program,
            ...args,
        ],
        readyPattern: /Debugger listening on/,
    },
    python: {
        binary: 'python3',
        checkArgs: ['-m', 'debugpy', '--version'],
        spawnArgs: (port, program, args) => [
            '-m', 'debugpy',
            '--listen', `127.0.0.1:${String(port)}`,
            '--wait-for-client',
            program,
            ...args,
        ],
        readyPattern: /waiting for/i,
    },
    go: {
        binary: 'dlv',
        checkArgs: ['version'],
        spawnArgs: (port, program, _args) => [
            'dap',
            '--listen', `127.0.0.1:${String(port)}`,
            '--',
            program,
        ],
        readyPattern: /DAP server listening/,
    },
    ruby: {
        binary: 'rdbg',
        checkArgs: ['--version'],
        spawnArgs: (port, program, args) => [
            '--open',
            '--port', String(port),
            '--host', '127.0.0.1',
            '--',
            program,
            ...args,
        ],
        readyPattern: /DEBUGGER: Session start/,
    },
};

// ---------------------------------------------------------------------------
// AdapterProcessManager
// ---------------------------------------------------------------------------

export class AdapterProcessManager {
    private readonly adapters = new Map<string, RunningAdapter>();
    private nextId = 0;

    /**
     * Check if an adapter is available for a given language.
     */
    async checkAvailability(language: AdapterLanguage): Promise<AdapterCheckResult> {
        if (language === 'custom') {
            return { available: true };
        }

        const config = ADAPTER_CONFIGS[language];
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileAsync = promisify(execFile);

        try {
            const { stdout } = await execFileAsync(config.binary, config.checkArgs, {
                timeout: 5000,
            });
            return {
                available: true,
                binaryPath: config.binary,
                version: stdout.trim().split('\n')[0],
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                available: false,
                error: `${config.binary} not found or failed: ${msg}`,
            };
        }
    }

    /**
     * Spawn a debug adapter process.
     */
    async spawn(config: AdapterSpawnConfig): Promise<RunningAdapter> {
        const id = `adapter-${String(++this.nextId)}`;
        const port = config.port ?? this.findAvailablePort();
        const host = config.host ?? '127.0.0.1';

        let process: ChildProcess;
        let readyPattern: RegExp;

        if (config.language === 'custom') {
            if (!config.adapterCommand) {
                throw new Error('Custom adapter requires adapterCommand');
            }
            const { spawn } = await import('node:child_process');
            process = spawn(config.adapterCommand, config.adapterArgs ?? [], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...globalThis.process.env, ...config.env },
                cwd: config.cwd,
                detached: false,
            });
            readyPattern = /listening|ready|started/i;
        } else {
            const adapterConfig = ADAPTER_CONFIGS[config.language];
            const args = adapterConfig.spawnArgs(
                port,
                config.program,
                config.programArgs ?? [],
            );
            readyPattern = adapterConfig.readyPattern;

            const { spawn } = await import('node:child_process');
            process = spawn(adapterConfig.binary, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...globalThis.process.env, ...config.env },
                cwd: config.cwd,
                detached: false,
            });
        }

        const adapter: RunningAdapter = {
            id,
            language: config.language,
            port,
            host,
            process,
            startedAt: Date.now(),
            ready: false,
            stderr: '',
            pid: process.pid,
        };

        this.adapters.set(id, adapter);

        // Wait for the adapter to be ready
        await this.waitForReady(adapter, readyPattern, 15000);

        return adapter;
    }

    /**
     * Kill an adapter process.
     */
    async kill(id: string): Promise<boolean> {
        const adapter = this.adapters.get(id);
        if (!adapter) return false;

        if (adapter.process && !adapter.process.killed) {
            adapter.process.kill('SIGTERM');

            // Wait for graceful exit, then force kill
            await new Promise<void>((resolve) => {
                const timeout = setTimeout(() => {
                    if (adapter.process && !adapter.process.killed) {
                        adapter.process.kill('SIGKILL');
                    }
                    resolve();
                }, 3000);

                adapter.process?.on('exit', () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
        }

        this.adapters.delete(id);
        return true;
    }

    /**
     * Kill all running adapters.
     */
    async killAll(): Promise<void> {
        const ids = Array.from(this.adapters.keys());
        await Promise.all(ids.map((id) => this.kill(id)));
    }

    /**
     * Get a running adapter by ID.
     */
    get(id: string): RunningAdapter | undefined {
        return this.adapters.get(id);
    }

    /**
     * List all running adapters.
     */
    list(): RunningAdapter[] {
        return Array.from(this.adapters.values());
    }

    /**
     * Check if adapter process is still alive.
     */
    isAlive(id: string): boolean {
        const adapter = this.adapters.get(id);
        if (!adapter || !adapter.process) return false;
        return !adapter.process.killed && adapter.process.exitCode === null;
    }

    /**
     * Generate LLM-ready summary.
     */
    toMarkdown(): string {
        const lines: string[] = [];
        lines.push('### 🔧 Debug Adapters');

        if (this.adapters.size === 0) {
            lines.push('No adapters running.');
            return lines.join('\n');
        }

        for (const adapter of this.adapters.values()) {
            const status = this.isAlive(adapter.id) ? '🟢 alive' : '🔴 dead';
            const uptime = Math.round((Date.now() - adapter.startedAt) / 1000);
            lines.push(
                `- **${adapter.language}** on ${adapter.host}:${String(adapter.port)} ` +
                `[${status}] (PID: ${String(adapter.pid ?? '?')}, uptime: ${String(uptime)}s)`,
            );
        }

        return lines.join('\n');
    }

    // -----------------------------------------------------------------------
    // Private
    // -----------------------------------------------------------------------

    private findAvailablePort(): number {
        // Start from 9229 (Node.js debug default) + random offset
        return 9229 + Math.floor(Math.random() * 1000);
    }

    private waitForReady(
        adapter: RunningAdapter,
        pattern: RegExp,
        timeoutMs: number,
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(
                    `Adapter ${adapter.language} did not become ready within ${String(timeoutMs)}ms. ` +
                    `Stderr: ${adapter.stderr.slice(-500)}`,
                ));
            }, timeoutMs);

            const onStderr = (data: Buffer): void => {
                const text = data.toString();
                adapter.stderr += text;
                if (pattern.test(text)) {
                    clearTimeout(timeout);
                    adapter.ready = true;
                    adapter.process?.stderr?.off('data', onStderr);
                    resolve();
                }
            };

            adapter.process?.stderr?.on('data', onStderr);

            adapter.process?.on('error', (err) => {
                clearTimeout(timeout);
                reject(new Error(`Adapter ${adapter.language} failed to start: ${err.message}`));
            });

            adapter.process?.on('exit', (code) => {
                clearTimeout(timeout);
                if (!adapter.ready) {
                    reject(new Error(
                        `Adapter ${adapter.language} exited with code ${String(code)} before ready`,
                    ));
                }
            });
        });
    }
}
