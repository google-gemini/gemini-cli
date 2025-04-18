import * as fs from 'fs/promises';
import * as path from 'path';
import { getErrorMessage, isNodeError } from './errors.js';

const MAX_ITEMS = 200;
const TRUNCATION_INDICATOR = '...';
const DEFAULT_IGNORED_FOLDERS = new Set(['node_modules', '.git', 'dist']);

// --- Interfaces ---

/** Options for customizing folder structure retrieval. */
interface FolderStructureOptions {
  /** Maximum number of files and folders combined to display. Defaults to 200. */
  maxItems?: number;
  /** Set of folder names to ignore completely. Case-sensitive. */
  ignoredFolders?: Set<string>;
  /** Optional regex to filter included files by name. */
  fileIncludePattern?: RegExp;
}

// Define a type for the merged options where fileIncludePattern remains optional
type MergedFolderStructureOptions = Required<
  Omit<FolderStructureOptions, 'fileIncludePattern'>
> & {
  fileIncludePattern?: RegExp;
};

/** Represents the full, unfiltered information about a folder and its contents. */
interface FullFolderInfo {
  name: string;
  path: string;
  files: string[];
  subFolders: FullFolderInfo[];
  totalChildren: number; // Total files + subfolders recursively
  totalFiles: number; // Total files recursively
  isIgnored?: boolean; // Flag to easily identify ignored folders later
}

/** Represents the potentially truncated structure used for display. */
interface ReducedFolderNode {
  name: string; // Folder name
  isRoot?: boolean;
  files: string[]; // File names, might end with '...'
  subFolders: ReducedFolderNode[]; // Subfolders, might be truncated
  hasMoreFiles?: boolean; // Indicates if files were truncated for this specific folder
  hasMoreSubfolders?: boolean; // Indicates if subfolders were truncated for this specific folder
}

// --- Helper Functions ---

/**
 * Recursively reads the full directory structure without truncation.
 * Ignored folders are included but not recursed into.
 * @param folderPath The absolute path to the folder.
 * @param options Configuration options.
 * @returns A promise resolving to the FullFolderInfo or null if access denied/not found.
 */
async function readFullStructure(
  folderPath: string,
  options: MergedFolderStructureOptions,
): Promise<FullFolderInfo | null> {
  const name = path.basename(folderPath);
  // Initialize with isIgnored: false
  const folderInfo: Omit<FullFolderInfo, 'totalChildren' | 'totalFiles'> = {
    name,
    path: folderPath,
    files: [],
    subFolders: [],
    isIgnored: false,
  };

  let totalChildrenCount = 0;
  let totalFileCount = 0;

  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });

    // Process directories first
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subFolderName = entry.name;
        const subFolderPath = path.join(folderPath, subFolderName);

        // Check if the folder should be ignored
        if (options.ignoredFolders.has(subFolderName)) {
          // Add ignored folder node but don't recurse
          const ignoredFolderInfo: FullFolderInfo = {
            name: subFolderName,
            path: subFolderPath,
            files: [],
            subFolders: [],
            totalChildren: 0, // No children explored
            totalFiles: 0, // No files explored
            isIgnored: true, // Mark as ignored
          };
          folderInfo.subFolders.push(ignoredFolderInfo);
          // Skip recursion for this folder
          continue;
        }

        // If not ignored, recurse as before
        const subFolderInfo = await readFullStructure(subFolderPath, options);
        // Add non-empty folders OR explicitly ignored folders
        if (
          subFolderInfo &&
          (subFolderInfo.totalChildren > 0 ||
            subFolderInfo.files.length > 0 ||
            subFolderInfo.isIgnored)
        ) {
          folderInfo.subFolders.push(subFolderInfo);
        }
      }
    }

    // Then process files (only if the current folder itself isn't marked as ignored)
    for (const entry of entries) {
      if (entry.isFile()) {
        const fileName = entry.name;
        // Include if no pattern or if pattern matches
        if (
          !options.fileIncludePattern ||
          options.fileIncludePattern.test(fileName)
        ) {
          folderInfo.files.push(fileName);
        }
      }
    }

    // Calculate totals *after* processing children
    // Ignored folders contribute 0 to counts here because we didn't look inside.
    totalFileCount =
      folderInfo.files.length +
      folderInfo.subFolders.reduce((sum, sf) => sum + sf.totalFiles, 0);
    // Count the ignored folder itself as one child item in the parent's count.
    totalChildrenCount =
      folderInfo.files.length +
      folderInfo.subFolders.length +
      folderInfo.subFolders.reduce((sum, sf) => sum + sf.totalChildren, 0);
  } catch (error: unknown) {
    if (isNodeError(error) && (error.code === 'EACCES' || error.code === 'ENOENT')) {
      console.warn(
        `Warning: Could not read directory ${folderPath}: ${error.message}`,
      );
      return null;
    }
    throw error;
  }

  return {
    ...(folderInfo as FullFolderInfo), // Cast needed after conditional assignment check
    totalChildren: totalChildrenCount,
    totalFiles: totalFileCount,
  };
}

/**
 * Reduces the full folder structure based on the maxItems limit using BFS.
 * Handles explicitly ignored folders by showing them with a truncation indicator.
 * @param fullInfo The complete folder structure info.
 * @param maxItems The maximum number of items (files + folders) to include.
 * @param ignoredFolders The set of folder names that were ignored during the read phase.
 * @returns The root node of the reduced structure.
 */
function reduceStructure(
  fullInfo: FullFolderInfo,
  maxItems: number,
): ReducedFolderNode {
  const rootReducedNode: ReducedFolderNode = {
    name: fullInfo.name,
    files: [],
    subFolders: [],
    isRoot: true,
  };
  const queue: Array<{
    original: FullFolderInfo;
    reduced: ReducedFolderNode;
  }> = [];

  // Don't count the root itself towards the limit initially
  queue.push({ original: fullInfo, reduced: rootReducedNode });
  let itemCount = 0; // Count folders + files added to the reduced structure

  while (queue.length > 0) {
    const { original: originalFolder, reduced: reducedFolder } = queue.shift()!;

    // If the folder being processed was itself marked as ignored (shouldn't happen for root)
    if (originalFolder.isIgnored) {
      continue;
    }

    // Process Files
    let fileLimitReached = false;
    for (const file of originalFolder.files) {
      // Check limit *before* adding the file
      if (itemCount >= maxItems) {
        if (!fileLimitReached) {
          reducedFolder.files.push(TRUNCATION_INDICATOR);
          reducedFolder.hasMoreFiles = true;
          fileLimitReached = true;
        }
        break;
      }
      reducedFolder.files.push(file);
      itemCount++;
    }

    // Process Subfolders
    let subfolderLimitReached = false;
    for (const subFolder of originalFolder.subFolders) {
      // Count the folder itself towards the limit
      itemCount++;
      if (itemCount > maxItems) {
        if (!subfolderLimitReached) {
          // Add a placeholder node ONLY if we haven't already added one
          const truncatedSubfolderNode: ReducedFolderNode = {
            name: subFolder.name,
            files: [TRUNCATION_INDICATOR], // Generic truncation
            subFolders: [],
            hasMoreFiles: true,
          };
          reducedFolder.subFolders.push(truncatedSubfolderNode);
          reducedFolder.hasMoreSubfolders = true;
          subfolderLimitReached = true;
        }
        continue; // Stop processing further subfolders for this parent
      }

      // Handle explicitly ignored folders identified during the read phase
      if (subFolder.isIgnored) {
        const ignoredReducedNode: ReducedFolderNode = {
          name: subFolder.name,
          files: [TRUNCATION_INDICATOR], // Indicate contents ignored/truncated
          subFolders: [],
          hasMoreFiles: true, // Mark as truncated
        };
        reducedFolder.subFolders.push(ignoredReducedNode);
        // DO NOT add the ignored folder to the queue for further processing
      } else {
        // If not ignored and within limit, create the reduced node and add to queue
        const reducedSubFolder: ReducedFolderNode = {
          name: subFolder.name,
          files: [],
          subFolders: [],
        };
        reducedFolder.subFolders.push(reducedSubFolder);
        queue.push({ original: subFolder, reduced: reducedSubFolder });
      }
    }
  }

  return rootReducedNode;
}

/** Calculates the total number of items present in the reduced structure. */
function countReducedItems(node: ReducedFolderNode): number {
  let count = 0;
  // Count files, treating '...' as one item if present
  count += node.files.length;

  // Count subfolders and recursively count their contents
  count += node.subFolders.length;
  for (const sub of node.subFolders) {
    // Check if it's a placeholder ignored/truncated node
    const isTruncatedPlaceholder =
      sub.files.length === 1 &&
      sub.files[0] === TRUNCATION_INDICATOR &&
      sub.subFolders.length === 0;

    if (!isTruncatedPlaceholder) {
      count += countReducedItems(sub);
    }
    // Don't add count for items *inside* the placeholder node itself.
  }
  return count;
}

/**
 * Formats the reduced folder structure into a tree-like string.
 * (No changes needed in this function)
 * @param node The current node in the reduced structure.
 * @param indent The current indentation string.
 * @param isLast Sibling indicator.
 * @param builder Array to build the string lines.
 */
function formatReducedStructure(
  node: ReducedFolderNode,
  indent: string,
  isLast: boolean,
  builder: string[],
): void {
  const connector = isLast ? '└───' : '├───';
  const linePrefix = indent + connector;

  // Don't print the root node's name directly, only its contents
  if (!node.isRoot) {
    builder.push(`${linePrefix}${node.name}/`);
  }

  const childIndent = indent + (isLast || node.isRoot ? '    ' : '│   '); // Use " " if last, "│" otherwise

  // Render files
  const fileCount = node.files.length;
  for (let i = 0; i < fileCount; i++) {
    const isLastFile = i === fileCount - 1 && node.subFolders.length === 0;
    const fileConnector = isLastFile ? '└───' : '├───';
    builder.push(`${childIndent}${fileConnector}${node.files[i]}`);
  }

  // Render subfolders
  const subFolderCount = node.subFolders.length;
  for (let i = 0; i < subFolderCount; i++) {
    const isLastSub = i === subFolderCount - 1;
    formatReducedStructure(node.subFolders[i], childIndent, isLastSub, builder);
  }
}

// --- Main Exported Function ---

/**
 * Generates a string representation of a directory's structure,
 * limiting the number of items displayed. Ignored folders are shown
 * followed by '...' instead of their contents.
 *
 * @param directory The absolute or relative path to the directory.
 * @param options Optional configuration settings.
 * @returns A promise resolving to the formatted folder structure string.
 */
export async function getFolderStructure(
  directory: string,
  options?: FolderStructureOptions,
): Promise<string> {
  const resolvedPath = path.resolve(directory);
  const mergedOptions: MergedFolderStructureOptions = {
    maxItems: options?.maxItems ?? MAX_ITEMS,
    ignoredFolders: options?.ignoredFolders ?? DEFAULT_IGNORED_FOLDERS,
    fileIncludePattern: options?.fileIncludePattern,
  };

  try {
    // 1. Read the full structure (includes ignored folders marked as such)
    const fullInfo = await readFullStructure(resolvedPath, mergedOptions);

    if (!fullInfo) {
      return `Error: Could not read directory "${resolvedPath}". Check path and permissions.`;
    }

    // 2. Reduce the structure (handles ignored folders specifically)
    const reducedRoot = reduceStructure(
      fullInfo,
      mergedOptions.maxItems,
    );

    // 3. Count items in the *reduced* structure for the summary
    const rootNodeItselfCount = 0; // Don't count the root node in the items summary
    const reducedItemCount =
      countReducedItems(reducedRoot) - rootNodeItselfCount;

    // 4. Format the reduced structure into a string
    const structureLines: string[] = [];
    formatReducedStructure(reducedRoot, '', true, structureLines);

    // 5. Build the final output string
    const displayPath = resolvedPath.replace(/\\/g, '/');
    const totalOriginalChildren = fullInfo.totalChildren;

    let disclaimer = '';
    // Check if any truncation happened OR if ignored folders were present
    if (
      reducedItemCount < totalOriginalChildren ||
      fullInfo.subFolders.some((sf) => sf.isIgnored)
    ) {
      disclaimer = `Folders or files indicated with ${TRUNCATION_INDICATOR} contain more items not shown or were ignored.`;
    }

    const summary =
      `Showing ${reducedItemCount} of ${totalOriginalChildren} items (files + folders). ${disclaimer}`.trim();

    return `${summary}\n\n${displayPath}/\n${structureLines.join('\n')}`;
  } catch (error: unknown) {
    console.error(`Error getting folder structure for ${resolvedPath}:`, error);
    return `Error processing directory "${resolvedPath}": ${getErrorMessage(error)}`;
  }
}
