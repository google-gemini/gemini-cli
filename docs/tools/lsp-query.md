# LSP query tool

The `lsp_query` tool enables the Gemini model to perform semantic code analysis
using the Language Server Protocol (LSP). It allows the agent to go beyond
text-based searches and understand code structures, definitions, and
relationships across various programming languages.

## Technical reference

The `lsp_query` tool communicates with locally installed Language Servers via
JSON-RPC 2.0 over standard I/O (stdio).

### `lsp_query`

Executes a semantic query (definition, references, hover, or symbols) on a
specific file.

- **Tool name:** `lsp_query`
- **Display name:** LSP Query
- **Arguments:**
  - `operation` (string, required): The semantic operation to perform. Supported
    values:
    - `definition`: Find the source definition of a symbol.
    - `references`: Find all usages of a symbol.
    - `hover`: Get type information and documentation for a symbol.
    - `documentSymbols`: List all symbols (classes, functions, etc.) defined in
      the file.
  - `file_path` (string, required): The relative path to the target file.
  - `line` (number, optional): The 0-based line number (required for
    `definition`, `references`, and `hover`).
  - `character` (number, optional): The 0-based character offset (required for
    `definition`, `references`, and `hover`).

## Supported languages

The tool automatically detects and spawns the appropriate Language Server based
on the file extension.

| Language            | Extensions                                                               | Required Binary                   |
| :------------------ | :----------------------------------------------------------------------- | :-------------------------------- |
| **Astro**           | `.astro`                                                                 | `astro-ls`                        |
| **Bash**            | `.sh`, `.bash`, `.zsh`, `.ksh`                                           | `bash-language-server`            |
| **C / C++**         | `.c`, `.cpp`, `.cc`, `.cxx`, `.c++`, `.h`, `.hpp`, `.hh`, `.hxx`, `.h++` | `clangd`                          |
| **C#**              | `.cs`                                                                    | `csharp-ls`                       |
| **Clojure**         | `.clj`, `.cljs`, `.cljc`, `.edn`                                         | `clojure-lsp`                     |
| **Dart**            | `.dart`                                                                  | `dart`                            |
| **Elixir**          | `.ex`, `.exs`                                                            | `elixir-ls`                       |
| **F#**              | `.fs`, `.fsi`, `.fsx`, `.fsscript`                                       | `fsautocomplete`                  |
| **Gleam**           | `.gleam`                                                                 | `gleam`                           |
| **Go**              | `.go`                                                                    | `gopls`                           |
| **Haskell**         | `.hs`, `.lhs`                                                            | `haskell-language-server-wrapper` |
| **Java**            | `.java`                                                                  | `jdtls`                           |
| **Julia**           | `.jl`                                                                    | `julia`                           |
| **Kotlin**          | `.kt`, `.kts`                                                            | `kotlin-language-server`          |
| **Lua**             | `.lua`                                                                   | `lua-language-server`             |
| **Nix**             | `.nix`                                                                   | `nixd`                            |
| **OCaml**           | `.ml`, `.mli`                                                            | `ocamllsp`                        |
| **PHP**             | `.php`                                                                   | `intelephense`                    |
| **Prisma**          | `.prisma`                                                                | `prisma-language-server`          |
| **Python**          | `.py`, `.pyi`                                                            | `pyright-langserver`              |
| **Ruby**            | `.rb`, `.rake`, `.gemspec`, `.ru`                                        | `solargraph`                      |
| **Rust**            | `.rs`                                                                    | `rust-analyzer`                   |
| **Svelte**          | `.svelte`                                                                | `svelte-language-server`          |
| **Swift/Obj-C**     | `.swift`, `.objc`, `.objcpp`                                             | `sourcekit-lsp`                   |
| **Terraform**       | `.tf`, `.tfvars`                                                         | `terraform-ls`                    |
| **TypeScript / JS** | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.mts`, `.cts`             | `typescript-language-server`      |
| **Typst**           | `.typ`, `.typc`                                                          | `tinymist`                        |
| **Vue**             | `.vue`                                                                   | `vue-language-server`             |
| **YAML**            | `.yaml`, `.yml`                                                          | `yaml-language-server`            |
| **Zig**             | `.zig`, `.zon`                                                           | `zls`                             |

**Note:** The corresponding language server binary must be installed and
available in your system's `$PATH`.

## Configuration

The `lsp_query` tool is enabled by default. Its availability is influenced by
project-wide security policies.

### Security policies

The `lsp_query` tool is classified as a **read-only** tool. It is allowed in the
following standard policies:

- `read-only.toml`
- `plan.toml` (allowing the agent to perform deep research during the planning
  phase)

## Implementation notes (for maintainers)

### Adding new languages

To support a new language, update the `DEFAULT_SERVERS` dictionary in
`packages/core/src/lsp/LspServerManager.ts` with the file extension, command
name, and installation hint.

### Process management

The `LspServerManager` ensures that only one instance of a language server is
spawned per language for the entire workspace. To prevent zombie processes,
ensure `globalLspManager.shutdownAll()` is called during the CLI's shutdown
sequence (e.g., in `AppContainer` or SIGINT handlers).
