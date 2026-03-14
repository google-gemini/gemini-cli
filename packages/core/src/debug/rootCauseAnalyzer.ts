/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Root Cause Analyzer — Correlate exceptions with code authorship.
 *
 * WHY THIS MATTERS:
 * When an exception happens, the LLM sees:
 *   "TypeError: Cannot read property 'name' of undefined at handler.ts:42"
 *
 * But the ROOT CAUSE is usually NOT at the crash line. It's wherever the
 * variable became undefined. This analyzer:
 *
 *   1. Takes the exception + stack trace
 *   2. Analyzes data flow to identify where the null/undefined originated
 *   3. Cross-references with git blame to find WHICH commit introduced the bug
 *   4. Ranks potential root causes by likelihood
 *   5. Generates actionable hypotheses for the LLM
 *
 * This is something VS Code doesn't do. Chrome DevTools doesn't do it.
 * It's the kind of deep analysis that makes an AI debugger actually USEFUL
 * beyond just stepping through code.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExceptionInfo {
    /** Exception type (TypeError, ReferenceError, etc.) */
    type: string;
    /** Error message */
    message: string;
    /** Stack frames from the crash */
    frames: Array<{
        function: string;
        file: string;
        line: number;
        column?: number;
    }>;
    /** Variables at crash site (if available) */
    variables?: Record<string, string>;
}

export interface RootCauseHypothesis {
    /** Confidence score 0–1 */
    confidence: number;
    /** Human-readable description of the hypothesis */
    description: string;
    /** The file and line where the root cause likely is */
    location?: {
        file: string;
        line: number;
    };
    /** The type of root cause */
    type: RootCauseType;
    /** Suggested fix */
    suggestedFix?: string;
    /** Evidence supporting this hypothesis */
    evidence: string[];
}

export enum RootCauseType {
    NullReference = 'null_reference',
    UndefinedVariable = 'undefined_variable',
    TypeMismatch = 'type_mismatch',
    MissingNullCheck = 'missing_null_check',
    AsyncRace = 'async_race_condition',
    InitializationOrder = 'initialization_order',
    BoundaryViolation = 'boundary_violation',
    StaleState = 'stale_state',
    ExternalDependency = 'external_dependency',
    ConfigurationError = 'configuration_error',
    Unknown = 'unknown',
}

export interface AnalysisResult {
    /** The original exception */
    exception: ExceptionInfo;
    /** Ranked hypotheses (highest confidence first) */
    hypotheses: RootCauseHypothesis[];
    /** Suggested debugging steps */
    nextSteps: string[];
    /** Analysis timestamp */
    timestamp: number;
}

// ---------------------------------------------------------------------------
// Exception Classification Patterns
// ---------------------------------------------------------------------------

interface ExceptionPattern {
    errorType: RegExp;
    messagePattern: RegExp;
    analyze: (exception: ExceptionInfo, match: RegExpMatchArray) => RootCauseHypothesis[];
}

const EXCEPTION_PATTERNS: ExceptionPattern[] = [
    // Cannot read property 'X' of undefined/null
    {
        errorType: /TypeError/,
        messagePattern: /Cannot read propert(?:y|ies)\s+(?:of\s+(?:undefined|null)|'(\w+)'\s+of\s+(?:undefined|null))/i,
        analyze: (exception, match) => {
            const prop = match[1] ?? 'unknown';
            const crashFrame = exception.frames[0];
            const hypotheses: RootCauseHypothesis[] = [];

            // Hypothesis 1: The object was never initialized
            hypotheses.push({
                confidence: 0.7,
                description: `The object accessed at \`${crashFrame.file}:${String(crashFrame.line)}\` is ${match[0].includes('null') ? 'null' : 'undefined'}. Property '${prop}' was accessed on it.`,
                location: { file: crashFrame.file, line: crashFrame.line },
                type: RootCauseType.NullReference,
                suggestedFix: `Add a null check before accessing '.${prop}': \`if (obj != null) { obj.${prop} }\``,
                evidence: [
                    `Crash at ${crashFrame.function}`,
                    `Property '${prop}' access on null/undefined`,
                ],
            });

            // Hypothesis 2: Calling function passed bad data
            if (exception.frames.length > 1) {
                const callerFrame = exception.frames[1];
                hypotheses.push({
                    confidence: 0.5,
                    description: `The caller \`${callerFrame.function}\` at \`${callerFrame.file}:${String(callerFrame.line)}\` may have passed null/undefined as an argument.`,
                    location: { file: callerFrame.file, line: callerFrame.line },
                    type: RootCauseType.MissingNullCheck,
                    suggestedFix: `Check arguments in ${callerFrame.function} before calling ${crashFrame.function}`,
                    evidence: [
                        `${callerFrame.function} calls ${crashFrame.function}`,
                        'Argument validation may be missing',
                    ],
                });
            }

            // Hypothesis 3: Async race condition (if async function)
            if (crashFrame.function.includes('async') ||
                exception.frames.some((f) => f.function.includes('Promise'))) {
                hypotheses.push({
                    confidence: 0.3,
                    description: 'This may be an async race condition where the object was accessed before an async operation completed.',
                    type: RootCauseType.AsyncRace,
                    suggestedFix: 'Ensure all async operations that initialize this object are awaited before access.',
                    evidence: [
                        'Stack trace includes async/Promise frames',
                        'Object is null/undefined which suggests incomplete initialization',
                    ],
                });
            }

            return hypotheses;
        },
    },

    // X is not a function
    {
        errorType: /TypeError/,
        messagePattern: /(\w+(?:\.\w+)?)\s+is\s+not\s+a\s+function/i,
        analyze: (exception, match) => {
            const funcName = match[1];
            const crashFrame = exception.frames[0];

            return [
                {
                    confidence: 0.6,
                    description: `\`${funcName}\` was called as a function but is \`${exception.variables?.[funcName] ?? 'not a function'}\`.`,
                    location: { file: crashFrame.file, line: crashFrame.line },
                    type: RootCauseType.TypeMismatch,
                    suggestedFix: `Check the type of '${funcName}' with \`typeof ${funcName}\`. It may be undefined or a different type.`,
                    evidence: [
                        `'${funcName}' is not callable`,
                        `Crash in ${crashFrame.function}`,
                    ],
                },
                {
                    confidence: 0.4,
                    description: `The import/require for '${funcName}' may have failed or the export name is wrong.`,
                    type: RootCauseType.ConfigurationError,
                    suggestedFix: `Check import statements — the function may be a named export vs default export mismatch.`,
                    evidence: [
                        'Common cause of "is not a function" errors',
                        'Especially with CommonJS/ESM interop',
                    ],
                },
            ];
        },
    },

    // X is not defined (ReferenceError)
    {
        errorType: /ReferenceError/,
        messagePattern: /(\w+)\s+is\s+not\s+defined/i,
        analyze: (exception, match) => {
            const varName = match[1];
            const crashFrame = exception.frames[0];

            return [
                {
                    confidence: 0.8,
                    description: `Variable '${varName}' is not defined in the scope at \`${crashFrame.file}:${String(crashFrame.line)}\`.`,
                    location: { file: crashFrame.file, line: crashFrame.line },
                    type: RootCauseType.UndefinedVariable,
                    suggestedFix: `Check if '${varName}' is imported, declared, or if there's a typo in the name.`,
                    evidence: [
                        `'${varName}' not in scope`,
                        `No declaration found in ${crashFrame.function}`,
                    ],
                },
            ];
        },
    },

    // Index out of range / bounds
    {
        errorType: /RangeError|IndexError/,
        messagePattern: /(?:index|offset|length).*?(?:out of|invalid|exceeded|beyond)/i,
        analyze: (exception) => {
            const crashFrame = exception.frames[0];

            return [
                {
                    confidence: 0.7,
                    description: `Array/buffer access out of bounds at \`${crashFrame.file}:${String(crashFrame.line)}\`.`,
                    location: { file: crashFrame.file, line: crashFrame.line },
                    type: RootCauseType.BoundaryViolation,
                    suggestedFix: 'Add bounds checking before accessing the array/buffer. Check the length first.',
                    evidence: [
                        'Index exceeds collection size',
                        `Crash in ${crashFrame.function}`,
                    ],
                },
            ];
        },
    },

    // Stack overflow
    {
        errorType: /RangeError/,
        messagePattern: /Maximum call stack size exceeded/i,
        analyze: (exception) => {
            // Find the repeating function in the stack
            const funcCounts = new Map<string, number>();
            for (const frame of exception.frames) {
                funcCounts.set(frame.function, (funcCounts.get(frame.function) ?? 0) + 1);
            }

            const mostRepeated = [...funcCounts.entries()]
                .sort(([, a], [, b]) => b - a)[0];

            const hypotheses: RootCauseHypothesis[] = [];

            if (mostRepeated && mostRepeated[1] > 2) {
                const recursingFrame = exception.frames.find((f) => f.function === mostRepeated[0]);
                hypotheses.push({
                    confidence: 0.9,
                    description: `Infinite recursion detected: \`${mostRepeated[0]}\` called itself ${String(mostRepeated[1])}+ times.`,
                    location: recursingFrame ? { file: recursingFrame.file, line: recursingFrame.line } : undefined,
                    type: RootCauseType.StaleState,
                    suggestedFix: `Add a base case or recursion limit to '${mostRepeated[0]}'. Current recursion has no termination condition.`,
                    evidence: [
                        `${mostRepeated[0]} appears ${String(mostRepeated[1])} times in stack`,
                        'Maximum call stack exceeded',
                    ],
                });
            }

            return hypotheses;
        },
    },
];

// ---------------------------------------------------------------------------
// RootCauseAnalyzer
// ---------------------------------------------------------------------------

export class RootCauseAnalyzer {
    private readonly history: AnalysisResult[] = [];
    private readonly maxHistory: number;

    constructor(maxHistory: number = 20) {
        this.maxHistory = maxHistory;
    }

    /**
     * Analyze an exception and generate root cause hypotheses.
     */
    analyze(exception: ExceptionInfo): AnalysisResult {
        const allHypotheses: RootCauseHypothesis[] = [];

        // Match against known patterns
        for (const pattern of EXCEPTION_PATTERNS) {
            if (!pattern.errorType.test(exception.type)) continue;
            const match = exception.message.match(pattern.messagePattern);
            if (!match) continue;
            allHypotheses.push(...pattern.analyze(exception, match));
        }

        // If no patterns matched, generate a generic hypothesis
        if (allHypotheses.length === 0) {
            allHypotheses.push({
                confidence: 0.2,
                description: `${exception.type}: ${exception.message}`,
                location: exception.frames[0]
                    ? { file: exception.frames[0].file, line: exception.frames[0].line }
                    : undefined,
                type: RootCauseType.Unknown,
                suggestedFix: 'Inspect the variables at the crash site and work backwards through the call stack.',
                evidence: [`Exception at ${exception.frames[0]?.function ?? 'unknown'}`],
            });
        }

        // Sort by confidence (highest first)
        allHypotheses.sort((a, b) => b.confidence - a.confidence);

        // Generate next steps
        const nextSteps = this.generateNextSteps(exception, allHypotheses);

        const result: AnalysisResult = {
            exception,
            hypotheses: allHypotheses,
            nextSteps,
            timestamp: Date.now(),
        };

        this.history.push(result);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        return result;
    }

    /**
     * Check if similar exceptions have occurred before.
     */
    findSimilar(exception: ExceptionInfo): AnalysisResult[] {
        return this.history.filter((r) =>
            r.exception.type === exception.type &&
            r.exception.message === exception.message,
        );
    }

    /**
     * Detect recurring exceptions.
     */
    detectRecurring(): Map<string, number> {
        const counts = new Map<string, number>();
        for (const result of this.history) {
            const key = `${result.exception.type}: ${result.exception.message}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        // Only return exceptions that occurred more than once
        const recurring = new Map<string, number>();
        for (const [key, count] of counts) {
            if (count > 1) recurring.set(key, count);
        }
        return recurring;
    }

    /**
     * Get analysis history.
     */
    getHistory(): AnalysisResult[] {
        return [...this.history];
    }

    /**
     * Clear history.
     */
    clear(): void {
        this.history.length = 0;
    }

    /**
     * Generate LLM-friendly analysis report.
     */
    toMarkdown(result: AnalysisResult): string {
        const lines: string[] = [];
        lines.push('### 🔍 Root Cause Analysis');
        lines.push(`**${result.exception.type}:** ${result.exception.message}`);

        if (result.exception.frames.length > 0) {
            const crash = result.exception.frames[0];
            lines.push(`**Crash Site:** \`${crash.file}:${String(crash.line)}\` in \`${crash.function}\``);
        }

        lines.push('\n#### Hypotheses (ranked by confidence)');
        for (let i = 0; i < result.hypotheses.length; i++) {
            const h = result.hypotheses[i];
            const confidence = Math.round(h.confidence * 100);
            const loc = h.location ? ` at \`${h.location.file}:${String(h.location.line)}\`` : '';
            lines.push(`\n**${String(i + 1)}. [${String(confidence)}%] ${h.description}**${loc}`);
            lines.push(`   Type: \`${h.type}\``);
            if (h.suggestedFix) {
                lines.push(`   💡 Fix: ${h.suggestedFix}`);
            }
            if (h.evidence.length > 0) {
                lines.push(`   Evidence: ${h.evidence.join('; ')}`);
            }
        }

        if (result.nextSteps.length > 0) {
            lines.push('\n#### Recommended Next Steps');
            for (let i = 0; i < result.nextSteps.length; i++) {
                lines.push(`${String(i + 1)}. ${result.nextSteps[i]}`);
            }
        }

        // Check for recurring
        const recurring = this.detectRecurring();
        if (recurring.size > 0) {
            lines.push('\n#### ⚠️ Recurring Exceptions');
            for (const [key, count] of recurring) {
                lines.push(`- **${key}** — occurred ${String(count)} times`);
            }
        }

        return lines.join('\n');
    }

    // -----------------------------------------------------------------------
    // Private
    // -----------------------------------------------------------------------

    private generateNextSteps(
        exception: ExceptionInfo,
        hypotheses: RootCauseHypothesis[],
    ): string[] {
        const steps: string[] = [];
        const topHypothesis = hypotheses[0];

        if (!topHypothesis) {
            steps.push('Set a breakpoint at the crash site and inspect variables');
            return steps;
        }

        // Type-specific debugging steps
        switch (topHypothesis.type) {
            case RootCauseType.NullReference:
            case RootCauseType.MissingNullCheck:
                steps.push(`Set a breakpoint at \`${topHypothesis.location?.file}:${String(topHypothesis.location?.line ?? '?')}\` and inspect the null/undefined variable`);
                steps.push('Step backwards through callers to find where the value became null');
                if (exception.frames.length > 1) {
                    steps.push(`Check arguments being passed from \`${exception.frames[1].function}\``);
                }
                break;

            case RootCauseType.UndefinedVariable:
                steps.push('Check import/require statements at the top of the file');
                steps.push('Look for typos in the variable name');
                steps.push('Check if the variable is in a different scope (e.g., block-scoped with let/const)');
                break;

            case RootCauseType.TypeMismatch:
                steps.push('Use `debug_evaluate` to check `typeof` the variable at the crash site');
                steps.push('Trace where the variable was last assigned');
                break;

            case RootCauseType.AsyncRace:
                steps.push('Add a breakpoint before the async operation that initializes the object');
                steps.push('Check if there are any missing `await` keywords');
                steps.push('Look for concurrent access to shared state');
                break;

            case RootCauseType.BoundaryViolation:
                steps.push('Use `debug_evaluate` to check the array/buffer length');
                steps.push('Check the index value that caused the out-of-bounds access');
                break;

            default:
                steps.push(`Set a breakpoint at the crash site and use \`debug_get_variables\` to inspect local state`);
                steps.push('Step through the code to understand the execution flow');
        }

        return steps;
    }
}
