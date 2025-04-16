import fs from 'fs';
import path from 'path';
import * as Diff from 'diff';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { ToolResult } from './ToolResult.js';
import { BaseTool } from './BaseTool.js';
import { ToolCallConfirmationDetails, ToolConfirmationOutcome, ToolEditConfirmationDetails } from '../ui/types.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { ReadFileTool } from './read-file.tool.js';
import { WriteFileTool } from './write-file.tool.js';

/**
 * Parameters for the Edit tool
 */
export interface EditToolParams {
    /**
     * The absolute path to the file to modify
     */
    file_path: string;

    /**
     * The text to replace
     */
    old_string: string;

    /**
     * The text to replace it with
     */
    new_string: string;

    /**
     * The expected number of replacements to perform (optional, defaults to 1)
     */
    expected_replacements?: number;
}

/**
 * Result from the Edit tool
 */
export interface EditToolResult extends ToolResult {
}

interface CalculatedEdit {
    currentContent: string | null;
    newContent: string;
    occurrences: number;
    error?: { display: string, raw: string };
    isNewFile: boolean;
}

/**
 * Implementation of the Edit tool that modifies files.
 * This tool maintains state for the "Always Edit" confirmation preference.
 */
export class EditTool extends BaseTool<EditToolParams, EditToolResult> {
    private shouldAlwaysEdit = false;
    private readonly rootDirectory: string;

    /**
     * Creates a new instance of the EditTool
     * @param rootDirectory Root directory to ground this tool in.
     */
    constructor(rootDirectory: string) {
        super(
            'replace',
            'Edit',
            `Replaces a SINGLE, UNIQUE occurrence of text within a file. Requires providing significant context around the change to ensure uniqueness. For moving/renaming files, use the Bash tool with \`mv\`. For replacing entire file contents or creating new files use the ${WriteFileTool.Name} tool. Always use the ${ReadFileTool.Name} tool to examine the file before using this tool.`,
            {
                properties: {
                    file_path: {
                        description: 'The absolute path to the file to modify. Must start with /. When creating a new file, ensure the parent directory exists (use the `LS` tool to verify).',
                        type: 'string'
                    },
                    old_string: {
                        description: 'The exact text to replace. CRITICAL: Must uniquely identify the single instance to change. Include at least 3-5 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string matches multiple locations or does not match exactly, the tool will fail. Use an empty string ("") when creating a new file.',
                        type: 'string'
                    },
                    new_string: {
                        description: 'The text to replace the `old_string` with. When creating a new file (using an empty `old_string`), this should contain the full desired content of the new file. Ensure the resulting code is correct and idiomatic.',
                        type: 'string'
                    }
                },
                required: ['file_path', 'old_string', 'new_string'],
                type: 'object'
            }
        );
        this.rootDirectory = path.resolve(rootDirectory);
    }

    /**
     * Checks if a path is within the root directory.
     * @param pathToCheck The absolute path to check.
     * @returns True if the path is within the root directory, false otherwise.
     */
    private isWithinRoot(pathToCheck: string): boolean {
        const normalizedPath = path.normalize(pathToCheck);
        const normalizedRoot = this.rootDirectory;

        const rootWithSep = normalizedRoot.endsWith(path.sep)
          ? normalizedRoot
          : normalizedRoot + path.sep;

        return normalizedPath === normalizedRoot || normalizedPath.startsWith(rootWithSep);
    }

    /**
     * Validates the parameters for the Edit tool
     * @param params Parameters to validate
     * @returns True if parameters are valid, false otherwise
     */
    validateParams(params: EditToolParams): boolean {
        if (this.schema.parameters && !SchemaValidator.validate(this.schema.parameters as Record<string, unknown>, params)) {
            return false;
        }

        // Ensure path is absolute
        if (!path.isAbsolute(params.file_path)) {
            console.error(`File path must be absolute: ${params.file_path}`);
            return false;
        }

        // Ensure path is within the root directory
        if (!this.isWithinRoot(params.file_path)) {
            console.error(`File path must be within the root directory (${this.rootDirectory}): ${params.file_path}`);
            return false;
        }


        // Validate expected_replacements if provided
        if (params.expected_replacements !== undefined && params.expected_replacements < 0) {
            console.error('Expected replacements must be a non-negative number');
            return false;
        }

        return true;
    }

    /**
     * Calculates the potential outcome of an edit operation.
     * @param params Parameters for the edit operation
     * @returns An object describing the potential edit outcome
     * @throws File system errors if reading the file fails unexpectedly (e.g., permissions)
     */
    private calculateEdit(params: EditToolParams): CalculatedEdit {
        const expectedReplacements = params.expected_replacements === undefined ? 1 : params.expected_replacements;
        let currentContent: string | null = null;
        let fileExists = false;
        let isNewFile = false;
        let newContent = '';
        let occurrences = 0;
        let error: { display: string, raw: string } | undefined = undefined;

        try {
            currentContent = fs.readFileSync(params.file_path, 'utf8');
            fileExists = true;
        } catch (err: any) {
            if (err.code !== 'ENOENT') {
                throw err;
            }
            fileExists = false;
        }

        if (params.old_string === '' && !fileExists) {
            isNewFile = true;
            newContent = params.new_string;
            occurrences = 0;
        } else if (!fileExists) {
            error = {
                display: `File not found.`,
                raw: `File not found: ${params.file_path}`
            };
        } else if (currentContent !== null) {
            occurrences = this.countOccurrences(currentContent, params.old_string);

            if (occurrences === 0) {
                error = {
                    display: `No edits made`,
                    raw: `Failed to edit, 0 occurrences found`
                }
            } else if (occurrences !== expectedReplacements) {
                error = {
                    display: `Failed to edit, expected ${expectedReplacements} occurrences but found ${occurrences}`,
                    raw: `Failed to edit, Expected ${expectedReplacements} occurrences but found ${occurrences} in file: ${params.file_path}`
                }
            } else {
                newContent = this.replaceAll(currentContent, params.old_string, params.new_string);
            }
        } else {
            error = {
                display: `Failed to read content`,
                raw: `Failed to read content of existing file: ${params.file_path}`
            }
        }

        return {
            currentContent,
            newContent,
            occurrences,
            error,
            isNewFile
        };
    }

    /**
     * Determines if confirmation is needed and prepares the confirmation details.
     * This method performs the calculation needed to generate the diff and respects the `shouldAlwaysEdit` state.
     * @param params Parameters for the potential edit operation
     * @returns Confirmation details object or false if no confirmation is needed/possible.
     */
    async shouldConfirmExecute(params: EditToolParams): Promise<ToolCallConfirmationDetails | false> {
        if (this.shouldAlwaysEdit) {
            return false;
        }

        if (!this.validateParams(params)) {
             console.error("[EditTool] Attempted confirmation with invalid parameters.");
             return false;
        }

        let calculatedEdit: CalculatedEdit;
        try {
            calculatedEdit = this.calculateEdit(params);
        } catch (error) {
            console.error(`Error calculating edit for confirmation: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }

        if (calculatedEdit.error) {
            return false;
        }

        const fileName = path.basename(params.file_path);
        const fileDiff = Diff.createPatch(
            fileName,
            calculatedEdit.currentContent ?? '',
            calculatedEdit.newContent,
            'Current',
            'Proposed',
            { context: 3, ignoreWhitespace: true, }
        );

        const confirmationDetails: ToolEditConfirmationDetails = {
            title: `Confirm Edit: ${shortenPath(makeRelative(params.file_path, this.rootDirectory))}`,
            fileName,
            fileDiff,
            onConfirm: async (outcome: ToolConfirmationOutcome) => {
                if (outcome === ToolConfirmationOutcome.ProceedAlways) {
                    this.shouldAlwaysEdit = true;
                }
            },
        };
        return confirmationDetails;
    }

    getDescription(params: EditToolParams): string {
        const relativePath = makeRelative(params.file_path, this.rootDirectory);
        const oldStringSnippet = params.old_string.split('\n')[0].substring(0, 30) + (params.old_string.length > 30 ? '...' : '');
        const newStringSnippet = params.new_string.split('\n')[0].substring(0, 30) + (params.new_string.length > 30 ? '...' : '');
        return `${shortenPath(relativePath)}: ${oldStringSnippet} => ${newStringSnippet}`;
    }

    /**
     * Executes the edit operation with the given parameters.
     * This method recalculates the edit operation before execution.
     * @param params Parameters for the edit operation
     * @returns Result of the edit operation
     */
    async execute(params: EditToolParams): Promise<EditToolResult> {
        if (!this.validateParams(params)) {
            return {
                llmContent: 'Invalid parameters for file edit operation',
                returnDisplay: '**Error:** Invalid parameters for file edit operation'
            };
        }

        let editData: CalculatedEdit;
        try {
            editData = this.calculateEdit(params);
        } catch (error) {
            return {
                llmContent: `Error preparing edit: ${error instanceof Error ? error.message : String(error)}`,
                returnDisplay: 'Failed to prepare edit'
            };
        }

        if (editData.error) {
            return {
                llmContent: editData.error.raw,
                returnDisplay: editData.error.display
            };
        }

        try {
            this.ensureParentDirectoriesExist(params.file_path);
            fs.writeFileSync(params.file_path, editData.newContent, 'utf8');

            if (editData.isNewFile) {
                return {
                    llmContent: `Created new file: ${params.file_path} with provided content.`,
                    returnDisplay: `Created ${shortenPath(makeRelative(params.file_path, this.rootDirectory))}`
                };
            } else {
                const fileName = path.basename(params.file_path);
                const fileDiff = Diff.createPatch(
                    fileName,
                    editData.currentContent ?? '',
                    editData.newContent,
                    'Current',
                    'Proposed',
                    { context: 3, ignoreWhitespace: true }
                );

                return {
                    llmContent: `Successfully modified file: ${params.file_path} (${editData.occurrences} replacements).`,
                    returnDisplay: { fileDiff }
                };
            }
        } catch (error) {
            return {
                llmContent: `Error executing edit: ${error instanceof Error ? error.message : String(error)}`,
                returnDisplay: `Failed to edit file`
            };
        }
    }

    /**
     * Counts occurrences of a substring in a string
     * @param str String to search in
     * @param substr Substring to count
     * @returns Number of occurrences
     */
    private countOccurrences(str: string, substr: string): number {
        if (substr === '') {
            return 0;
        }
        let count = 0;
        let pos = str.indexOf(substr);
        while (pos !== -1) {
            count++;
            pos = str.indexOf(substr, pos + substr.length);
        }
        return count;
    }

    /**
     * Replaces all occurrences of a substring in a string
     * @param str String to modify
     * @param find Substring to find
     * @param replace Replacement string
     * @returns Modified string
     */
    private replaceAll(str: string, find: string, replace: string): string {
        if (find === '') {
            return str;
        }
        return str.split(find).join(replace);
    }

    /**
     * Creates parent directories if they don't exist
     * @param filePath Path to ensure parent directories exist
     */
    private ensureParentDirectoriesExist(filePath: string): void {
        const dirName = path.dirname(filePath);
        if (!fs.existsSync(dirName)) {
            fs.mkdirSync(dirName, { recursive: true });
        }
    }
}
