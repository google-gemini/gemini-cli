/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Error Knowledge Base — Structured Error → Fix Database.
 *
 * A curated database of common runtime errors across Node.js, Python,
 * and Go with their root causes, known fixes, and code examples.
 *
 * When the FixSuggestionEngine detects an error pattern, the Knowledge
 * Base provides DEEPER context:
 *   - Why this error happens
 *   - The most common root cause
 *   - A proven fix with code example
 *   - Related errors to also check
 *
 * This transforms the agent from "here's what's wrong" to
 * "here's EXACTLY what happened and how to fix it, with examples."
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KnowledgeEntry {
    /** Error identifier (matches FixSuggestionEngine patterns) */
    id: string;
    /** Human-readable error name */
    title: string;
    /** Language this applies to */
    language: 'javascript' | 'python' | 'go' | 'all';
    /** Common error messages that match this entry */
    errorPatterns: RegExp[];
    /** Why this error happens */
    explanation: string;
    /** Most common root cause */
    rootCause: string;
    /** Step-by-step fix instructions */
    fixSteps: string[];
    /** Code example of the fix */
    codeExample?: {
        before: string;
        after: string;
        language: string;
    };
    /** Related error IDs */
    relatedErrors: string[];
    /** External reference links */
    references?: string[];
}

// ---------------------------------------------------------------------------
// Built-in knowledge entries
// ---------------------------------------------------------------------------

const ENTRIES: KnowledgeEntry[] = [
    {
        id: 'null-property-access',
        title: 'Cannot Read Property of Null/Undefined',
        language: 'javascript',
        errorPatterns: [
            /Cannot read propert(?:y|ies) of (?:null|undefined)/,
            /TypeError:.*is not a function/,
        ],
        explanation:
            'A variable is null or undefined when you try to access a property or call a method on it.',
        rootCause:
            'The variable was never assigned, a function returned null/undefined instead of an object, or an async operation has not completed yet.',
        fixSteps: [
            'Check where the variable is assigned — is the assignment conditional?',
            'Add a null check before the property access.',
            'Use optional chaining (?.) for safe property access.',
            'Use nullish coalescing (??) to provide a default value.',
        ],
        codeExample: {
            before: 'const name = user.name; // crashes if user is null',
            after: 'const name = user?.name ?? "unknown";',
            language: 'javascript',
        },
        relatedErrors: ['undefined-variable', 'async-timing'],
    },
    {
        id: 'undefined-variable',
        title: 'Variable is Undefined',
        language: 'javascript',
        errorPatterns: [
            /ReferenceError:.*is not defined/,
            /Cannot access .* before initialization/,
        ],
        explanation:
            'A variable is referenced before it is declared or outside its scope.',
        rootCause:
            'The variable is declared with let/const and used before the declaration line (temporal dead zone), or it is in a different scope/module.',
        fixSteps: [
            'Check the variable declaration — is it above the usage?',
            'Check if the variable is imported from another module.',
            'Look for typos in the variable name.',
        ],
        codeExample: {
            before: 'console.log(x); // ReferenceError\nlet x = 5;',
            after: 'let x = 5;\nconsole.log(x); // 5',
            language: 'javascript',
        },
        relatedErrors: ['null-property-access'],
    },
    {
        id: 'async-timing',
        title: 'Missing Await on Async Operation',
        language: 'javascript',
        errorPatterns: [
            /await is only valid in async function/,
            /Promise.*pending/,
        ],
        explanation:
            'An async function result is used without await, so you get a Promise object instead of the resolved value.',
        rootCause:
            'The function is not marked as async, or the await keyword is missing before the async call.',
        fixSteps: [
            'Add the async keyword to the containing function.',
            'Add await before the async function call.',
            'If in a callback, switch to an async callback.',
        ],
        codeExample: {
            before: 'function getData() {\n  const result = fetchData(); // Promise, not data!\n  return result.value;\n}',
            after: 'async function getData() {\n  const result = await fetchData();\n  return result.value;\n}',
            language: 'javascript',
        },
        relatedErrors: ['null-property-access'],
    },
    {
        id: 'module-not-found',
        title: 'Module Not Found',
        language: 'javascript',
        errorPatterns: [
            /Cannot find module/,
            /Module not found/,
            /ERR_MODULE_NOT_FOUND/,
        ],
        explanation:
            'Node.js cannot resolve a module import — the package is not installed or the path is wrong.',
        rootCause:
            'The package is missing from node_modules (run npm install), the import path has a typo, or there is a CJS/ESM mismatch.',
        fixSteps: [
            'Run npm install to ensure dependencies are installed.',
            'Check the import path for typos.',
            'For ESM modules, ensure file extensions are included in imports.',
            'Check package.json for "type": "module" if using ESM.',
        ],
        relatedErrors: [],
    },
    {
        id: 'python-attribute-error',
        title: 'AttributeError',
        language: 'python',
        errorPatterns: [
            /AttributeError:.*has no attribute/,
            /NoneType.*has no attribute/,
        ],
        explanation:
            'An object does not have the attribute (property/method) you are trying to access.',
        rootCause:
            'The object is None (Python\'s null), is the wrong type, or the attribute name is misspelled.',
        fixSteps: [
            'Check if the object is None — add a None check.',
            'Verify the object type with type() or isinstance().',
            'Check for typos in the attribute name.',
        ],
        codeExample: {
            before: 'result = get_user()\nprint(result.name)  # AttributeError if None',
            after: 'result = get_user()\nif result is not None:\n    print(result.name)',
            language: 'python',
        },
        relatedErrors: ['python-type-error'],
    },
    {
        id: 'python-type-error',
        title: 'TypeError (Python)',
        language: 'python',
        errorPatterns: [
            /TypeError:.*argument/,
            /TypeError:.*not subscriptable/,
            /TypeError:.*not callable/,
        ],
        explanation:
            'An operation or function received an argument of the wrong type.',
        rootCause:
            'Passing None where a string/int is expected, calling a non-function, or indexing a non-sequence.',
        fixSteps: [
            'Check the types of all arguments with type().',
            'Add type hints to catch errors earlier.',
            'Validate inputs at function entry.',
        ],
        relatedErrors: ['python-attribute-error'],
    },
    {
        id: 'go-nil-pointer',
        title: 'Runtime Error: Nil Pointer Dereference',
        language: 'go',
        errorPatterns: [
            /runtime error: invalid memory address or nil pointer dereference/,
        ],
        explanation:
            'A nil pointer is dereferenced — you called a method or accessed a field on a nil pointer.',
        rootCause:
            'A function returned nil (error case) and the caller did not check for nil before using the result.',
        fixSteps: [
            'Check every function return value for nil before use.',
            'Follow Go error handling patterns: if err != nil { return err }.',
            'Initialize structs before use: obj := &MyStruct{}.',
        ],
        codeExample: {
            before: 'user, _ := getUser(id)\nfmt.Println(user.Name) // panic if user is nil',
            after: 'user, err := getUser(id)\nif err != nil {\n    return err\n}\nfmt.Println(user.Name)',
            language: 'go',
        },
        relatedErrors: [],
    },
    {
        id: 'connection-refused',
        title: 'Connection Refused (ECONNREFUSED)',
        language: 'all',
        errorPatterns: [
            /ECONNREFUSED/,
            /Connection refused/,
            /connect ECONNREFUSED/,
        ],
        explanation:
            'The program tried to connect to a server that is not running or not accepting connections.',
        rootCause:
            'The target service/database is not started, is on a different port, or a firewall is blocking the connection.',
        fixSteps: [
            'Verify the target service is running.',
            'Check the hostname and port are correct.',
            'Check for firewall or network restrictions.',
            'If in Docker, check container networking.',
        ],
        relatedErrors: ['connection-timeout'],
    },
];

// ---------------------------------------------------------------------------
// ErrorKnowledgeBase
// ---------------------------------------------------------------------------

/**
 * Searchable database of common runtime errors and their fixes.
 */
export class ErrorKnowledgeBase {
    private readonly entries: KnowledgeEntry[];

    constructor() {
        this.entries = [...ENTRIES];
    }

    /**
     * Look up knowledge entries matching an error message.
     */
    lookup(errorMessage: string): KnowledgeEntry[] {
        return this.entries.filter((entry) =>
            entry.errorPatterns.some((pattern) => pattern.test(errorMessage)),
        );
    }

    /**
     * Get a knowledge entry by ID.
     */
    getById(id: string): KnowledgeEntry | undefined {
        return this.entries.find((e) => e.id === id);
    }

    /**
     * Get all entries for a specific language.
     */
    getByLanguage(language: string): KnowledgeEntry[] {
        return this.entries.filter(
            (e) => e.language === language || e.language === 'all',
        );
    }

    /**
     * Get all entries.
     */
    getAll(): KnowledgeEntry[] {
        return [...this.entries];
    }

    /**
     * Add a custom knowledge entry.
     */
    add(entry: KnowledgeEntry): void {
        this.entries.push(entry);
    }

    /**
     * Generate LLM-friendly markdown for matched entries.
     */
    toMarkdown(entries: KnowledgeEntry[]): string {
        if (entries.length === 0) return '';

        const sections: string[] = [];
        sections.push('### 📚 Error Knowledge Base');
        sections.push('');

        for (const entry of entries) {
            sections.push(`#### ${entry.title}`);
            sections.push('');
            sections.push(`**Why**: ${entry.explanation}`);
            sections.push(`**Root cause**: ${entry.rootCause}`);
            sections.push('');
            sections.push('**Fix steps:**');
            entry.fixSteps.forEach((step, i) => {
                sections.push(`${String(i + 1)}. ${step}`);
            });

            if (entry.codeExample) {
                sections.push('');
                sections.push('**Before:**');
                sections.push(`\`\`\`${entry.codeExample.language}\n${entry.codeExample.before}\n\`\`\``);
                sections.push('**After:**');
                sections.push(`\`\`\`${entry.codeExample.language}\n${entry.codeExample.after}\n\`\`\``);
            }

            sections.push('');
        }

        return sections.join('\n');
    }
}
