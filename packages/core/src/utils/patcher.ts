/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview A tool to apply standard unified diff format patches.
 * This tool is optimized for use by LLMs, featuring content-based matching
 * that ignores line numbers for a higher success rate. It handles multiple
 * files, file creation, and file deletion, and provides clear output on
 * success or failure.
 */

import * as path from 'node:path';
import {
  StandardFileSystemService,
  type FileSystemService,
} from '../services/fileSystemService.js';

export interface PatcherConfig {
  getTargetDir(): string;
  isPathWithinWorkspace(path: string): boolean;
}

/**
 * Custom error class for patch-related failures.
 */
export class PatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PatchError';
  }
}

/** Interface representing a parsed hunk from a diff file. */
export interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  originalHunk: string;
  lines: string[];
  header: string;
}

/**
 * Parses a hunk header to extract line numbers and context.
 * @param hunkStr The string content of a single hunk.
 * @returns An object with old start line and a context hint string.
 */
function parseHunkHeader(hunkStr: string): Hunk {
  const lines = hunkStr.split('\n');
  const headerLine = lines[0];
  const match = /@@ -(\d+)(,(\d+))? \+(\d+)(,(\d+))? @@/.exec(headerLine);
  if (!match) {
    throw new PatchError(`Invalid hunk header: ${headerLine}`);
  }

  return {
    oldStart: parseInt(match[1], 10),
    oldCount: match[3] ? parseInt(match[3], 10) : 1,
    newStart: parseInt(match[4], 10),
    newCount: match[6] ? parseInt(match[6], 10) : 1,
    originalHunk: hunkStr,
    lines: lines.slice(1),
    header: headerLine,
  };
}

/**
 * Extracts the filename from a diff header line (e.g., '--- a/foo.ts').
 * @param headerLine The diff header line.
 * @return The extracted filename or null for '/dev/null'.
 */
function extractFilenameFromDiffHeader(headerLine: string): string | null {
  // Strip the '--- ' or '+++ ' prefix.
  let filename = headerLine.substring(4).trim();

  if (filename === '/dev/null') {
    return null;
  }

  // Remove standard git diff prefixes 'a/' or 'b/'.
  if (filename.startsWith('a/') || filename.startsWith('b/')) {
    filename = filename.substring(2);
  }
  return filename;
}

/**
 * Parses a unified diff string, which may contain multiple files, and returns a
 * map where keys are filenames and values are an array of parsed Hunk objects.
 * @param diffContent The raw unified diff string.
 * @returns A map from filenames to their Hunks.
 */
export function parse(diffContent: string): Map<string, Hunk[]> {
  const fileHunks = new Map<string, Hunk[]>();
  let currentFile: string | null = null;
  let currentHunk: string[] = [];

  const lines = diffContent.split('\n');
  let i = 0;

  const commitCurrentHunk = () => {
    if (currentFile && currentHunk.length > 0) {
      if (!fileHunks.has(currentFile)) {
        fileHunks.set(currentFile, []);
      }
      fileHunks.get(currentFile)!.push(parseHunkHeader(currentHunk.join('\n')));
    }
    currentHunk = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    // Ignore git format-patch headers and other metadata
    if (
      line.startsWith('From ') ||
      line.startsWith('Date:') ||
      line.startsWith('Subject:') ||
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('new file mode') ||
      line.startsWith('deleted file mode') ||
      line.startsWith('similarity index')
    ) {
      i++;
      continue;
    }

    if (line.startsWith('---')) {
      commitCurrentHunk();
      const oldFile = extractFilenameFromDiffHeader(line);
      if (oldFile) {
        // File deletion might set currentFile here
        currentFile = oldFile;
      }
      i++;
      continue;
    }

    if (line.startsWith('+++')) {
      const newFile = extractFilenameFromDiffHeader(line);
      if (newFile) {
        currentFile = newFile;
      }
      i++;
      continue;
    }

    if (line.startsWith('@@')) {
      commitCurrentHunk();
      currentHunk = [line];
    } else if (currentFile) {
      if (currentHunk.length > 0) {
        currentHunk.push(line);
      }
    }
    i++;
  }

  // Save the final hunk
  commitCurrentHunk();

  return fileHunks;
}

/**
 * Extracts the original 'old' block and the new 'target' block from a hunk.
 * This preserves the exact line structure, including empty lines.
 * @param hunkStr The string content of a single hunk.
 * @return A tuple containing [oldBlock, newBlock].
 */
function extractOldAndNewBlocksFromHunk(hunkStr: string): [string, string] {
  const lines = hunkStr.trim().split('\n').slice(1); // Skip @@ header
  const oldBlockLines: string[] = [];
  const newBlockLines: string[] = [];

  for (const line of lines) {
    // Ignore git patch metadata lines
    if (line.startsWith('-- \n') || /^\d+\.\d+\.\d+/.test(line)) {
      continue;
    }

    const content = line.substring(1);
    switch (line[0]) {
      case ' ':
        oldBlockLines.push(content);
        newBlockLines.push(content);
        break;
      case '-':
        oldBlockLines.push(content);
        break;
      case '+':
        newBlockLines.push(content);
        break;
      default:
        // Handle lines without a prefix (e.g., '\ No newline at end of file')
        // Treat as context, though it's rare.
        oldBlockLines.push(line);
        newBlockLines.push(line);
    }
  }
  return [oldBlockLines.join('\n'), newBlockLines.join('\n')];
}

/**
 * Finds all possible start lines for a hunk based on context hints.
 * @param fileContent The content of the file to search in.
 * @param hunkHeader Parsed hunk header containing start line and context hint.
 * @returns An array of possible 1-based line numbers.
 */
function findLocationHints(fileContent: string, hunk: Hunk): number[] {
  const { oldStart, header } = hunk;
  const headerMatch = /@@ .*? @@(.*)/.exec(header);
  const contextHint =
    headerMatch && headerMatch[1] ? headerMatch[1].trim() : '';

  const fileLines = fileContent.split('\n');
  const hints: number[] = [];

  // Strategy 1: Find all occurrences of the context hint from the header.
  if (contextHint) {
    for (let i = 0; i < fileLines.length; i++) {
      if (fileLines[i].includes(contextHint)) {
        hints.push(i + 1); // 1-based line number
      }
    }
  }

  if (hints.length > 0) {
    return hints;
  }

  // Fallback to the line number from the patch if it's within bounds
  if (oldStart > 0 && oldStart <= fileLines.length) {
    return [oldStart];
  }

  // Final fallback to just start from the top
  return [1];
}

/**
 * Finds the exact start and end line numbers of the old block in the file content.
 * It first tries an exact match and then falls back to a fuzzy match that
 * ignores whitespace differences.
 * @param fileContent The content of the file to search within.
 * @param oldBlock The block of code to find.
 * @param locationHints An array of 1-based line numbers to search around.
 * @return A tuple of [startLine, endLine] (1-based), or [-1, -1] if not found.
 */
function findOldBlockInFile(
  fileContent: string,
  oldBlock: string,
  locationHints: number[],
): [number, number] {
  const fileLines = fileContent.split('\n');
  const oldBlockLines = oldBlock.split('\n');

  // An empty old block cannot be located.
  if (
    oldBlock.length === 0 ||
    (oldBlockLines.length === 1 && oldBlockLines[0] === '')
  )
    return [-1, -1];

  // Strategy 1: Exact match
  for (const hint of locationHints) {
    const searchStart = Math.max(0, hint - 200); // Larger search window
    const searchEnd =
      Math.min(fileLines.length, hint + 1000) - oldBlockLines.length;
    for (let i = searchStart; i <= searchEnd; i++) {
      const candidateBlock = fileLines
        .slice(i, i + oldBlockLines.length)
        .join('\n');
      if (candidateBlock === oldBlock) {
        return [i + 1, i + oldBlockLines.length];
      }
    }
  }

  // Strategy 2: Fuzzy match (ignore trailing whitespace and small variations)
  const rstrip = (s: string) => s.replace(/\s+$/, '');
  const normalize = (text: string) => text.split('\n').map(rstrip).join('\n');
  const oldBlockNormalized = normalize(oldBlock);

  if (oldBlockNormalized === '') return [-1, -1];

  // Use a smaller window for fuzzy matching to avoid incorrect matches.
  for (const hint of locationHints) {
    const searchStart = Math.max(0, hint - 10);
    const searchEnd =
      Math.min(fileLines.length, hint + 20) - oldBlockLines.length;
    for (let i = searchStart; i <= searchEnd; i++) {
      const candidateBlock = fileLines
        .slice(i, i + oldBlockLines.length)
        .join('\n');
      if (normalize(candidateBlock) === oldBlockNormalized) {
        return [i + 1, i + oldBlockLines.length];
      }
    }
  }

  return [-1, -1];
}

/**
 * Applies a single hunk to the in-memory content of a file.
 * @param currentContent The current content of the file.
 * @param hunk The parsed hunk object to apply.
 * @return The modified file content.
 */
function applySingleHunk(currentContent: string, hunk: Hunk): string {
  const [oldBlock, newBlock] = extractOldAndNewBlocksFromHunk(
    hunk.originalHunk,
  );

  // For file creation, the first hunk applies to an empty document.
  if (currentContent === '') {
    return newBlock;
  }

  // For pure insertions, the oldBlock consists only of context lines.
  // For deletions, the newBlock consists only of context lines.
  const locationHints = findLocationHints(currentContent, hunk);
  const [startLine] = findOldBlockInFile(
    currentContent,
    oldBlock,
    locationHints,
  );

  if (startLine === -1) {
    // Before failing, check if the patch has already been applied.
    const [alreadyAppliedStart] = findOldBlockInFile(
      currentContent,
      newBlock,
      locationHints,
    );
    if (alreadyAppliedStart !== -1) {
      // The new block is already in the file, so we can consider this a success.
      console.log('INFO: Hunk seems to be already applied. Skipping.');
      return currentContent;
    }
    throw new PatchError(
      `Could not locate context for hunk:\n${hunk.originalHunk}`,
    );
  }

  // Reconstruct file with the replacement using splice for accuracy
  const fileLines = currentContent.split('\n');
  const oldBlockLines = oldBlock.split('\n');
  const newBlockLines = newBlock.split('\n');

  // Replace the old block with the new block.
  fileLines.splice(startLine - 1, oldBlockLines.length, ...newBlockLines);
  const newFileContent = fileLines.join('\n');

  // This check is important for no-op hunks or subtle whitespace issues.
  if (newFileContent === currentContent) {
    throw new PatchError(
      'Old block was found, but replacement did not change file content. ' +
        'This can happen with subtle whitespace differences.',
    );
  }
  return newFileContent;
}

/**
 * Checks if a hunk represents a file deletion.
 * @param hunk The parsed hunk object.
 * @returns True if it's a file deletion hunk.
 */
export function isFileDeletionHunk(hunk: Hunk): boolean {
  return hunk.newStart === 0 && hunk.newCount === 0;
}

/**
 * Applies a series of patch hunks to a single file.
 * @param filepath The path to the file to be patched.
 * @param hunks An array of hunk strings for this file.
 * @param config The secure directory for operations.
 * @return A summary string of the operations and a list of failed hunks.
 */
async function applyHunksToFile(
  filepath: string,
  parsedHunks: Hunk[],
  config: PatcherConfig,
  fsService: FileSystemService,
): Promise<{ summary: string; failedHunks: Hunk[] }> {
  const safeFilepath = path.resolve(config.getTargetDir(), filepath);
  if (!config.isPathWithinWorkspace(safeFilepath)) {
    throw new PatchError(
      `Security violation: Attempted to patch file '${filepath}' ` +
        `which is outside of the designated working directory.`,
    );
  }
  let originalContent: string;
  let fileExists = true;

  try {
    originalContent = await fsService.readTextFile(safeFilepath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      fileExists = false;
      originalContent = '';
    } else {
      throw error;
    }
  }

  // Handle file deletion as a special case.
  if (parsedHunks.length > 0 && isFileDeletionHunk(parsedHunks[0])) {
    if (fileExists) {
      await fsService.unlink(safeFilepath);
    }
    const summary = `✅ ALL HUNKS APPLIED SUCCESSFULLY for ${filepath}\n\n✅ Hunk 1: Deleted file.`;
    return { summary, failedHunks: [] };
  }

  // Standard hunk application for both existing and new files.
  // The originalContent will be an empty string for new files.
  const { newContent, failedHunks } = applyHunksToContent(
    originalContent,
    parsedHunks,
  );

  const successfulHunks = parsedHunks.length - failedHunks.length;
  const localFailedHunks = failedHunks.map((f) => f.hunk);
  const hunkResults: string[] = [];

  // Generate hunk results for summary
  parsedHunks.forEach((hunk, i) => {
    const failure = failedHunks.find(
      (f) => f.hunk.originalHunk === hunk.originalHunk,
    );
    if (failure) {
      hunkResults.push(
        `❌ Hunk ${i + 1} (L${hunk.oldStart}): FAILED - ${failure.error.message}`,
      );
    } else {
      hunkResults.push(
        `✅ Hunk ${i + 1} (L${hunk.oldStart}): Applied successfully.`,
      );
    }
  });

  // Write the file back to disk if any changes were successful.
  if (successfulHunks > 0 && newContent !== originalContent) {
    // Ensure the directory exists before writing, crucial for new files.
    await fsService.mkdir(path.dirname(safeFilepath), { recursive: true });
    await fsService.writeTextFile(safeFilepath, newContent);
  }

  const status =
    successfulHunks === parsedHunks.length
      ? '✅ ALL HUNKS APPLIED SUCCESSFULLY'
      : successfulHunks > 0
        ? `⚠️ PARTIAL SUCCESS: ${successfulHunks}/${parsedHunks.length} hunks applied`
        : '❌ ALL HUNKS FAILED';
  const summary = [`${status} for ${filepath}`, '', ...hunkResults].join('\n');
  return { summary, failedHunks: localFailedHunks };
}

/**
 * Applies an array of hunks to a string content. This is a pure function
 * that operates in-memory.
 * Takes original file content and an array of hunks to apply. It will return
 * the fully patched content and an array of any hunks that failed to match and
 * apply.
 * @param content The original content of the file.
 * @param hunks An array of Hunk objects to apply.
 * @returns An object containing the new content and a list of failed hunks.
 */
export function applyHunksToContent(
  content: string,
  hunks: Hunk[],
): {
  newContent: string;
  failedHunks: Array<{ hunk: Hunk; error: PatchError }>;
} {
  let modifiedContent = content;
  const failedHunks: Array<{ hunk: Hunk; error: PatchError }> = [];

  const isNewFile = content === '';

  // For new files, hunks must be applied in forward order based on their
  // position in the new file. For existing files, applying in reverse order
  // is safer to avoid line number shifts from affecting subsequent hunks.
  const sortedHunks = isNewFile
    ? [...hunks].sort((a, b) => a.newStart - b.newStart)
    : [...hunks].sort((a, b) => b.oldStart - a.oldStart);

  for (const hunk of sortedHunks) {
    try {
      modifiedContent = applySingleHunk(modifiedContent, hunk);
    } catch (e: unknown) {
      // When applying in forward order, we push to the end.
      // When applying in reverse, we unshift to the front to maintain order.
      if (isNewFile) {
        failedHunks.push({ hunk, error: e as PatchError });
      } else {
        failedHunks.unshift({ hunk, error: e as PatchError });
      }
    }
  }

  return { newContent: modifiedContent, failedHunks };
}

const defaultFsService = new StandardFileSystemService();

/**
 * Applies a map of file hunks to the file system.
 * @param fileHunks A map from filenames to Hunk objects.
 * @param config The secure base directory for file operations.
 * @returns A comprehensive summary report of the patching operation.
 */
export async function applyPatchesToFS(
  fileHunks: Map<string, Hunk[]>,
  config: PatcherConfig,
  totalFilesOverride?: number,
  fsService: FileSystemService = defaultFsService,
): Promise<string> {
  if (!fileHunks || fileHunks.size === 0) {
    return 'ERROR: No valid patches found in input. Please provide a standard unified diff.';
  }

  const results: string[] = [];
  const allFailedHunks: string[] = [];
  let successfulFiles = 0;
  let failedFiles = 0;

  for (const [filepath, hunks] of fileHunks.entries()) {
    try {
      const { summary, failedHunks } = await applyHunksToFile(
        filepath,
        hunks,
        config,
        fsService,
      );
      results.push(summary);

      if (failedHunks.length > 0) {
        failedFiles++;
        const failedHunkBlock = [
          `--- a/${filepath}`,
          `+++ b/${filepath}`,
          ...failedHunks.map((h) => h.originalHunk),
        ].join('\n');
        allFailedHunks.push(failedHunkBlock);
      } else {
        successfulFiles++;
      }
    } catch (e: unknown) {
      failedFiles++;
      results.push(`❌ FAILED: ${filepath}\n   Error: ${(e as Error).message}`);
      // Add all hunks for this file to the failed list on catastrophic error
      const failedHunkBlock = [
        `--- a/${filepath}`,
        `+++ b/${filepath}`,
        ...hunks.map((h) => h.originalHunk),
      ].join('\n');
      allFailedHunks.push(failedHunkBlock);
    }
  }

  // Build the final report string
  const totalFiles =
    totalFilesOverride !== undefined
      ? totalFilesOverride
      : successfulFiles + failedFiles;
  let finalReport = '';
  if (totalFiles > 1) {
    finalReport += `📊 PATCH SUMMARY: ${successfulFiles}/${totalFiles} files patched successfully.\n`;
    if (failedFiles > 0) {
      finalReport += `⚠️  ${failedFiles} files require manual intervention.\n`;
    }
    finalReport += '\n';
  }

  finalReport += results.join('\n\n');

  if (allFailedHunks.length > 0) {
    finalReport += '\n\n' + '🔧 FAILED HUNKS FOR MANUAL APPLICATION\n';
    finalReport += `${'='.repeat(60)}\n`;
    finalReport += `${allFailedHunks.join('\n')}\n`;
    finalReport += `${'='.repeat(60)}\n`;
    finalReport +=
      '💡 TIP: Review the failed hunks, add more context lines from the original file, and try again.\n';
  }

  return finalReport;
}
