import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { BaseTool } from './BaseTool.js';
import { ToolResult } from './ToolResult.js';
import { shortenPath, makeRelative } from '../utils/paths.js';

/**
 * Parameters for the GlobTool
 */
export interface GlobToolParams {
  /**
   * The glob pattern to match files against
   */
  pattern: string;

  /**
   * The directory to search in (optional, defaults to current directory)
   */
  path?: string;
}

/**
 * Result from the GlobTool
 */
export interface GlobToolResult extends ToolResult {
}

/**
 * Implementation of the GlobTool that finds files matching patterns,
 * sorted by modification time (newest first).
 */
export class GlobTool extends BaseTool<GlobToolParams, GlobToolResult> {
  /**
   * The root directory that this tool is grounded in.
   * All file operations will be restricted to this directory.
   */
  private rootDirectory: string;

  /**
   * Creates a new instance of the GlobTool
   * @param rootDirectory Root directory to ground this tool in. All operations will be restricted to this directory.
   */
  constructor(rootDirectory: string) {
    super(
      'glob',
      'FindFiles',
      'Efficiently finds files matching specific glob patterns (e.g., `src/**/*.ts`, `**/*.md`), returning absolute paths sorted by modification time (newest first). Ideal for quickly locating files based on their name or path structure, especially in large codebases.',
      {
        properties: {
          pattern: {
            description: 'The glob pattern to match against (e.g., \'*.py\', \'src/**/*.js\', \'docs/*.md\').',
            type: 'string'
          },
          path: {
            description: 'Optional: The absolute path to the directory to search within. If omitted, searches the root directory.',
            type: 'string'
          }
        },
        required: ['pattern'],
        type: 'object'
      }
    );

    // Set the root directory
    this.rootDirectory = path.resolve(rootDirectory);
  }

  /**
   * Checks if a path is within the root directory.
   * This is a security measure to prevent the tool from accessing files outside of its designated root.
   * @param pathToCheck The path to check (expects an absolute path)
   * @returns True if the path is within the root directory, false otherwise
   */
  private isWithinRoot(pathToCheck: string): boolean {
    const absolutePathToCheck = path.resolve(pathToCheck);
    const normalizedPath = path.normalize(absolutePathToCheck);
    const normalizedRoot = path.normalize(this.rootDirectory);

    // Ensure the normalizedRoot ends with a path separator for proper prefix comparison
    const rootWithSep = normalizedRoot.endsWith(path.sep)
      ? normalizedRoot
      : normalizedRoot + path.sep;

    // Check if it's the root itself or starts with the root path followed by a separator.
    // This ensures that we don't accidentally allow access to parent directories.
    return normalizedPath === normalizedRoot || normalizedPath.startsWith(rootWithSep);
  }

  /**
   * Validates the parameters for the tool.
   * Ensures that the provided parameters adhere to the expected schema and that the search path is valid and within the tool's root directory.
   * @param params Parameters to validate
   * @returns An error message string if invalid, null otherwise
   */
  invalidParams(params: GlobToolParams): string | null {
    if (this.schema.parameters && !SchemaValidator.validate(this.schema.parameters as Record<string, unknown>, params)) {
      return "Parameters failed schema validation. Ensure 'pattern' is a string and 'path' (if provided) is a string.";
    }

    // Determine the absolute path to check
    const searchDirAbsolute = params.path ?? this.rootDirectory;

    // Validate path is within root directory
    if (!this.isWithinRoot(searchDirAbsolute)) {
      return `Search path ("${searchDirAbsolute}") resolves outside the tool's root directory ("${this.rootDirectory}").`;
    }

    // Validate path exists and is a directory using the absolute path.
    // These checks prevent the tool from attempting to search in non-existent or non-directory paths, which would lead to errors.
    try {
      if (!fs.existsSync(searchDirAbsolute)) {
        return `Search path does not exist: ${shortenPath(makeRelative(searchDirAbsolute, this.rootDirectory))} (absolute: ${searchDirAbsolute})`;
      }
      if (!fs.statSync(searchDirAbsolute).isDirectory()) {
        return `Search path is not a directory: ${shortenPath(makeRelative(searchDirAbsolute, this.rootDirectory))} (absolute: ${searchDirAbsolute})`;
      }
    } catch (e: any) {
      // Catch potential permission errors during sync checks
      return `Error accessing search path: ${e.message}`;
    }

    // Validate glob pattern (basic non-empty check)
    if (!params.pattern || typeof params.pattern !== 'string' || params.pattern.trim() === '') {
        return "The 'pattern' parameter cannot be empty.";
    }
    // Could add more sophisticated glob pattern validation if needed

    return null; // Parameters are valid
  }

  /**
   * Gets a description of the glob operation.
   * @param params Parameters for the glob operation.
   * @returns A string describing the glob operation.
   */
  getDescription(params: GlobToolParams): string {
    let description = `'${params.pattern}'`;

    if (params.path) {
      const searchDir = params.path || this.rootDirectory;
      const relativePath = makeRelative(searchDir, this.rootDirectory);
      description += ` within ${shortenPath(relativePath)}`;
    }

    return description;
  }

  /**
   * Executes the glob search with the given parameters
   * @param params Parameters for the glob search
   * @returns Result of the glob search
   */
  async execute(params: GlobToolParams): Promise<GlobToolResult> {
    const validationError = this.invalidParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `**Error:** Failed to execute tool.`
      };
    }

    try {
      // 1. Resolve the absolute search directory. Validation ensures it exists and is a directory.
      const searchDirAbsolute = params.path ?? this.rootDirectory;

      // 2. Perform Glob Search using fast-glob
      // We use fast-glob because it's performant and supports glob patterns.
      const entries = await fg(params.pattern, {
        cwd: searchDirAbsolute, // Search within this absolute directory
        absolute: true,         // Return absolute paths
        onlyFiles: true,        // Match only files
        stats: true,            // Include file stats object for sorting
        dot: true,              // Include files starting with a dot
        ignore: ['**/node_modules/**', '**/.git/**'], // Common sensible default, adjust as needed
        followSymbolicLinks: false, // Avoid potential issues with symlinks unless specifically needed
        suppressErrors: true, // Suppress EACCES errors for individual files (we handle dir access in validation)
      });

      // 3. Handle No Results
      if (!entries || entries.length === 0) {
        return {
          llmContent: `No files found matching pattern "${params.pattern}" within ${searchDirAbsolute}.`,
          returnDisplay: `No files found`
        };
      }

      // 4. Sort Results by Modification Time (Newest First)
      // Sorting by modification time ensures that the most recently modified files are listed first.
      // This can be useful for quickly identifying the files that have been recently changed.
      // The stats object is guaranteed by the `stats: true` option in the fast-glob configuration.
      entries.sort((a, b) => {
        // Ensure stats exist before accessing mtime (though fg should provide them)
        const mtimeA = a.stats?.mtime?.getTime() ?? 0;
        const mtimeB = b.stats?.mtime?.getTime() ?? 0;
        return mtimeB - mtimeA; // Descending order
      });

      // 5. Format Output
      const sortedAbsolutePaths = entries.map(entry => entry.path);

      // Convert absolute paths to relative paths (to rootDir) for clearer display
      const sortedRelativePaths = sortedAbsolutePaths.map(absPath => makeRelative(absPath, this.rootDirectory));

      // Construct the result message
      const fileListDescription = sortedRelativePaths.map(p => `  - ${shortenPath(p)}`).join('\n');
      const fileCount = sortedRelativePaths.length;
      const relativeSearchDir = makeRelative(searchDirAbsolute, this.rootDirectory);
      const displayPath = shortenPath(relativeSearchDir === '.' ? 'root directory' : relativeSearchDir);

      return {
        llmContent: `Found ${fileCount} file(s) matching "${params.pattern}" within ${displayPath}, sorted by modification time (newest first):\n${fileListDescription}`,
        returnDisplay: `Found ${fileCount} matching file(s)`
      };

    } catch (error) {
        // Catch unexpected errors during glob execution (less likely with suppressErrors=true, but possible)
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`GlobTool execute Error: ${errorMessage}`, error);
        return {
            llmContent: `Error during glob search operation: ${errorMessage}`,
            returnDisplay: `**Error:** An unexpected error occurred.`
        };
    }
  }
}