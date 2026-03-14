/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolDefinition } from './types.js';
import {
    DEBUG_LAUNCH_TOOL_NAME,
    DEBUG_SET_BREAKPOINT_TOOL_NAME,
    DEBUG_GET_STACKTRACE_TOOL_NAME,
    DEBUG_GET_VARIABLES_TOOL_NAME,
    DEBUG_STEP_TOOL_NAME,
    DEBUG_EVALUATE_TOOL_NAME,
    DEBUG_DISCONNECT_TOOL_NAME,
    DEBUG_ATTACH_TOOL_NAME,
    DEBUG_SET_FUNCTION_BREAKPOINT_TOOL_NAME,
} from '../tool-names.js';

export const DEBUG_LAUNCH_DEFINITION: ToolDefinition = {
    base: {
        name: DEBUG_LAUNCH_TOOL_NAME,
        description:
            'Launch a program under a debugger. Starts a debug session, sets any initial breakpoints, and pauses the program at the first breakpoint or entry point. Supports Node.js programs.',
        parametersJsonSchema: {
            type: 'object',
            properties: {
                program: {
                    type: 'string',
                    description:
                        'Path to the program to debug (e.g. "./src/index.ts", "app.js").',
                },
                args: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Command-line arguments to pass to the program.',
                },
                breakpoints: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            file: {
                                type: 'string',
                                description: 'Path to the source file.',
                            },
                            line: {
                                type: 'number',
                                description: 'Line number for the breakpoint.',
                            },
                            condition: {
                                type: 'string',
                                description:
                                    'Optional condition expression. Breakpoint only hits when this evaluates to true.',
                            },
                        },
                        required: ['file', 'line'],
                    },
                    description:
                        'Optional breakpoints to set before the program starts.',
                },
                stopOnEntry: {
                    type: 'boolean',
                    description:
                        'If true, pause the program at the first line. Defaults to true.',
                },
            },
            required: ['program'],
        },
    },
};

export const DEBUG_SET_BREAKPOINT_DEFINITION: ToolDefinition = {
    base: {
        name: DEBUG_SET_BREAKPOINT_TOOL_NAME,
        description:
            'Set breakpoints in a source file during an active debug session. Replaces all existing breakpoints in the file.',
        parametersJsonSchema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    description: 'Path to the source file.',
                },
                breakpoints: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            line: {
                                type: 'number',
                                description: 'Line number for the breakpoint.',
                            },
                            condition: {
                                type: 'string',
                                description:
                                    'Optional condition expression.',
                            },
                            logMessage: {
                                type: 'string',
                                description:
                                    'Optional log message. Use {expression} for interpolated values.',
                            },
                        },
                        required: ['line'],
                    },
                    description: 'Breakpoints to set.',
                },
            },
            required: ['file', 'breakpoints'],
        },
    },
};

export const DEBUG_GET_STACKTRACE_DEFINITION: ToolDefinition = {
    base: {
        name: DEBUG_GET_STACKTRACE_TOOL_NAME,
        description:
            'Get the current call stack from an active debug session. Returns stack frames with function names, file paths, and line numbers.',
        parametersJsonSchema: {
            type: 'object',
            properties: {
                threadId: {
                    type: 'number',
                    description:
                        'Thread ID to get stack trace for. Defaults to 1 (main thread).',
                },
                maxFrames: {
                    type: 'number',
                    description:
                        'Maximum number of frames to return. Defaults to 20.',
                },
            },
        },
    },
};

export const DEBUG_GET_VARIABLES_DEFINITION: ToolDefinition = {
    base: {
        name: DEBUG_GET_VARIABLES_TOOL_NAME,
        description:
            'Get variable values from the current scope in an active debug session. Returns local variables, closures, and global references.',
        parametersJsonSchema: {
            type: 'object',
            properties: {
                frameIndex: {
                    type: 'number',
                    description:
                        'Stack frame index to inspect (0 = top/current frame). Defaults to 0.',
                },
                threadId: {
                    type: 'number',
                    description: 'Thread ID. Defaults to 1.',
                },
                variablesReference: {
                    type: 'number',
                    description:
                        'Reference ID to expand a specific variable (for nested objects/arrays). If omitted, returns top-level scope variables.',
                },
            },
        },
    },
};

export const DEBUG_STEP_DEFINITION: ToolDefinition = {
    base: {
        name: DEBUG_STEP_TOOL_NAME,
        description:
            'Control execution in an active debug session. Step through code, continue running, or pause execution.',
        parametersJsonSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['continue', 'next', 'stepIn', 'stepOut'],
                    description:
                        'The stepping action: "continue" resumes execution until next breakpoint, "next" steps over the current line, "stepIn" steps into function calls, "stepOut" steps out of the current function.',
                },
                threadId: {
                    type: 'number',
                    description: 'Thread ID. Defaults to 1.',
                },
            },
            required: ['action'],
        },
    },
};

export const DEBUG_EVALUATE_DEFINITION: ToolDefinition = {
    base: {
        name: DEBUG_EVALUATE_TOOL_NAME,
        description:
            'Evaluate an expression in the context of the current debug session. Can read variables, call functions, or modify state.',
        parametersJsonSchema: {
            type: 'object',
            properties: {
                expression: {
                    type: 'string',
                    description: 'The expression to evaluate.',
                },
                frameIndex: {
                    type: 'number',
                    description:
                        'Stack frame index for evaluation context. Defaults to 0 (current frame).',
                },
                threadId: {
                    type: 'number',
                    description: 'Thread ID. Defaults to 1.',
                },
            },
            required: ['expression'],
        },
    },
};

export const DEBUG_DISCONNECT_DEFINITION: ToolDefinition = {
    base: {
        name: DEBUG_DISCONNECT_TOOL_NAME,
        description:
            'Disconnect from the current debug session, terminating the debuggee process.',
        parametersJsonSchema: {
            type: 'object',
            properties: {
                terminateDebuggee: {
                    type: 'boolean',
                    description:
                        'If true, also terminate the process being debugged. Defaults to true.',
                },
            },
        },
    },
};

export const DEBUG_ATTACH_DEFINITION: ToolDefinition = {
    base: {
        name: DEBUG_ATTACH_TOOL_NAME,
        description:
            'Attach to an already running process for debugging. Use this when a program is already running with a debug port open (e.g. started with --inspect or --inspect-brk).',
        parametersJsonSchema: {
            type: 'object',
            properties: {
                port: {
                    type: 'number',
                    description:
                        'The debug port to attach to. For Node.js this is typically 9229.',
                },
                host: {
                    type: 'string',
                    description:
                        'Hostname to connect to. Defaults to "127.0.0.1".',
                },
                breakpoints: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            file: {
                                type: 'string',
                                description: 'Path to the source file.',
                            },
                            line: {
                                type: 'number',
                                description: 'Line number for the breakpoint.',
                            },
                            condition: {
                                type: 'string',
                                description: 'Optional condition expression.',
                            },
                        },
                        required: ['file', 'line'],
                    },
                    description:
                        'Optional breakpoints to set after attaching.',
                },
            },
            required: ['port'],
        },
    },
};

export const DEBUG_SET_FUNCTION_BREAKPOINT_DEFINITION: ToolDefinition = {
    base: {
        name: DEBUG_SET_FUNCTION_BREAKPOINT_TOOL_NAME,
        description:
            'Set breakpoints at function entry points by name. The debugger will pause when the named function is called. This is useful when you know the function name but not the exact file/line. Replaces all existing function breakpoints.',
        parametersJsonSchema: {
            type: 'object',
            properties: {
                breakpoints: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: {
                                type: 'string',
                                description:
                                    'The function name to break on (e.g. "handleRequest", "Array.prototype.push").',
                            },
                            condition: {
                                type: 'string',
                                description:
                                    'Optional condition expression. Breakpoint only hits when this evaluates to true.',
                            },
                            hitCondition: {
                                type: 'string',
                                description:
                                    'Optional hit count condition (e.g. "> 5", "% 2"). Breakpoint hits when the condition is met.',
                            },
                        },
                        required: ['name'],
                    },
                    description: 'Function breakpoints to set.',
                },
            },
            required: ['breakpoints'],
        },
    },
};

