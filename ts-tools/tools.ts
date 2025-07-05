/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// This file is the central registry for all tools in the Gemini CLI.
// It imports each tool and adds it to a central registry, making it
// possible to invoke any tool by name.

import { replaceMethodAst } from './ast_method_replace';
import { awkFile } from './awk_tool';
import { replaceWithBackup, replaceRollback } from './backup_rollback_replace';
import { backupFile } from './backup_tool';
import { base64Decode } from './base64_decode_tool';
import { base64Encode } from './base64_encode_tool';
import { batchProcess } from './batch_tool';
import { catNumbered } from './cat_numbered_tool';
import { catTool } from './cat_tool';
import { chmodFile } from './chmod_tool';
import { compressFiles } from './compress_tool';
import { countStats } from './count_stats';
import { cpFile } from './cp_tool';
import { cutFile } from './cut_tool';
import { decompressFiles } from './decompress_tool';
import { diffFiles } from './diff_tool';
import { dryRunReplace } from './dry_run_tool';
import { echoText } from './echo_tool';
import { editInsertLine } from './edit_insert_line';
import { editWithUndo, undoEdit } from './edit_with_undo';
import { replaceWithContext } from './enhanced_regex_replace';
import { findFiles as findFilesByContent } from './find-files';
import { findFiles as findFilesByPattern } from './find_tool';
import { callGeminiApi } from './gemini';
import { generateDocs } from './generate-docs';
import { generateTest } from './generate-test';
import { gitTool } from './git_tool';
import { grepContext } from './grep_context_tool';
import { grepRecursive } from './grep_recursive_tool';
import { grepTool } from './grep_tool';
import { hashFile } from './hash_tool';
import { headFile } from './head_tool';
import { replaceInteractive } from './interactive_replace';
import { lsTool } from './ls_tool';
import { mkdirDir } from './mkdir_tool';
import { mvFile } from './mv_tool';
import { replaceNaturalLanguage } from './natural_language_replace';
import { pasteFiles } from './paste_tool';
import { patchFile } from './patch_tool';
import { processFileList } from './process_file_list';
import { projectSummary } from './project-summary';
import { readHead } from './read_head';
import { readWithHighlighting } from './read_with_highlighting';
import { refactorCodeTool } from './refactor-code';
import { replaceAll } from './replace_all_tool';
import { rmFile } from './rm_tool';
import { rmdirDir } from './rmdir_tool';
import { sedAppend } from './sed_append_tool';
import { sedDelete } from './sed_delete_tool';
import { sedInsert } from './sed_insert_tool';
import { sedReplace } from './sed_tool';
import { showMetadata } from './show_metadata';
import { sortFile } from './sort_tool';
import { splitFile } from './split_tool';
import { statFile } from './stat_tool';
import { tailFile } from './tail_tool';
import { teeFile } from './tee_tool';
import { templateFile } from './template_tool';
import { touchFile } from './touch_tool';
import { trFile } from './tr_tool';
import { uniqFile } from './uniq_tool';
import { watchFile } from './watch_tool';

interface Tool {
  description: string;
  execute: (args: string[], config?: any) => Promise<string>;
}

const toolRegistry: { [key: string]: Tool } = {
  'ast-replace-method': {
    description: 'Replaces a method in a class using AST.',
    execute: (args, config) =>
      replaceMethodAst(args[0], args[1], args[2], args[3], config),
  },
  awk: {
    description: 'Processes a file line by line with a pattern and action.',
    execute: (args, config) =>
      awkFile(args[0], args[1], (line) => line, config),
  },
  'backup-replace': {
    description: 'Replaces a pattern in a file, with a backup.',
    execute: (args, config) =>
      replaceWithBackup(args[0], args[1], args[2], config),
  },
  'backup-rollback': {
    description: 'Rolls back a file from a backup.',
    execute: (args, config) => replaceRollback(args[0], config),
  },
  backup: {
    description: 'Creates a backup of a file.',
    execute: (args, config) => backupFile(args[0], config),
  },
  'base64-decode': {
    description: 'Decodes a base64 encoded file.',
    execute: (args, config) => base64Decode(args[0], args[1], config),
  },
  'base64-encode': {
    description: 'Encodes a file to base64.',
    execute: (args, config) => base64Encode(args[0], config),
  },
  batch: {
    description: 'Processes a list of files with a given tool.',
    execute: (args, config) =>
      batchProcess(args[0], (file, cfg) => catTool([file]), config),
  },
  'cat-numbered': {
    description: 'Displays a file with line numbers.',
    execute: (args, config) => catNumbered(args[0], config),
  },
  cat: {
    description: 'Concatenates and displays the content of files.',
    execute: (args) => catTool(args),
  },
  chmod: {
    description: 'Changes the permissions of a file.',
    execute: (args, config) => chmodFile(args[0], args[1], config),
  },
  compress: {
    description: 'Compresses files into a zip archive.',
    execute: (args, config) => compressFiles(args.slice(1), args[0], config),
  },
  'count-stats': {
    description: 'Counts lines, words, and characters in a file.',
    execute: (args, config) => countStats(args[0], config),
  },
  cp: {
    description: 'Copies a file.',
    execute: (args, config) => cpFile(args[0], args[1], config),
  },
  cut: {
    description: 'Cuts sections from each line of a file.',
    execute: (args, config) =>
      cutFile(
        args[0],
        args[1],
        args.slice(2).map((n) => parseInt(n)),
        config,
      ),
  },
  decompress: {
    description: 'Decompresses a zip archive.',
    execute: (args, config) => decompressFiles(args[0], args[1], config),
  },
  diff: {
    description: 'Compares two files.',
    execute: (args, config) => diffFiles(args[0], args[1], config),
  },
  'dry-run-replace': {
    description: 'Performs a dry run of a replacement.',
    execute: (args, config) =>
      dryRunReplace(args[0], args[1], args[2], config),
  },
  echo: {
    description: 'Displays a line of text.',
    execute: (args, config) => echoText(args[0], args[1], config),
  },
  'edit-insert-line': {
    description: 'Inserts a line into a file.',
    execute: (args, config) =>
      editInsertLine(args[0], parseInt(args[1]), args[2], config),
  },
  'edit-with-undo': {
    description: 'Edits a file with an undo option.',
    execute: (args, config) =>
      editWithUndo(
        args[0],
        (file, cfg) => sedReplace(file, args[1], args[2], cfg),
        config,
      ),
  },
  'undo-edit': {
    description: 'Undoes the last edit.',
    execute: (args, config) => undoEdit(args[0], config),
  },
  'replace-with-context': {
    description: 'Replaces a pattern with context.',
    execute: (args, config) =>
      replaceWithContext(args[0], args[1], args[2], config, args[3], args[4]),
  },
  'find-files-by-content': {
    description: 'Finds files by name or content.',
    execute: (args) => findFilesByContent(args),
  },
  'find-files-by-pattern': {
    description: 'Finds files by pattern.',
    execute: (args, config) => findFilesByPattern(args[0], args[1], config),
  },
  gemini: {
    description: 'Calls the Gemini API.',
    execute: (args) => callGeminiApi(args.join(' ')),
  },
  'generate-docs': {
    description: 'Generates documentation for a file.',
    execute: (args) => generateDocs(args),
  },
  'generate-test': {
    description: 'Generates a test file.',
    execute: (args) => generateTest(args),
  },
  git: {
    description: 'Enhanced Git operations using AI.',
    execute: (args) => gitTool(args),
  },
  'grep-context': {
    description: 'Searches for a pattern with context.',
    execute: (args, config) =>
      grepContext(args[0], args[1], parseInt(args[2]), config),
  },
  'grep-recursive': {
    description: 'Recursively searches for a pattern.',
    execute: (args, config) => grepRecursive(args[0], args[1], config),
  },
  grep: {
    description: 'Searches for a pattern in files.',
    execute: (args) => grepTool(args),
  },
  hash: {
    description: 'Calculates the hash of a file.',
    execute: (args, config) => hashFile(args[0], config, args[1]),
  },
  head: {
    description: 'Displays the beginning of a file.',
    execute: (args, config) => headFile(args[0], parseInt(args[1]), config),
  },
  'interactive-replace': {
    description: 'Performs an interactive replacement.',
    execute: (args, config) =>
      replaceInteractive(args[0], args[1], args[2], config),
  },
  ls: {
    description: 'Lists files and directories with details.',
    execute: (args) => lsTool(args),
  },
  mkdir: {
    description: 'Creates a directory.',
    execute: (args, config) => mkdirDir(args[0], config),
  },
  mv: {
    description: 'Moves a file.',
    execute: (args, config) => mvFile(args[0], args[1], config),
  },
  'natural-language-replace': {
    description: 'Performs a replacement using natural language.',
    execute: (args, config) =>
      replaceNaturalLanguage(args[0], args[1], config),
  },
  paste: {
    description: 'Merges lines of files.',
    execute: (args, config) => pasteFiles(args, config),
  },
  patch: {
    description: 'Applies a patch to a file.',
    execute: (args, config) => patchFile(args[0], args[1], config),
  },
  'process-file-list': {
    description: 'Processes a list of files with a given tool.',
    execute: (args, config) =>
      processFileList(
        args[0],
        (file, cfg) => catTool([file]),
        config,
        ...args.slice(1),
      ),
  },
  'project-summary': {
    description: 'Provides a summary of the project.',
    execute: (args) => projectSummary(args),
  },
  'read-head': {
    description: 'Reads the first few lines of a file.',
    execute: (args, config) => readHead(args[0], parseInt(args[1]), config),
  },
  'read-with-highlighting': {
    description: 'Reads a file with syntax highlighting.',
    execute: (args, config) => readWithHighlighting(args[0], config),
  },
  'refactor-code': {
    description: 'Refactors code using AST.',
    execute: (args) => refactorCodeTool(args),
  },
  'replace-all': {
    description: 'Replaces a pattern in all files in a directory.',
    execute: (args, config) =>
      replaceAll(args[0], args[1], args[2], config, args[3] === 'true'),
  },
  rm: {
    description: 'Removes a file.',
    execute: (args, config) => rmFile(args[0], config),
  },
  rmdir: {
    description: 'Removes a directory.',
    execute: (args, config) => rmdirDir(args[0], config),
  },
  'sed-append': {
    description: 'Appends a line after a pattern.',
    execute: (args, config) => sedAppend(args[0], args[1], args[2], config),
  },
  'sed-delete': {
    description: 'Deletes lines matching a pattern.',
    execute: (args, config) => sedDelete(args[0], args[1], config),
  },
  'sed-insert': {
    description: 'Inserts a line at a given line number.',
    execute: (args, config) =>
      sedInsert(args[0], parseInt(args[1]), args[2], config),
  },
  sed: {
    description: 'Replaces a pattern in a file.',
    execute: (args, config) =>
      sedReplace(args[0], args[1], args[2], config, args[3] === 'true'),
  },
  'show-metadata': {
    description: 'Shows metadata for a file.',
    execute: (args, config) => showMetadata(args[0], config),
  },
  sort: {
    description: 'Sorts the lines of a file.',
    execute: (args, config) =>
      sortFile(args[0], config, args[1] === 'true'),
  },
  split: {
    description: 'Splits a file into multiple smaller files.',
    execute: (args, config) =>
      splitFile(args[0], parseInt(args[1]), args[2], config),
  },
  stat: {
    description: 'Displays file status.',
    execute: (args, config) => statFile(args[0], config),
  },
  tail: {
    description: 'Displays the last part of a file.',
    execute: (args, config) => tailFile(args[0], parseInt(args[1]), config),
  },
  tee: {
    description: 'Reads from standard input and writes to standard output and files.',
    execute: (args, config) => teeFile(args[0], args[1], config),
  },
  template: {
    description: 'Creates a file from a template.',
    execute: (args, config) =>
      templateFile(args[0], args[1], JSON.parse(args[2]), config),
  },
  touch: {
    description: 'Changes file timestamps.',
    execute: (args, config) => touchFile(args[0], config),
  },
  tr: {
    description: 'Translates characters.',
    execute: (args, config) => trFile(args[0], args[1], args[2], config),
  },
  uniq: {
    description: 'Removes duplicate lines from a file.',
    execute: (args, config) => uniqFile(args[0], config),
  },
  watch: {
    description: 'Executes a command when a file changes.',
    execute: (args, config) =>
      watchFile(args[0], args[1], parseInt(args[2]), config),
  },
};

export async function invokeTool(
  toolName: string,
  args: string[],
  config?: any,
): Promise<string> {
  const tool = toolRegistry[toolName];
  if (!tool) {
    return Promise.reject(`Error: Tool "${toolName}" not found.`);
  }
  return tool.execute(args, config);
}

export function getToolDescriptions(): { [key: string]: string } {
  const descriptions: { [key: string]: string } = {};
  for (const toolName in toolRegistry) {
    descriptions[toolName] = toolRegistry[toolName].description;
  }
  return descriptions;
}
