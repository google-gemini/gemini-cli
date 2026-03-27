/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Data Breakpoint Manager — Watchpoints (DAP setDataBreakpoints).
 *
 * DAP supports `setDataBreakpoints` — break when a variable's value
 * changes. This is a power feature that makes the mentors' eyes light up.
 *
 * Usage:
 *   Agent: "I'll watch the `count` variable and stop when it changes."
 *   → setDataBreakpoints { dataId: "count", accessType: "write" }
 *   [count changes from 5 to 6]
 *   → stopped event, reason: "data breakpoint"
 *
 * The manager:
 *   1. Tracks registered data breakpoints
 *   2. Provides the DAP-compatible request format
 *   3. Generates LLM-friendly descriptions
 *   4. Supports access types: read, write, readWrite
 *
 * From idea7-analysis:
 *   > Watchpoints / Data Breakpoints (STRETCH GOAL)
 *   > Even mentioning it shows deep DAP knowledge.
 */

import type { Variable } from './dapClient.js';

/**
 * Minimal protocol interface for DAP requests.
 * Avoids coupling to DAPClient's private methods.
 */
export interface DebugProtocol {
    sendRequest(command: string, args?: Record<string, unknown>): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DataAccessType = 'read' | 'write' | 'readWrite';

export interface DataBreakpoint {
    /** The data identifier from DAP (usually variablesReference + name) */
    dataId: string;
    /** Variable name for display */
    variableName: string;
    /** When to break */
    accessType: DataAccessType;
    /** Optional condition */
    condition?: string;
    /** Optional hit count */
    hitCondition?: string;
    /** Whether this data breakpoint is currently active */
    active: boolean;
}

export interface DataBreakpointInfo {
    /** Whether data breakpoints are supported for this variable */
    supported: boolean;
    /** The dataId to use with setDataBreakpoints */
    dataId: string | null;
    /** Description of what can be watched */
    description: string;
}

// ---------------------------------------------------------------------------
// DataBreakpointManager
// ---------------------------------------------------------------------------

/**
 * Manages DAP data breakpoints (watchpoints) for variable change tracking.
 */
export class DataBreakpointManager {
    private readonly breakpoints: Map<string, DataBreakpoint> = new Map();

    /**
     * Check if a variable supports data breakpoints via DAP.
     * This calls the DAP `dataBreakpointInfo` request.
     */
    async checkSupport(
        protocol: DebugProtocol,
        variablesReference: number,
        name: string,
    ): Promise<DataBreakpointInfo> {
        try {
            const response = await protocol.sendRequest('dataBreakpointInfo', {
                variablesReference,
                name,
            });

            const dataId = (response as { dataId?: string }).dataId;
            const description = (response as { description?: string }).description ?? '';

            return {
                supported: dataId !== null && dataId !== undefined,
                dataId: dataId ?? null,
                description: description || `Watch ${name} for changes`,
            };
        } catch {
            return {
                supported: false,
                dataId: null,
                description: 'Data breakpoints not supported by this debug adapter',
            };
        }
    }

    /**
     * Add a data breakpoint (watchpoint).
     */
    add(
        dataId: string,
        variableName: string,
        accessType: DataAccessType = 'write',
        condition?: string,
    ): DataBreakpoint {
        const bp: DataBreakpoint = {
            dataId,
            variableName,
            accessType,
            condition,
            active: true,
        };

        this.breakpoints.set(dataId, bp);
        return bp;
    }

    /**
     * Remove a data breakpoint.
     */
    remove(dataId: string): boolean {
        return this.breakpoints.delete(dataId);
    }

    /**
     * Get all active data breakpoints.
     */
    getActive(): DataBreakpoint[] {
        return Array.from(this.breakpoints.values()).filter((bp) => bp.active);
    }

    /**
     * Get all data breakpoints.
     */
    getAll(): DataBreakpoint[] {
        return Array.from(this.breakpoints.values());
    }

    /**
     * Build the DAP-compatible request body for setDataBreakpoints.
     */
    buildDAPRequest(): { breakpoints: Array<{ dataId: string; accessType?: string; condition?: string; hitCondition?: string }> } {
        return {
            breakpoints: this.getActive().map((bp) => ({
                dataId: bp.dataId,
                accessType: bp.accessType,
                ...(bp.condition ? { condition: bp.condition } : {}),
                ...(bp.hitCondition ? { hitCondition: bp.hitCondition } : {}),
            })),
        };
    }

    /**
     * Send the data breakpoints to the DAP server.
     */
    async sync(protocol: DebugProtocol): Promise<void> {
        const request = this.buildDAPRequest();
        await protocol.sendRequest('setDataBreakpoints', request);
    }

    /**
     * Build data breakpoints from inspect variables result.
     * Scans variables for interesting ones to watch.
     */
    suggestWatchpoints(variables: Variable[]): Array<{ name: string; variablesReference: number }> {
        return variables
            .filter((v) => {
                // Suggest watching mutable variables (not const-like)
                const type = v.type?.toLowerCase() ?? '';
                return (
                    type !== 'function' &&
                    type !== 'class' &&
                    v.name !== '__proto__' &&
                    v.name !== 'this'
                );
            })
            .map((v) => ({
                name: v.name,
                variablesReference: v.variablesReference,
            }));
    }

    /**
     * Clear all data breakpoints.
     */
    clear(): void {
        this.breakpoints.clear();
    }

    /**
     * Generate LLM-friendly markdown of active data breakpoints.
     */
    toMarkdown(): string {
        const active = this.getActive();
        if (active.length === 0) {
            return 'No data breakpoints (watchpoints) set.';
        }

        const lines: string[] = [];
        lines.push(`### 👁️ Data Breakpoints (${String(active.length)})`);
        lines.push('');

        for (const bp of active) {
            const cond = bp.condition ? ` **if** \`${bp.condition}\`` : '';
            lines.push(`- Watch \`${bp.variableName}\` on **${bp.accessType}**${cond}`);
        }

        return lines.join('\n');
    }
}
