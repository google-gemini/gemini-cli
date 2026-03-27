/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Debug Workflow Orchestrator — The Autonomous Debugging Brain.
 *
 * This is the feature that makes Idea 7 truly "agentic" — it chains
 * all debug operations together into high-level workflows that the
 * Gemini agent can invoke with a single call.
 *
 * Instead of the agent manually calling:
 *   1. debug_launch → 2. debug_set_breakpoint → 3. debug_step →
 *   4. debug_get_stacktrace → 5. debug_get_variables → 6. analyze
 *
 * The orchestrator provides workflows like:
 *   - "Diagnose this crash" → full autonomous investigation
 *   - "Debug this function" → set breakpoints + step through + analyze
 *   - "Find why this variable is wrong" → targeted variable tracking
 *
 * This goes BEYOND the official spec — it transforms the debugging
 * companion from a tool collection into an AI debugging agent.
 */

import { DAPClient } from './dapClient.js';
import type { StackFrame, Scope, Variable, OutputEntry } from './dapClient.js';
import { StackTraceAnalyzer } from './stackTraceAnalyzer.js';
import type { DebugAnalysis } from './stackTraceAnalyzer.js';
import { FixSuggestionEngine } from './fixSuggestionEngine.js';
import type { FixSuggestionResult } from './fixSuggestionEngine.js';
import { DebugAdapterRegistry } from './debugAdapterRegistry.js';
import type { AdapterConfig } from './debugAdapterRegistry.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Result of a full debug investigation workflow.
 */
export interface DiagnosticReport {
    /** What workflow was executed */
    workflow: string;
    /** Whether the investigation succeeded */
    success: boolean;
    /** Human-readable error if something went wrong */
    error?: string;
    /** Stack trace analysis from the stop point */
    analysis?: DebugAnalysis;
    /** Fix suggestions from the intelligence layer */
    suggestions?: FixSuggestionResult;
    /** Adapter used for this debugging session */
    adapter?: AdapterConfig;
    /** Number of steps the orchestrator took */
    stepsExecuted: number;
    /** Full LLM-ready markdown report */
    markdown: string;
    /** Timing information */
    durationMs: number;
}

/**
 * Options for the diagnose workflow.
 */
export interface DiagnoseOptions {
    /** Program to debug */
    program: string;
    /** Arguments to pass to the program */
    args?: string[];
    /** Language override (auto-detected if not specified) */
    language?: string;
    /** Port for DAP connection */
    port?: number;
    /** Max time to wait for the program to crash (ms) */
    timeout?: number;
    /** Specific lines to set breakpoints on */
    breakpoints?: Array<{ file: string; line: number; condition?: string }>;
}

// ---------------------------------------------------------------------------
// DebugWorkflowOrchestrator
// ---------------------------------------------------------------------------

/**
 * Orchestrates complex debug workflows autonomously.
 *
 * This is the "brain" layer — it knows HOW to debug, not just how to
 * call individual debug operations. It chains operations together in
 * intelligent sequences based on the debugging goal.
 */
export class DebugWorkflowOrchestrator {
    private readonly analyzer: StackTraceAnalyzer;
    private readonly suggestionEngine: FixSuggestionEngine;
    private readonly adapterRegistry: DebugAdapterRegistry;

    constructor() {
        this.analyzer = new StackTraceAnalyzer();
        this.suggestionEngine = new FixSuggestionEngine();
        this.adapterRegistry = new DebugAdapterRegistry();
    }

    /**
     * Plan a debugging strategy based on the options provided.
     * Returns a structured plan the agent can present to the user.
     */
    planDiagnosis(options: DiagnoseOptions): string {
        const adapter = options.language
            ? this.adapterRegistry.getAdapter(options.language)
            : this.adapterRegistry.detectAdapter(options.program);

        const steps: string[] = [];
        const lang = adapter?.name ?? 'Unknown';

        steps.push(`## Debug Plan for \`${options.program}\``);
        steps.push('');
        steps.push(`**Language**: ${lang}`);
        steps.push(`**Strategy**: Exception-driven diagnosis`);
        steps.push('');
        steps.push('### Steps');
        steps.push(`1. Launch \`${options.program}\` with debugger attached`);
        steps.push('2. Set exception breakpoints (catch all thrown errors)');

        if (options.breakpoints && options.breakpoints.length > 0) {
            const bpList = options.breakpoints
                .map((bp) => `\`${bp.file}:${String(bp.line)}\``)
                .join(', ');
            steps.push(`3. Set ${String(options.breakpoints.length)} breakpoint(s): ${bpList}`);
            steps.push('4. Continue execution until exception or breakpoint hit');
        } else {
            steps.push('3. Continue execution until exception is thrown');
        }

        steps.push(
            `${String(options.breakpoints ? 5 : 4)}. Capture stack trace + variables + source context`,
        );
        steps.push(
            `${String(options.breakpoints ? 6 : 5)}. Run 11 pattern matchers for fix suggestions`,
        );
        steps.push(
            `${String(options.breakpoints ? 7 : 6)}. Generate diagnostic report with actionable fixes`,
        );

        return steps.join('\n');
    }

    /**
     * Analyze a stopped debug session (already connected).
     * This is the core analysis that runs when execution stops.
     */
    async analyzeStoppedState(
        client: DAPClient,
        stopReason: string,
        threadId: number = 1,
    ): Promise<DiagnosticReport> {
        const startTime = Date.now();
        let stepsExecuted = 0;

        try {
            // Step 1: Get stack trace
            const frames: StackFrame[] = await client.stackTrace(threadId, 0, 20);
            stepsExecuted++;

            // Step 2: Get scopes and variables for top frame
            let scopes: Scope[] = [];
            const variableMap = new Map<number, Variable[]>();

            if (frames.length > 0) {
                try {
                    scopes = await client.scopes(frames[0].id);
                    stepsExecuted++;

                    for (const scope of scopes) {
                        if (scope.name.toLowerCase() !== 'global') {
                            const vars = await client.variables(scope.variablesReference);
                            variableMap.set(scope.variablesReference, vars);
                            stepsExecuted++;
                        }
                    }
                } catch {
                    // Variables may not be available
                }
            }

            // Step 3: Get output log
            const outputLog: OutputEntry[] = client.getRecentOutput();
            stepsExecuted++;

            // Step 4: Run intelligence layer
            const analysis = this.analyzer.analyze(
                stopReason,
                frames,
                scopes,
                variableMap,
                outputLog,
            );
            stepsExecuted++;

            const suggestions = this.suggestionEngine.suggest(
                analysis,
                frames,
                scopes,
                variableMap,
                outputLog,
                stopReason,
            );
            stepsExecuted++;

            // Build report
            const durationMs = Date.now() - startTime;
            const markdown = this.buildReport(
                'analyze-stopped',
                analysis,
                suggestions,
                stepsExecuted,
                durationMs,
            );

            return {
                workflow: 'analyze-stopped',
                success: true,
                analysis,
                suggestions,
                stepsExecuted,
                markdown,
                durationMs,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return {
                workflow: 'analyze-stopped',
                success: false,
                error: msg,
                stepsExecuted,
                markdown: `## ❌ Analysis Failed\n\n**Error**: ${msg}`,
                durationMs: Date.now() - startTime,
            };
        }
    }

    /**
     * Generate a comprehensive diagnostic report in markdown.
     */
    buildReport(
        workflow: string,
        analysis: DebugAnalysis,
        suggestions: FixSuggestionResult,
        steps: number,
        durationMs: number,
    ): string {
        const sections: string[] = [];

        // Header
        sections.push(`## 🔍 Diagnostic Report`);
        sections.push(
            `*Workflow*: ${workflow} | *Steps*: ${String(steps)} | *Duration*: ${String(durationMs)}ms`,
        );
        sections.push('');

        // Include the full suggestion markdown (which includes analysis)
        sections.push(suggestions.markdown);

        // Action items
        if (suggestions.suggestions.length > 0) {
            sections.push('');
            sections.push('### 🎯 Recommended Actions');
            suggestions.suggestions.forEach((s, i) => {
                sections.push(`${String(i + 1)}. **${s.title}** — ${s.description.split('\n')[0]}`);
            });
        }

        // Next steps for the agent
        sections.push('');
        sections.push('### ⏭️ Next Steps');
        sections.push('- Use `debug_evaluate` to test potential fixes');
        sections.push('- Use `debug_step` to trace execution flow');
        sections.push('- Use `debug_get_variables` to expand complex objects');
        sections.push('- Use `debug_disconnect` when investigation is complete');

        return sections.join('\n');
    }

    /**
     * Get the adapter registry for external use.
     */
    getAdapterRegistry(): DebugAdapterRegistry {
        return this.adapterRegistry;
    }
}
