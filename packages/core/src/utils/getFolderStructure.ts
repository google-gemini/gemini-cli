/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import { Dirent } from 'fs';
import * as path from 'path';
import { getErrorMessage, isNodeError } from './errors.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';

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
  /** For filtering files. */
  fileService?: FileDiscoveryService;
  /** Whether to use .gitignore patterns. */
  respectGitIgnore?: boolean;
}

// Define a type for the merged options where fileIncludePattern remains optional
type MergedFolderStructureOptions = Required<
  Omit<FolderStructureOptions, 'fileIncludePattern' | 'fileService'>
> & {
  fileIncludePattern?: RegExp;
  fileService?: FileDiscoveryService;
};

/** Represents the full, unfiltered information about a folder and its contents. */
interface FullFolderInfo {
  name: string;
  path: string;
  files: string[];
  subFolders: FullFolderInfo[];
  totalChildren: number; // Number of files and subfolders included from this folder during BFS scan
  totalFiles: number; // Number of files included from this folder during BFS scan
  isIgnored?: boolean; // Flag to easily identify ignored folders later
  hasMoreFiles?: boolean; // Indicates if files were truncated for this specific folder
  hasMoreSubfolders?: boolean; // Indicates if subfolders were truncated for this specific folder
}

// --- Interfaces ---

// --- Helper Functions ---

async function readFullStructure(
  rootPath: string,
  options: MergedFolderStructureOptions,
): Promise<FullFolderInfo | null> {
  const rootName = path.basename(rootPath);
  const rootNode: FullFolderInfo = {
    name: rootName,
    path: rootPath,
    files: [],
    subFolders: [],
    totalChildren: 0,
    totalFiles: 0,
  };

  const queue: Array<{ folderInfo: FullFolderInfo; currentPath: string }> = [
    { folderInfo: rootNode, currentPath: rootPath },
  ];
  let currentItemCount = 0;
  // Count the root node itself as one item if we are not just listing its content

  const processedPaths = new Set<string>(); // To avoid processing same path if symlinks create loops

  while (queue.length > 0) {
    const { folderInfo, currentPath } = queue.shift()!;

    if (processedPaths.has(currentPath)) {
      continue;
    }
    processedPaths.add(currentPath);

    if (currentItemCount >= options.maxItems) {
      // If the root itself caused us to exceed, we can't really show anything.
      // Otherwise, this folder won't be processed further.
      // The parent that queued this would have set its own hasMoreSubfolders flag.
      continue;
    }

    let entries: Dirent[];
    try {
      const rawEntries = await fs.readdir(currentPath, { withFileTypes: true });
      // Sort entries alphabetically by name for consistent processing order
      entries = rawEntries.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error: unknown) {
      if (
        isNodeError(error) &&
        (error.code === 'EACCES' || error.code === 'ENOENT')
      ) {
        console.warn(
          `Warning: Could not read directory ${currentPath}: ${error.message}`,
        );
        if (currentPath === rootPath && error.code === 'ENOENT') {
          return null; // Root directory itself not found
        }
        // For other EACCES/ENOENT on subdirectories, just skip them.
        continue;
      }
      throw error;
    }

    const filesInCurrentDir: string[] = [];
    const subFoldersInCurrentDir: FullFolderInfo[] = [];

    // Process files first in the current directory
    for (const entry of entries) {
      if (entry.isFile()) {
        if (currentItemCount >= options.maxItems) {
          folderInfo.hasMoreFiles = true;
          break;
        }
        const fileName = entry.name;
        const filePath = path.join(currentPath, fileName);
        if (options.respectGitIgnore && options.fileService) {
          if (options.fileService.shouldGitIgnoreFile(filePath)) {
            continue;
          }
        }
        if (
          !options.fileIncludePattern ||
          options.fileIncludePattern.test(fileName)
        ) {
          filesInCurrentDir.push(fileName);
          currentItemCount++;
          folderInfo.totalFiles++;
          folderInfo.totalChildren++;
        }
      }
    }
    folderInfo.files = filesInCurrentDir;

    // Then process directories and queue them
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Check if adding this directory ITSELF would meet or exceed maxItems
        // (currentItemCount refers to items *already* added before this one)
        if (currentItemCount >= options.maxItems) {
          folderInfo.hasMoreSubfolders = true;
          break; // Already at limit, cannot add this folder or any more
        }
        // If adding THIS folder makes us hit the limit exactly, and it might have children,
        // it's better to show '...' for the parent, unless this is the very last item slot.
        // This logic is tricky. Let's try a simpler: if we can't add this item, mark and break.

        const subFolderName = entry.name;
        const subFolderPath = path.join(currentPath, subFolderName);

        let isIgnoredByGit = false;
        if (options.respectGitIgnore && options.fileService) {
          if (options.fileService.shouldGitIgnoreFile(subFolderPath)) {
            isIgnoredByGit = true;
          }
        }

        if (options.ignoredFolders.has(subFolderName) || isIgnoredByGit) {
          const ignoredSubFolder: FullFolderInfo = {
            name: subFolderName,
            path: subFolderPath,
            files: [],
            subFolders: [],
            totalChildren: 0,
            totalFiles: 0,
            isIgnored: true,
          };
          subFoldersInCurrentDir.push(ignoredSubFolder);
          currentItemCount++; // Count the ignored folder itself
          folderInfo.totalChildren++; // Also counts towards parent's children
          continue;
        }

        const subFolderNode: FullFolderInfo = {
          name: subFolderName,
          path: subFolderPath,
          files: [],
          subFolders: [],
          totalChildren: 0,
          totalFiles: 0,
        };
        subFoldersInCurrentDir.push(subFolderNode);
        currentItemCount++;
        folderInfo.totalChildren++; // Counts towards parent's children

        // Add to queue for processing its children later
        queue.push({ folderInfo: subFolderNode, currentPath: subFolderPath });
      }
    }
    folderInfo.subFolders = subFoldersInCurrentDir;
  }

  return rootNode;
}

/**
 * Reads the directory structure using BFS, respecting maxItems.
 * @param node The current node in the reduced structure.
 * @param indent The current indentation string.
 * @param isLast Sibling indicator.
 * @param builder Array to build the string lines.
 */
function formatStructure(
  node: FullFolderInfo,
  currentIndent: string,
  isLastChildOfParent: boolean,
  isProcessingRootNode: boolean,
  builder: string[],
): void {
  const connector = isLastChildOfParent ? '└───' : '├───';

  // The root node of the structure (the one passed initially to getFolderStructure)
  // is not printed with a connector line itself, only its name as a header.
  // Its children are printed relative to that conceptual root.
  // Ignored root nodes ARE printed with a connector.
  if (!isProcessingRootNode || node.isIgnored) {
    builder.push(
      `${currentIndent}${connector}${node.name}/${node.isIgnored ? TRUNCATION_INDICATOR : ''}`,
    );
  }

  // Determine the indent for the children of *this* node.
  // If *this* node was the root of the whole structure, its children start with no indent before their connectors.
  // Otherwise, children's indent extends from the current node's indent.
  const indentForChildren = isProcessingRootNode
    ? ''
    : currentIndent + (isLastChildOfParent ? '    ' : '│   ');

  // Render files of the current node
  const fileCount = node.files.length;
  for (let i = 0; i < fileCount; i++) {
    const isLastFileAmongSiblings =
      i === fileCount - 1 &&
      node.subFolders.length === 0 &&
      !node.hasMoreSubfolders;
    const fileConnector = isLastFileAmongSiblings ? '└───' : '├───';
    builder.push(`${indentForChildren}${fileConnector}${node.files[i]}`);
  }
  if (node.hasMoreFiles) {
    const isLastIndicatorAmongSiblings =
      node.subFolders.length === 0 && !node.hasMoreSubfolders;
    const fileConnector = isLastIndicatorAmongSiblings ? '└───' : '├───';
    builder.push(`${indentForChildren}${fileConnector}${TRUNCATION_INDICATOR}`);
  }

  // Render subfolders of the current node
  const subFolderCount = node.subFolders.length;
  for (let i = 0; i < subFolderCount; i++) {
    const isLastSubfolderAmongSiblings =
      i === subFolderCount - 1 && !node.hasMoreSubfolders;
    // Children are never the root node being processed initially.
    formatStructure(
      node.subFolders[i],
      indentForChildren,
      isLastSubfolderAmongSiblings,
      false,
      builder,
    );
  }
  if (node.hasMoreSubfolders) {
    builder.push(`${indentForChildren}└───${TRUNCATION_INDICATOR}`);
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
    fileService: options?.fileService,
    respectGitIgnore: options?.respectGitIgnore ?? true,
  };

  try {
    // 1. Read the structure using BFS, respecting maxItems
    const structureRoot = await readFullStructure(resolvedPath, mergedOptions);

    if (!structureRoot) {
      return `Error: Could not read directory "${resolvedPath}". Check path and permissions.`;
    }

    // 2. Format the structure into a string
    const structureLines: string[] = [];
    // Pass true for isRoot for the initial call
    formatStructure(structureRoot, '', true, true, structureLines);

    // 3. Build the final output string
    const displayPath = resolvedPath.replace(/\\/g, '/');

    let disclaimer = '';
    // Check if truncation occurred anywhere or if ignored folders are present.
    // A simple check: if any node indicates more files/subfolders, or is ignored.
    let truncationOccurred = false;
    function checkForTruncation(node: FullFolderInfo) {
      if (node.hasMoreFiles || node.hasMoreSubfolders || node.isIgnored) {
        truncationOccurred = true;
      }
      if (!truncationOccurred) {
        for (const sub of node.subFolders) {
          checkForTruncation(sub);
          if (truncationOccurred) break;
        }
      }
    }
    checkForTruncation(structureRoot);

    if (truncationOccurred) {
      disclaimer = `Folders or files indicated with ${TRUNCATION_INDICATOR} contain more items not shown, were ignored, or the display limit (${mergedOptions.maxItems} items) was reached.`;
    }

    const summary =
      `Showing up to ${mergedOptions.maxItems} items (files + folders). ${disclaimer}`.trim();

    const output = `${summary}\n\n${displayPath}/\n${structureLines.join('\n')}`;
    return output;
  } catch (error: unknown) {
    console.error(`Error getting folder structure for ${resolvedPath}:`, error);
    return `Error processing directory "${resolvedPath}": ${getErrorMessage(error)}`;
  }
}
