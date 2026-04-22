/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';

/**
 * Maps file extensions or filenames to LSP 3.18 language identifiers.
 * See: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/#textDocumentItem
 */
const extensionToLanguageMap: { [key: string]: string } = {
  '.ts': 'typescript',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascriptreact',
  '.tsx': 'typescriptreact',
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rb': 'ruby',
  '.php': 'php',
  '.phtml': 'php',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.cxx': 'cpp',
  '.cc': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.hpp': 'cpp',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.rs': 'rust',
  '.m': 'objective-c',
  '.mm': 'objective-cpp',
  '.pl': 'perl',
  '.pm': 'perl',
  '.lua': 'lua',
  '.r': 'r',
  '.scala': 'scala',
  '.sc': 'scala',
  '.sh': 'shellscript',
  '.ps1': 'powershell',
  '.bat': 'bat',
  '.cmd': 'bat',
  '.sql': 'sql',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.less': 'less',
  '.sass': 'sass',
  '.scss': 'scss',
  '.json': 'json',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.dockerfile': 'dockerfile',
  '.vim': 'vim',
  '.vb': 'vb',
  '.fs': 'fsharp',
  '.clj': 'clojure',
  '.cljs': 'clojure',
  '.dart': 'dart',
  '.ex': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.lisp': 'lisp',
  '.rkt': 'racket',
  '.groovy': 'groovy',
  '.jl': 'julia',
  '.tex': 'latex',
  '.ino': 'arduino',
  '.asm': 'assembly',
  '.s': 'assembly',
  '.toml': 'toml',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.gohtml': 'gohtml', // Not in standard LSP well-known list but kept for compatibility
  '.hbs': 'handlebars',
  '.ejs': 'ejs',
  '.erb': 'erb',
  '.jsp': 'jsp',
  '.dockerignore': 'ignore',
  '.gitignore': 'ignore',
  '.npmignore': 'ignore',
  '.editorconfig': 'properties',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  '.babelrc': 'json',
  '.tsconfig': 'json',
  '.flow': 'javascript',
  '.graphql': 'graphql',
  '.proto': 'proto',
};

export function getLanguageFromFilePath(filePath: string): string | undefined {
  const filename = path.basename(filePath).toLowerCase();
  const extension = path.extname(filePath).toLowerCase();

  const candidates = [
    extension, // 1. Standard extension (e.g., '.js')
    filename, // 2. Exact filename (e.g., 'dockerfile')
    `.${filename}`, // 3. Dot-prefixed filename (e.g., '.gitignore')
  ];
  const match = candidates.find((key) => key in extensionToLanguageMap);

  return match ? extensionToLanguageMap[match] : undefined;
}
