/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Debug Error Classifier — Production error taxonomy with recovery strategies.
 *
 * WHY THIS MATTERS:
 * When a debug operation fails, what does the LLM get? A raw error string:
 *   "Error: connect ECONNREFUSED 127.0.0.1:9229"
 *
 * The LLM has NO IDEA what that means or what to do about it. But with
 * proper error classification, we can tell the LLM:
 *   - Category: CONNECTION_REFUSED
 *   - Severity: RECOVERABLE
 *   - User message: "The debug adapter is not running on port 9229"
 *   - Recovery: "Start the program with --inspect flag or check if another
 *     debugger is already attached"
 *   - Auto-retry: false (retrying won't help)
 *
 * This transforms opaque errors into actionable intelligence that the LLM
 * can reason about and present to the user.
 *
 * Error categories:
 *   - CONNECTION: Network/TCP issues
 *   - PROTOCOL: DAP message format issues
 *   - ADAPTER: Debug adapter internal errors
 *   - TIMEOUT: Operations taking too long
 *   - STATE: Invalid operation for current session state
 *   - CAPABILITY: Adapter doesn't support the requested feature
 *   - RESOURCE: System resource issues (memory, file handles)
 *   - USER: User-caused errors (bad file path, invalid expression)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export enum ErrorCategory {
    Connection = 'connection',
    Protocol = 'protocol',
    Adapter = 'adapter',
    Timeout = 'timeout',
    State = 'state',
    Capability = 'capability',
    Resource = 'resource',
    User = 'user',
    Unknown = 'unknown',
}

export enum ErrorSeverity {
    /** Can be retried automatically */
    Transient = 'transient',
    /** Can be recovered with user intervention */
    Recoverable = 'recoverable',
    /** Session must be restarted */
    Fatal = 'fatal',
    /** Not an error, just informational */
    Info = 'info',
}

export interface ClassifiedError {
    /** Original error */
    original: Error | string;
    /** Error category */
    category: ErrorCategory;
    /** Severity level */
    severity: ErrorSeverity;
    /** User-friendly error message */
    userMessage: string;
    /** Recovery suggestion for the LLM */
    recovery: string;
    /** Whether auto-retry might help */
    retryable: boolean;
    /** Suggested retry delay in ms (if retryable) */
    retryDelayMs?: number;
    /** Maximum retry attempts (if retryable) */
    maxRetries?: number;
    /** Related documentation or error code */
    errorCode?: string;
}

// ---------------------------------------------------------------------------
// Error Patterns
// ---------------------------------------------------------------------------

interface ErrorPattern {
    /** Regex to match against the error message */
    pattern: RegExp;
    /** Classification result */
    classify: (match: RegExpMatchArray, raw: string) => Omit<ClassifiedError, 'original'>;
}

const ERROR_PATTERNS: ErrorPattern[] = [
    // === CONNECTION ERRORS ===
    {
        pattern: /ECONNREFUSED.*?(\d+\.\d+\.\d+\.\d+):(\d+)/i,
        classify: (_match, _raw) => ({
            category: ErrorCategory.Connection,
            severity: ErrorSeverity.Recoverable,
            userMessage: `Debug adapter is not running on port ${_match[2]}`,
            recovery: 'Start the program with a debug flag (e.g., --inspect for Node.js) or launch the debug adapter manually.',
            retryable: false,
            errorCode: 'ECONNREFUSED',
        }),
    },
    {
        pattern: /ECONNRESET/i,
        classify: () => ({
            category: ErrorCategory.Connection,
            severity: ErrorSeverity.Transient,
            userMessage: 'Connection to debug adapter was reset',
            recovery: 'The adapter may have crashed. Try disconnecting and relaunching the debug session.',
            retryable: true,
            retryDelayMs: 1000,
            maxRetries: 2,
            errorCode: 'ECONNRESET',
        }),
    },
    {
        pattern: /ETIMEDOUT/i,
        classify: () => ({
            category: ErrorCategory.Connection,
            severity: ErrorSeverity.Transient,
            userMessage: 'Connection to debug adapter timed out',
            recovery: 'The adapter may be overloaded or the network is slow. Try again.',
            retryable: true,
            retryDelayMs: 2000,
            maxRetries: 3,
            errorCode: 'ETIMEDOUT',
        }),
    },
    {
        pattern: /EADDRINUSE.*?:(\d+)/i,
        classify: (match) => ({
            category: ErrorCategory.Connection,
            severity: ErrorSeverity.Recoverable,
            userMessage: `Port ${match[1]} is already in use`,
            recovery: `Another process is using port ${match[1]}. Use a different port or kill the process using it.`,
            retryable: false,
            errorCode: 'EADDRINUSE',
        }),
    },
    {
        pattern: /not connected|Cannot send/i,
        classify: () => ({
            category: ErrorCategory.Connection,
            severity: ErrorSeverity.Fatal,
            userMessage: 'No connection to debug adapter',
            recovery: 'The debug session has been disconnected. Start a new session with debug_launch.',
            retryable: false,
            errorCode: 'NOT_CONNECTED',
        }),
    },

    // === TIMEOUT ERRORS ===
    {
        pattern: /timed?\s*out.*?(\d+)\s*ms/i,
        classify: (match) => ({
            category: ErrorCategory.Timeout,
            severity: ErrorSeverity.Transient,
            userMessage: `Operation timed out after ${match[1]}ms`,
            recovery: 'The debug adapter is taking too long to respond. The program may be stuck in an infinite loop or heavy computation.',
            retryable: true,
            retryDelayMs: 1000,
            maxRetries: 1,
            errorCode: 'TIMEOUT',
        }),
    },
    {
        pattern: /did not start in time/i,
        classify: () => ({
            category: ErrorCategory.Timeout,
            severity: ErrorSeverity.Recoverable,
            userMessage: 'Debug adapter failed to start within the timeout period',
            recovery: 'The program may have a startup error. Check if the program runs without the debugger first.',
            retryable: true,
            retryDelayMs: 2000,
            maxRetries: 2,
            errorCode: 'ADAPTER_START_TIMEOUT',
        }),
    },

    // === STATE ERRORS ===
    {
        pattern: /No active debug session/i,
        classify: () => ({
            category: ErrorCategory.State,
            severity: ErrorSeverity.Recoverable,
            userMessage: 'No active debug session',
            recovery: 'Use debug_launch to start a new debug session before using other debug commands.',
            retryable: false,
            errorCode: 'NO_SESSION',
        }),
    },
    {
        pattern: /Invalid state transition.*?(\w+)\s*→\s*(\w+)/i,
        classify: (match) => ({
            category: ErrorCategory.State,
            severity: ErrorSeverity.Info,
            userMessage: `Cannot perform this operation in current state (${match[1]})`,
            recovery: `Wait for the current operation to complete before trying again.`,
            retryable: false,
            errorCode: 'INVALID_STATE',
        }),
    },

    // === ADAPTER ERRORS ===
    {
        pattern: /exited with code (\d+)/i,
        classify: (match) => ({
            category: ErrorCategory.Adapter,
            severity: ErrorSeverity.Fatal,
            userMessage: `The program exited with code ${match[1]}`,
            recovery: 'The debugged program crashed or exited. Check for errors in the program, then start a new debug session.',
            retryable: false,
            errorCode: `EXIT_${match[1]}`,
        }),
    },
    {
        pattern: /adapter.*?crash|SIGKILL|SIGSEGV|SIGABRT/i,
        classify: () => ({
            category: ErrorCategory.Adapter,
            severity: ErrorSeverity.Fatal,
            userMessage: 'The debug adapter crashed',
            recovery: 'The debug adapter process was terminated unexpectedly. Start a new debug session.',
            retryable: false,
            errorCode: 'ADAPTER_CRASH',
        }),
    },

    // === CAPABILITY ERRORS ===
    {
        pattern: /not supported|unsupported/i,
        classify: () => ({
            category: ErrorCategory.Capability,
            severity: ErrorSeverity.Info,
            userMessage: 'This debug feature is not supported by the current adapter',
            recovery: 'The debug adapter does not support this operation. Try a different approach or use a different debugger.',
            retryable: false,
            errorCode: 'UNSUPPORTED',
        }),
    },
    {
        pattern: /setFunctionBreakpoints.*?not/i,
        classify: () => ({
            category: ErrorCategory.Capability,
            severity: ErrorSeverity.Info,
            userMessage: 'Function breakpoints are not supported by this adapter',
            recovery: 'Use file:line breakpoints instead of function breakpoints for this debugger.',
            retryable: false,
            errorCode: 'NO_FUNC_BP',
        }),
    },

    // === USER ERRORS ===
    {
        pattern: /Expression evaluation failed|Cannot evaluate/i,
        classify: () => ({
            category: ErrorCategory.User,
            severity: ErrorSeverity.Info,
            userMessage: 'The expression could not be evaluated',
            recovery: 'Check the expression syntax. The variable may be out of scope or not yet initialized.',
            retryable: false,
            errorCode: 'EVAL_FAILED',
        }),
    },
    {
        pattern: /breakpoint.*?not verified/i,
        classify: () => ({
            category: ErrorCategory.User,
            severity: ErrorSeverity.Info,
            userMessage: 'Breakpoint could not be set at the requested location',
            recovery: 'The line may not contain executable code. Try a nearby line that has actual code (not a comment, blank, or type declaration).',
            retryable: false,
            errorCode: 'BP_NOT_VERIFIED',
        }),
    },

    // === PROTOCOL ERRORS ===
    {
        pattern: /Unexpected (token|end of JSON|message)/i,
        classify: () => ({
            category: ErrorCategory.Protocol,
            severity: ErrorSeverity.Transient,
            userMessage: 'Communication error with debug adapter',
            recovery: 'The debug protocol message was malformed. This is usually a transient issue.',
            retryable: true,
            retryDelayMs: 500,
            maxRetries: 2,
            errorCode: 'PROTOCOL_ERROR',
        }),
    },

    // === RESOURCE ERRORS ===
    {
        pattern: /ENOMEM|out of memory/i,
        classify: () => ({
            category: ErrorCategory.Resource,
            severity: ErrorSeverity.Fatal,
            userMessage: 'System is out of memory',
            recovery: 'Close other applications to free memory, or reduce the debugged program\'s memory usage.',
            retryable: false,
            errorCode: 'OOM',
        }),
    },
    {
        pattern: /EMFILE|too many open files/i,
        classify: () => ({
            category: ErrorCategory.Resource,
            severity: ErrorSeverity.Recoverable,
            userMessage: 'Too many open file handles',
            recovery: 'The system has reached its file handle limit. Close other programs or increase the ulimit.',
            retryable: false,
            errorCode: 'EMFILE',
        }),
    },
];

// ---------------------------------------------------------------------------
// DebugErrorClassifier
// ---------------------------------------------------------------------------

export class DebugErrorClassifier {
    private readonly errorLog: ClassifiedError[] = [];
    private readonly maxLog: number;

    constructor(maxLog: number = 50) {
        this.maxLog = maxLog;
    }

    /**
     * Classify an error into a structured, actionable format.
     */
    classify(error: Error | string): ClassifiedError {
        const message = typeof error === 'string' ? error : error.message;

        // Try each pattern
        for (const pattern of ERROR_PATTERNS) {
            const match = message.match(pattern.pattern);
            if (match) {
                const classified: ClassifiedError = {
                    original: error,
                    ...pattern.classify(match, message),
                };

                this.logError(classified);
                return classified;
            }
        }

        // Fallback: unknown error
        const classified: ClassifiedError = {
            original: error,
            category: ErrorCategory.Unknown,
            severity: ErrorSeverity.Recoverable,
            userMessage: message,
            recovery: 'An unexpected error occurred. Try disconnecting and starting a new debug session.',
            retryable: false,
            errorCode: 'UNKNOWN',
        };

        this.logError(classified);
        return classified;
    }

    /**
     * Check if an operation should be retried based on the error.
     */
    shouldRetry(error: ClassifiedError, attemptNumber: number): boolean {
        if (!error.retryable) return false;
        if (error.maxRetries && attemptNumber >= error.maxRetries) return false;
        return true;
    }

    /**
     * Get the error history.
     */
    getErrorLog(): ClassifiedError[] {
        return [...this.errorLog];
    }

    /**
     * Get error frequency by category.
     */
    getErrorFrequency(): Record<ErrorCategory, number> {
        const freq: Record<string, number> = {};
        for (const cat of Object.values(ErrorCategory)) {
            freq[cat] = 0;
        }
        for (const err of this.errorLog) {
            freq[err.category]++;
        }
        return freq as Record<ErrorCategory, number>;
    }

    /**
     * Detect error patterns (e.g., repeated connection failures).
     */
    detectPatterns(): string[] {
        const patterns: string[] = [];
        const freq = this.getErrorFrequency();

        if (freq[ErrorCategory.Connection] >= 3) {
            patterns.push('⚠️ Repeated connection failures — The debug adapter may not be running or the port may be blocked.');
        }
        if (freq[ErrorCategory.Timeout] >= 3) {
            patterns.push('⚠️ Repeated timeouts — The debugged program may be stuck in an infinite loop.');
        }
        if (freq[ErrorCategory.Adapter] >= 2) {
            patterns.push('⚠️ Multiple adapter crashes — The debug adapter is unstable. Consider using a different version.');
        }
        if (freq[ErrorCategory.Resource] >= 1) {
            patterns.push('🔴 Resource errors detected — System resources are constrained.');
        }

        return patterns;
    }

    /**
     * Generate LLM-friendly error report.
     */
    toMarkdown(error?: ClassifiedError): string {
        if (error) {
            const lines = [
                `### Debug Error: ${error.errorCode ?? error.category}`,
                `**${error.userMessage}**`,
                '',
                `| Field | Value |`,
                `|-------|-------|`,
                `| Category | ${error.category} |`,
                `| Severity | ${error.severity} |`,
                `| Retryable | ${error.retryable ? 'yes' : 'no'} |`,
                '',
                `**Recovery:** ${error.recovery}`,
            ];
            return lines.join('\n');
        }

        // Full report
        const lines = ['### Debug Error Summary'];
        const freq = this.getErrorFrequency();
        const activeCategories = Object.entries(freq)
            .filter(([_, count]) => count > 0)
            .sort(([_, a], [__, b]) => b - a);

        if (activeCategories.length === 0) {
            lines.push('No errors recorded.');
            return lines.join('\n');
        }

        for (const [category, count] of activeCategories) {
            lines.push(`- **${category}:** ${String(count)} error(s)`);
        }

        const patterns = this.detectPatterns();
        if (patterns.length > 0) {
            lines.push('\n**Detected Patterns:**');
            lines.push(...patterns);
        }

        return lines.join('\n');
    }

    /**
     * Clear error log.
     */
    clear(): void {
        this.errorLog.length = 0;
    }

    // -----------------------------------------------------------------------
    // Private
    // -----------------------------------------------------------------------

    private logError(error: ClassifiedError): void {
        this.errorLog.push(error);
        if (this.errorLog.length > this.maxLog) {
            this.errorLog.shift();
        }
    }
}
