/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LspClient } from './LspClient.js';
import { extname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { debugLogger } from '../utils/debugLogger.js';

export interface LanguageServerConfig {
  command: string;
  args: string[];
  installHint: string;
}

/**
 * A static mapping dictionary that defines the required language server binary,
 * arguments, and installation hints for various file extensions.
 */
export const DEFAULT_SERVERS: Record<string, LanguageServerConfig> = {
  // TypeScript / JavaScript
  '.ts': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    installHint:
      'typescript-language-server is missing. Run: npm install -g typescript typescript-language-server',
  },
  '.tsx': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    installHint:
      'typescript-language-server is missing. Run: npm install -g typescript typescript-language-server',
  },
  '.js': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    installHint:
      'typescript-language-server is missing. Run: npm install -g typescript typescript-language-server',
  },
  '.jsx': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    installHint:
      'typescript-language-server is missing. Run: npm install -g typescript typescript-language-server',
  },
  '.mjs': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    installHint:
      'typescript-language-server is missing. Run: npm install -g typescript typescript-language-server',
  },
  '.cjs': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    installHint:
      'typescript-language-server is missing. Run: npm install -g typescript typescript-language-server',
  },
  '.mts': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    installHint:
      'typescript-language-server is missing. Run: npm install -g typescript typescript-language-server',
  },
  '.cts': {
    command: 'typescript-language-server',
    args: ['--stdio'],
    installHint:
      'typescript-language-server is missing. Run: npm install -g typescript typescript-language-server',
  },

  // Python
  '.py': {
    command: 'pyright-langserver',
    args: ['--stdio'],
    installHint: 'pyright is missing. Run: npm install -g pyright',
  },
  '.pyi': {
    command: 'pyright-langserver',
    args: ['--stdio'],
    installHint: 'pyright is missing. Run: npm install -g pyright',
  },

  // Go
  '.go': {
    command: 'gopls',
    args: [],
    installHint:
      'gopls is missing. Run: go install golang.org/x/tools/gopls@latest',
  },

  // Rust
  '.rs': {
    command: 'rust-analyzer',
    args: [],
    installHint:
      'rust-analyzer is missing. Run: rustup component add rust-analyzer',
  },

  // C / C++
  '.c': {
    command: 'clangd',
    args: [],
    installHint: 'clangd is missing. Install LLVM/Clang',
  },
  '.cpp': {
    command: 'clangd',
    args: [],
    installHint: 'clangd is missing. Install LLVM/Clang',
  },
  '.cc': {
    command: 'clangd',
    args: [],
    installHint: 'clangd is missing. Install LLVM/Clang',
  },
  '.cxx': {
    command: 'clangd',
    args: [],
    installHint: 'clangd is missing. Install LLVM/Clang',
  },
  '.c++': {
    command: 'clangd',
    args: [],
    installHint: 'clangd is missing. Install LLVM/Clang',
  },
  '.h': {
    command: 'clangd',
    args: [],
    installHint: 'clangd is missing. Install LLVM/Clang',
  },
  '.hpp': {
    command: 'clangd',
    args: [],
    installHint: 'clangd is missing. Install LLVM/Clang',
  },
  '.hh': {
    command: 'clangd',
    args: [],
    installHint: 'clangd is missing. Install LLVM/Clang',
  },
  '.hxx': {
    command: 'clangd',
    args: [],
    installHint: 'clangd is missing. Install LLVM/Clang',
  },
  '.h++': {
    command: 'clangd',
    args: [],
    installHint: 'clangd is missing. Install LLVM/Clang',
  },

  // Bash
  '.sh': {
    command: 'bash-language-server',
    args: ['start'],
    installHint:
      'bash-language-server is missing. Run: npm install -g bash-language-server',
  },
  '.bash': {
    command: 'bash-language-server',
    args: ['start'],
    installHint:
      'bash-language-server is missing. Run: npm install -g bash-language-server',
  },
  '.zsh': {
    command: 'bash-language-server',
    args: ['start'],
    installHint:
      'bash-language-server is missing. Run: npm install -g bash-language-server',
  },
  '.ksh': {
    command: 'bash-language-server',
    args: ['start'],
    installHint:
      'bash-language-server is missing. Run: npm install -g bash-language-server',
  },

  // Ruby
  '.rb': {
    command: 'solargraph',
    args: ['stdio'],
    installHint: 'solargraph is missing. Run: gem install solargraph',
  },
  '.rake': {
    command: 'solargraph',
    args: ['stdio'],
    installHint: 'solargraph is missing. Run: gem install solargraph',
  },
  '.gemspec': {
    command: 'solargraph',
    args: ['stdio'],
    installHint: 'solargraph is missing. Run: gem install solargraph',
  },
  '.ru': {
    command: 'solargraph',
    args: ['stdio'],
    installHint: 'solargraph is missing. Run: gem install solargraph',
  },

  // Java
  '.java': {
    command: 'jdtls',
    args: [],
    installHint:
      'Eclipse JDTLS is missing. Install the Eclipse JDT Language Server binary.',
  },

  // Lua
  '.lua': {
    command: 'lua-language-server',
    args: [],
    installHint:
      'lua-language-server is missing. Install it via your package manager.',
  },

  // PHP
  '.php': {
    command: 'intelephense',
    args: ['--stdio'],
    installHint: 'intelephense is missing. Run: npm install -g intelephense',
  },

  // YAML
  '.yaml': {
    command: 'yaml-language-server',
    args: ['--stdio'],
    installHint:
      'yaml-language-server is missing. Run: npm install -g yaml-language-server',
  },
  '.yml': {
    command: 'yaml-language-server',
    args: ['--stdio'],
    installHint:
      'yaml-language-server is missing. Run: npm install -g yaml-language-server',
  },

  // Astro
  '.astro': {
    command: 'astro-ls',
    args: ['--stdio'],
    installHint:
      'astro-ls is missing. Run: npm install -g @astrojs/language-server',
  },

  // C#
  '.cs': {
    command: 'csharp-ls',
    args: [],
    installHint:
      'csharp-ls is missing. Install .NET SDK and run: dotnet tool install --global csharp-ls',
  },

  // Clojure
  '.clj': {
    command: 'clojure-lsp',
    args: [],
    installHint: 'clojure-lsp is missing. Install it via your package manager.',
  },
  '.cljs': {
    command: 'clojure-lsp',
    args: [],
    installHint: 'clojure-lsp is missing. Install it via your package manager.',
  },
  '.cljc': {
    command: 'clojure-lsp',
    args: [],
    installHint: 'clojure-lsp is missing. Install it via your package manager.',
  },
  '.edn': {
    command: 'clojure-lsp',
    args: [],
    installHint: 'clojure-lsp is missing. Install it via your package manager.',
  },

  // Dart
  '.dart': {
    command: 'dart',
    args: ['language-server'],
    installHint:
      'dart language-server is missing. Ensure the Dart SDK is installed.',
  },

  // Elixir
  '.ex': {
    command: 'elixir-ls',
    args: [],
    installHint: 'elixir-ls is missing. Install it via your package manager.',
  },
  '.exs': {
    command: 'elixir-ls',
    args: [],
    installHint: 'elixir-ls is missing. Install it via your package manager.',
  },

  // F#
  '.fs': {
    command: 'fsautocomplete',
    args: [],
    installHint:
      'fsautocomplete is missing. Install .NET SDK and run: dotnet tool install --global fsautocomplete',
  },
  '.fsi': {
    command: 'fsautocomplete',
    args: [],
    installHint: 'fsautocomplete is missing.',
  },
  '.fsx': {
    command: 'fsautocomplete',
    args: [],
    installHint: 'fsautocomplete is missing.',
  },
  '.fsscript': {
    command: 'fsautocomplete',
    args: [],
    installHint: 'fsautocomplete is missing.',
  },

  // Gleam
  '.gleam': {
    command: 'gleam',
    args: ['lsp'],
    installHint: 'gleam is missing. Ensure the Gleam CLI is installed.',
  },

  // Haskell
  '.hs': {
    command: 'haskell-language-server-wrapper',
    args: ['--lsp'],
    installHint: 'haskell-language-server is missing. Install it via GHCup.',
  },
  '.lhs': {
    command: 'haskell-language-server-wrapper',
    args: ['--lsp'],
    installHint: 'haskell-language-server is missing. Install it via GHCup.',
  },

  // Julia
  '.jl': {
    command: 'julia',
    args: [
      '--startup-file=no',
      '--history-file=no',
      '-e',
      'using LanguageServer; runserver()',
    ],
    installHint:
      'LanguageServer.jl is missing. Install it in your Julia environment.',
  },

  // Kotlin
  '.kt': {
    command: 'kotlin-language-server',
    args: [],
    installHint:
      'kotlin-language-server is missing. Install it via your package manager.',
  },
  '.kts': {
    command: 'kotlin-language-server',
    args: [],
    installHint:
      'kotlin-language-server is missing. Install it via your package manager.',
  },

  // Nix
  '.nix': {
    command: 'nixd',
    args: [],
    installHint: 'nixd is missing. Install it via your Nix configuration.',
  },

  // OCaml
  '.ml': {
    command: 'ocamllsp',
    args: [],
    installHint: 'ocamllsp is missing. Run: opam install ocaml-lsp-server',
  },
  '.mli': {
    command: 'ocamllsp',
    args: [],
    installHint: 'ocamllsp is missing. Run: opam install ocaml-lsp-server',
  },

  // Prisma
  '.prisma': {
    command: 'prisma-language-server',
    args: ['--stdio'],
    installHint:
      'prisma-language-server is missing. Run: npm install -g @prisma/language-server',
  },

  // Swift / Objective-C (SourceKit)
  '.swift': {
    command: 'sourcekit-lsp',
    args: [],
    installHint:
      'sourcekit-lsp is missing. It is included with Xcode or the Swift toolchain.',
  },
  '.objc': {
    command: 'sourcekit-lsp',
    args: [],
    installHint:
      'sourcekit-lsp is missing. It is included with Xcode or the Swift toolchain.',
  },
  '.objcpp': {
    command: 'sourcekit-lsp',
    args: [],
    installHint:
      'sourcekit-lsp is missing. It is included with Xcode or the Swift toolchain.',
  },

  // Svelte
  '.svelte': {
    command: 'svelte-language-server',
    args: ['--stdio'],
    installHint:
      'svelte-language-server is missing. Run: npm install -g svelte-language-server',
  },

  // Terraform
  '.tf': {
    command: 'terraform-ls',
    args: ['serve'],
    installHint: 'terraform-ls is missing. Install it from HashiCorp releases.',
  },
  '.tfvars': {
    command: 'terraform-ls',
    args: ['serve'],
    installHint: 'terraform-ls is missing. Install it from HashiCorp releases.',
  },

  // Typst
  '.typ': {
    command: 'tinymist',
    args: ['lsp'],
    installHint:
      'tinymist is missing. Install it via cargo or your package manager.',
  },
  '.typc': {
    command: 'tinymist',
    args: ['lsp'],
    installHint:
      'tinymist is missing. Install it via cargo or your package manager.',
  },

  // Vue
  '.vue': {
    command: 'vue-language-server',
    args: ['--stdio'],
    installHint:
      'vue-language-server is missing. Run: npm install -g @vue/language-server',
  },

  // Zig
  '.zig': {
    command: 'zls',
    args: [],
    installHint: 'zls is missing. Install it from Zig releases.',
  },
  '.zon': {
    command: 'zls',
    args: [],
    installHint: 'zls is missing. Install it from Zig releases.',
  },
};

/**
 * A Singleton-like orchestrator that prevents spawning duplicate servers for the same project.
 * It maps file extensions to specific server binaries, checks if binaries exist in the user's $PATH,
 * and manages the lifecycle (caching and shutting down) of LspClient instances.
 */
export class LspServerManager {
  private clients: Map<string, LspClient> = new Map();

  constructor(private projectRoot: string) {}

  /**
   * Retrieves an active LSP client for the given file path.
   * Extracts the extension, looks up the required command, verifies the binary exists,
   * and if not cached, creates a new LspClient, initializes it, and caches it.
   *
   * @param filePath The absolute path to the file.
   * @returns A promise resolving to the LspClient instance for the file's language.
   * @throws Error if no language server is configured, or if the binary is missing.
   */
  async getClientForFile(filePath: string): Promise<LspClient> {
    const ext = extname(filePath);
    const config = DEFAULT_SERVERS[ext];

    if (!config) {
      throw new Error(
        `No language server configured for file extension: ${ext}`,
      );
    }

    if (this.clients.has(config.command)) {
      return this.clients.get(config.command)!;
    }

    // Check if command exists
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? 'where' : 'which';
    const checkResult = spawnSync(checkCmd, [config.command], {
      encoding: 'utf-8',
    });

    if (checkResult.status !== 0) {
      throw new Error(`[LSP Configuration Error]: ${config.installHint}`);
    }

    try {
      const client = new LspClient(
        config.command,
        config.args,
        this.projectRoot,
      );
      const rootUri = `file://${this.projectRoot}`;

      await client.initialize(rootUri);

      this.clients.set(config.command, client);
      return client;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      debugLogger.error(
        `Failed to initialize LSP client for ${config.command}: ${message}`,
      );
      throw new Error(
        `Failed to start language server ${config.command}: ${message}`,
      );
    }
  }

  /**
   * Iterates through cached clients, sending 'shutdown' requests and cleanly killing
   * the processes to prevent zombie Language Server processes from lingering.
   */
  async shutdownAll(): Promise<void> {
    for (const client of this.clients.values()) {
      try {
        await client.shutdown();
        client.kill();
      } catch (_e) {
        // Ignore shutdown errors
      }
    }
    this.clients.clear();
  }
}
