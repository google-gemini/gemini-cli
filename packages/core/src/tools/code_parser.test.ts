/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  Mocked,
} from 'vitest';
import { CodeParserTool, CodeParserToolParams } from './code_parser.js';
import { Config } from '../config/config.js';
import fs from 'fs/promises';
import { Stats, PathLike } from 'fs'; // Added Stats import
import path from 'path';
import os from 'os';
import actualFs from 'fs'; // For actual fs operations in setup

// Mock fs/promises
vi.mock('fs/promises');

// Mock tree-sitter and its language grammars
const mockTreeSitterParse = vi.fn();
const mockSetLanguage = vi.fn();

vi.mock('tree-sitter', () => ({
  default: vi.fn().mockImplementation(() => ({
    setLanguage: mockSetLanguage,
    parse: mockTreeSitterParse,
  })),
}));

const mockPythonGrammar = vi.hoisted(() => ({ name: 'python' }));
const mockJavaGrammar = vi.hoisted(() => ({ name: 'java' }));
const mockGoGrammar = vi.hoisted(() => ({ name: 'go' }));
const mockCSharpGrammar = vi.hoisted(() => ({ name: 'csharp' }));
const mockTypeScriptGrammar = vi.hoisted(() => ({ name: 'typescript' }));
const mockTSXGrammar = vi.hoisted(() => ({ name: 'tsx' }));
const mockRustGrammar = vi.hoisted(() => ({ name: 'rust' })); // Added for Rust

vi.mock('tree-sitter-python', () => ({ default: mockPythonGrammar }));
vi.mock('tree-sitter-java', () => ({ default: mockJavaGrammar }));
vi.mock('tree-sitter-go', () => ({ default: mockGoGrammar }));
vi.mock('tree-sitter-c-sharp', () => ({ default: mockCSharpGrammar }));
vi.mock('tree-sitter-typescript', () => ({
  default: {
    typescript: mockTypeScriptGrammar,
    tsx: mockTSXGrammar,
  },
}));
vi.mock('tree-sitter-rust', () => ({ default: mockRustGrammar })); // Added for Rust

describe('CodeParserTool', () => {
  let tempRootDir: string;
  let tool: CodeParserTool;
  let mockConfig: Config;
  const abortSignal = new AbortController().signal;

  // Use Mocked type for fs/promises
  let mockFs: Mocked<typeof fs>;

  beforeEach(() => {
    const tempDirPrefix = path.join(os.tmpdir(), 'code-parser-tool-root-');
    tempRootDir = actualFs.mkdtempSync(tempDirPrefix);
    tempRootDir = path.resolve(tempRootDir);

    mockConfig = { get: vi.fn() } as unknown as Config;
    tool = new CodeParserTool(tempRootDir, mockConfig);
    mockFs = fs as Mocked<typeof fs>;

    mockTreeSitterParse.mockReset();
    mockSetLanguage.mockReset();
    mockFs.stat.mockReset();
    mockFs.readFile.mockReset();
    mockFs.readdir.mockReset();

    mockTreeSitterParse.mockReturnValue({
      rootNode: { toString: () => '(mock_ast)' },
    });
  });

  afterEach(() => {
    if (actualFs.existsSync(tempRootDir)) {
      actualFs.rmSync(tempRootDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe('constructor and schema', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('code_parser');
    });

    it('should have correct schema definition', () => {
      const schema = tool.schema.parameters!;
      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('path');
      expect(schema.properties!.path.type).toBe('string');
      expect(schema.properties!.path.description).toContain('absolute path');
      expect(schema.properties).toHaveProperty('languages');
      expect(schema.properties!.languages.type).toBe('array');
      expect(schema.properties!.languages.description).toContain('go');
      expect(schema.properties!.languages.description).toContain('csharp');
      expect(schema.properties!.languages.description).toContain('typescript');
      expect(schema.properties!.languages.description).toContain('tsx');
      expect(schema.properties!.languages.description).toContain('javascript');
      expect(schema.properties!.languages.description).toContain('rust'); // Added for Rust
      expect(schema.required).toEqual(['path']);
    });
  });

  describe('validateToolParams', () => {
    it('should return null for valid path with languages', () => {
      const params: CodeParserToolParams = {
        path: path.join(tempRootDir, 'dir'),
        languages: [
          'python',
          'go',
          'csharp',
          'typescript',
          'tsx',
          'javascript',
        ],
      };
      expect(tool.validateToolParams(params)).toBeNull();
    });

    it('should return error for relative path', () => {
      const params: CodeParserToolParams = { path: 'file.py' };
      expect(tool.validateToolParams(params)).toMatch(/Path must be absolute/);
    });

    it('should return error for path outside root directory', () => {
      const outsidePath = path.resolve(
        os.tmpdir(),
        'some-other-dir',
        'file.py',
      );
      if (outsidePath.startsWith(tempRootDir)) {
        console.warn(
          'Skipping outside root test due to overlapping temp/outside paths',
        );
        return;
      }
      const params: CodeParserToolParams = { path: outsidePath };
      expect(tool.validateToolParams(params)).toMatch(
        /Path must be within the root directory/,
      );
    });

    it('should return error if languages is not an array of strings', () => {
      const params = {
        path: path.join(tempRootDir, 'file.py'),
        languages: [123],
      } as unknown as CodeParserToolParams;
      expect(tool.validateToolParams(params)).toBe(
        'Languages parameter must be an array of strings.',
      );
    });
  });

  describe('getDescription', () => {
    it('should return "Parse <shortened_relative_path>"', () => {
      const filePath = path.join(tempRootDir, 'src', 'app', 'main.py');
      const params: CodeParserToolParams = { path: filePath };
      expect(tool.getDescription(params)).toBe('Parse src/app/main.py');
    });
  });

  describe('execute', () => {
    // --- Error Handling Tests ---
    it('should return validation error if params are invalid', async () => {
      const params: CodeParserToolParams = { path: 'relative/path.txt' };
      const result = await tool.execute(params, abortSignal);
      expect(result.llmContent).toMatch(
        /Error: Invalid parameters provided. Reason: Path must be absolute/,
      );
      expect(result.returnDisplay).toBe('Error: Failed to execute tool.');
    });

    it('should return error if target path does not exist', async () => {
      const targetPath = path.join(tempRootDir, 'nonexistent.py');
      mockFs.stat.mockRejectedValue({
        code: 'ENOENT',
      } as NodeJS.ErrnoException);
      const params: CodeParserToolParams = { path: targetPath };
      const result = await tool.execute(params, abortSignal);
      expect(result.llmContent).toMatch(
        /Error: Path not found or inaccessible/,
      );
      expect(result.returnDisplay).toMatch(
        /Error: Path not found or inaccessible/,
      );
    });

    it('should return error if target path is not a file or directory', async () => {
      const targetPath = path.join(tempRootDir, 'neither_file_nor_dir');
      mockFs.stat.mockResolvedValue({
        isFile: () => false,
        isDirectory: () => false,
        size: 0,
      } as Stats);
      const params: CodeParserToolParams = { path: targetPath };
      const result = await tool.execute(params, abortSignal);
      expect(result.llmContent).toMatch(
        /Error: Path is not a file or directory/,
      );
      expect(result.returnDisplay).toMatch(
        /Error: Path is not a file or directory/,
      );
    });

    it('should return error if no supported languages are specified or available', async () => {
      const targetPath = path.join(tempRootDir, 'file.py');
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 100,
      } as Stats);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalGetLanguageParser = (tool as any).getLanguageParser;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (tool as any).getLanguageParser = vi.fn().mockReturnValue(undefined);

      const params: CodeParserToolParams = {
        path: targetPath,
        languages: ['fantasy-lang'],
      };
      const result = await tool.execute(params, abortSignal);
      expect(result.llmContent).toMatch(
        /Error: No supported languages specified for parsing/,
      );
      expect(result.returnDisplay).toMatch(
        /Error: No supported languages to parse/,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (tool as any).getLanguageParser = originalGetLanguageParser; // Restore
    });

    // --- Single File Parsing Tests ---
    it('should parse a single Python file successfully', async () => {
      const targetPath = path.join(tempRootDir, 'test.py');
      const fileContent = 'print("hello")';
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: fileContent.length,
      } as Stats);
      mockFs.readFile.mockResolvedValue(fileContent);
      mockTreeSitterParse.mockReturnValue({
        rootNode: { toString: () => '(python_ast)' },
      });

      const params: CodeParserToolParams = { path: targetPath };
      const result = await tool.execute(params, abortSignal);

      expect(mockSetLanguage).toHaveBeenCalledWith(mockPythonGrammar);
      expect(mockTreeSitterParse).toHaveBeenCalledWith(fileContent);
      expect(result.llmContent).toBe(
        `Parsed code from ${targetPath}:\n-------------${targetPath}-------------\n(python_ast)\n\n`,
      );
      expect(result.returnDisplay).toBe('Parsed 1 file(s).');
    });

    it('should parse a single Java file successfully', async () => {
      const targetPath = path.join(tempRootDir, 'Test.java');
      const fileContent = 'class Test {}';
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: fileContent.length,
      } as Stats);
      mockFs.readFile.mockResolvedValue(fileContent);
      mockTreeSitterParse.mockReturnValue({
        rootNode: { toString: () => '(java_ast)' },
      });

      const params: CodeParserToolParams = { path: targetPath };
      const result = await tool.execute(params, abortSignal);

      expect(mockSetLanguage).toHaveBeenCalledWith(mockJavaGrammar);
      expect(mockTreeSitterParse).toHaveBeenCalledWith(fileContent);
      expect(result.llmContent).toBe(
        `Parsed code from ${targetPath}:\n-------------${targetPath}-------------\n(java_ast)\n\n`,
      );
      expect(result.returnDisplay).toBe('Parsed 1 file(s).');
    });

    it('should parse a single Go file successfully', async () => {
      const targetPath = path.join(tempRootDir, 'main.go');
      const fileContent = 'package main\nfunc main(){}';
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: fileContent.length,
      } as Stats);
      mockFs.readFile.mockResolvedValue(fileContent);
      mockTreeSitterParse.mockReturnValue({
        rootNode: { toString: () => '(go_ast)' },
      });

      const params: CodeParserToolParams = { path: targetPath };
      const result = await tool.execute(params, abortSignal);

      expect(mockSetLanguage).toHaveBeenCalledWith(mockGoGrammar);
      expect(mockTreeSitterParse).toHaveBeenCalledWith(fileContent);
      expect(result.llmContent).toBe(
        `Parsed code from ${targetPath}:\n-------------${targetPath}-------------\n(go_ast)\n\n`,
      );
      expect(result.returnDisplay).toBe('Parsed 1 file(s).');
    });

    it('should parse a single C# file successfully', async () => {
      const targetPath = path.join(tempRootDir, 'Program.cs');
      const fileContent =
        'namespace HelloWorld { class Program { static void Main(string[] args) { System.Console.WriteLine("Hello World!"); } } }';
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: fileContent.length,
      } as Stats);
      mockFs.readFile.mockResolvedValue(fileContent);
      mockTreeSitterParse.mockReturnValue({
        rootNode: { toString: () => '(csharp_ast)' },
      });

      const params: CodeParserToolParams = { path: targetPath };
      const result = await tool.execute(params, abortSignal);

      expect(mockSetLanguage).toHaveBeenCalledWith(mockCSharpGrammar);
      expect(mockTreeSitterParse).toHaveBeenCalledWith(fileContent);
      expect(result.llmContent).toBe(
        `Parsed code from ${targetPath}:\n-------------${targetPath}-------------\n(csharp_ast)\n\n`,
      );
      expect(result.returnDisplay).toBe('Parsed 1 file(s).');
    });

    it('should parse a single TypeScript (.ts) file successfully', async () => {
      const targetPath = path.join(tempRootDir, 'app.ts');
      const fileContent = 'const x: number = 10;';
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: fileContent.length,
      } as Stats);
      mockFs.readFile.mockResolvedValue(fileContent);
      mockTreeSitterParse.mockReturnValue({
        rootNode: { toString: () => '(ts_ast)' },
      });

      const params: CodeParserToolParams = { path: targetPath };
      const result = await tool.execute(params, abortSignal);

      expect(mockSetLanguage).toHaveBeenCalledWith(mockTypeScriptGrammar);
      expect(mockTreeSitterParse).toHaveBeenCalledWith(fileContent);
      expect(result.llmContent).toBe(
        `Parsed code from ${targetPath}:\n-------------${targetPath}-------------\n(ts_ast)\n\n`,
      );
      expect(result.returnDisplay).toBe('Parsed 1 file(s).');
    });

    it('should parse a single TSX (.tsx) file successfully', async () => {
      const targetPath = path.join(tempRootDir, 'component.tsx');
      const fileContent = 'const Comp = () => <div />;';
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: fileContent.length,
      } as Stats);
      mockFs.readFile.mockResolvedValue(fileContent);
      mockTreeSitterParse.mockReturnValue({
        rootNode: { toString: () => '(tsx_ast)' },
      });

      const params: CodeParserToolParams = { path: targetPath };
      const result = await tool.execute(params, abortSignal);

      expect(mockSetLanguage).toHaveBeenCalledWith(mockTSXGrammar);
      expect(mockTreeSitterParse).toHaveBeenCalledWith(fileContent);
      expect(result.llmContent).toBe(
        `Parsed code from ${targetPath}:\n-------------${targetPath}-------------\n(tsx_ast)\n\n`,
      );
      expect(result.returnDisplay).toBe('Parsed 1 file(s).');
    });

    it('should parse a single JavaScript (.js) file successfully', async () => {
      const targetPath = path.join(tempRootDir, 'script.js');
      const fileContent = 'console.log("hello");';
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: fileContent.length,
      } as Stats);
      mockFs.readFile.mockResolvedValue(fileContent);
      mockTreeSitterParse.mockReturnValue({
        rootNode: { toString: () => '(js_ast)' },
      });

      const params: CodeParserToolParams = { path: targetPath };
      const result = await tool.execute(params, abortSignal);

      expect(mockSetLanguage).toHaveBeenCalledWith(mockTypeScriptGrammar); // Uses TypeScript grammar for JS
      expect(mockTreeSitterParse).toHaveBeenCalledWith(fileContent);
      expect(result.llmContent).toBe(
        `Parsed code from ${targetPath}:\n-------------${targetPath}-------------\n(js_ast)\n\n`,
      );
      expect(result.returnDisplay).toBe('Parsed 1 file(s).');
    });

    it('should parse a single Rust (.rs) file successfully', async () => {
      const targetPath = path.join(tempRootDir, 'main.rs');
      const fileContent = 'fn main() { println!("Hello, Rust!"); }';
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: fileContent.length,
      } as Stats);
      mockFs.readFile.mockResolvedValue(fileContent);
      mockTreeSitterParse.mockReturnValue({
        rootNode: { toString: () => '(rust_ast)' },
      });

      const params: CodeParserToolParams = { path: targetPath };
      const result = await tool.execute(params, abortSignal);

      expect(mockSetLanguage).toHaveBeenCalledWith(mockRustGrammar);
      expect(mockTreeSitterParse).toHaveBeenCalledWith(fileContent);
      expect(result.llmContent).toBe(
        `Parsed code from ${targetPath}:\n-------------${targetPath}-------------\n(rust_ast)\n\n`,
      );
      expect(result.returnDisplay).toBe('Parsed 1 file(s).');
    });

    it('should parse a JavaScript JSX (.jsx) file successfully (using tsx parser)', async () => {
      const targetPath = path.join(tempRootDir, 'component.jsx');
      const fileContent = 'const Comp = () => <div />;';
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: fileContent.length,
      } as Stats);
      mockFs.readFile.mockResolvedValue(fileContent);
      mockTreeSitterParse.mockReturnValue({
        rootNode: { toString: () => '(jsx_ast)' },
      });

      const params: CodeParserToolParams = { path: targetPath };
      const result = await tool.execute(params, abortSignal);

      expect(mockSetLanguage).toHaveBeenCalledWith(mockTSXGrammar);
      expect(mockTreeSitterParse).toHaveBeenCalledWith(fileContent);
      expect(result.llmContent).toBe(
        `Parsed code from ${targetPath}:\n-------------${targetPath}-------------\n(jsx_ast)\n\n`,
      );
      expect(result.returnDisplay).toBe('Parsed 1 file(s).');
    });

    it('should return error for unsupported file type if specified directly', async () => {
      const targetPath = path.join(tempRootDir, 'notes.txt');
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 10,
      } as Stats);

      const params: CodeParserToolParams = { path: targetPath };
      const result = await tool.execute(params, abortSignal);

      expect(result.llmContent).toMatch(
        /Error: File .* is not of a supported language type/,
      );
      expect(result.returnDisplay).toMatch(
        /Error: Unsupported file type or language/,
      );
    });

    it('should skip file if it exceeds maxFileSize', async () => {
      const targetPath = path.join(tempRootDir, 'large.py');
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024 * 1024 + 1,
      } as Stats); // 1MB + 1 byte

      const params: CodeParserToolParams = { path: targetPath };
      const result = await tool.execute(params, abortSignal);

      expect(mockFs.readFile).not.toHaveBeenCalled();
      expect(result.llmContent).toMatch(
        /Error: Could not parse file .*large.py/,
      );
      expect(result.returnDisplay).toBe('Error: Failed to parse file.');
    });

    it('should return error if parsing a supported file fails internally', async () => {
      const targetPath = path.join(tempRootDir, 'broken.py');
      const fileContent = 'print("hello")';
      mockFs.stat.mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: fileContent.length,
      } as Stats);
      mockFs.readFile.mockResolvedValue(fileContent);
      mockTreeSitterParse.mockImplementation(() => {
        throw new Error('TreeSitterCrashed');
      });

      const params: CodeParserToolParams = { path: targetPath };
      const result = await tool.execute(params, abortSignal);

      expect(result.llmContent).toMatch(
        /Error: Could not parse file .*broken.py/,
      );
      expect(result.returnDisplay).toMatch(/Error: Failed to parse file./);
    });

    // --- Directory Parsing Tests ---
    it('should parse supported files in a directory (including Go, C#, TS, JS, TSX)', async () => {
      const dirPath = path.join(tempRootDir, 'src');
      const files = [
        'main.py',
        'helper.java',
        'service.go',
        'App.cs',
        'logic.ts',
        'ui.tsx',
        'utils.js',
        'main.rs', // Added Rust file
        'config.txt',
      ];
      const pythonContent = 'import os';
      const javaContent = 'public class Helper {}';
      const goContent = 'package main';
      const csharpContent = 'public class App {}';
      const tsContent = 'let val: number = 1;';
      const tsxContent = 'const MyComp = () => <p />;';
      const jsContent = 'function hello() {}';
      const rustContent = 'fn start() {}'; // Added Rust content

      mockFs.stat.mockImplementation(async (p) => {
        if (p === dirPath)
          return { isFile: () => false, isDirectory: () => true } as Stats;
        if (p === path.join(dirPath, 'main.py'))
          return {
            isFile: () => true,
            isDirectory: () => false,
            size: pythonContent.length,
          } as Stats;
        if (p === path.join(dirPath, 'helper.java'))
          return {
            isFile: () => true,
            isDirectory: () => false,
            size: javaContent.length,
          } as Stats;
        if (p === path.join(dirPath, 'service.go'))
          return {
            isFile: () => true,
            isDirectory: () => false,
            size: goContent.length,
          } as Stats;
        if (p === path.join(dirPath, 'App.cs'))
          return {
            isFile: () => true,
            isDirectory: () => false,
            size: csharpContent.length,
          } as Stats;
        if (p === path.join(dirPath, 'logic.ts'))
          return {
            isFile: () => true,
            isDirectory: () => false,
            size: tsContent.length,
          } as Stats;
        if (p === path.join(dirPath, 'ui.tsx'))
          return {
            isFile: () => true,
            isDirectory: () => false,
            size: tsxContent.length,
          } as Stats;
        if (p === path.join(dirPath, 'utils.js'))
          return {
            isFile: () => true,
            isDirectory: () => false,
            size: jsContent.length,
          } as Stats;
        if (p === path.join(dirPath, 'main.rs'))
          // Added for Rust
          return {
            isFile: () => true,
            isDirectory: () => false,
            size: rustContent.length,
          } as Stats;
        if (p === path.join(dirPath, 'config.txt'))
          return {
            isFile: () => true,
            isDirectory: () => false,
            size: 10,
          } as Stats;
        throw { code: 'ENOENT' };
      });
      mockFs.readdir.mockImplementation(
        vi.fn(async (p: PathLike): Promise<string[]> => {
          const dirPath = path.join(tempRootDir, 'src'); // Path for this specific test
          if (p === dirPath) {
            return files; // files is in scope for this test
          }
          throw new Error(
            `fs.readdir mock: Unhandled path ${p} in test 'should parse supported files in a directory'`,
          );
        }) as unknown as typeof fs.readdir,
      );
      mockFs.readFile.mockImplementation(async (p) => {
        if (p === path.join(dirPath, 'main.py')) return pythonContent;
        if (p === path.join(dirPath, 'helper.java')) return javaContent;
        if (p === path.join(dirPath, 'service.go')) return goContent;
        if (p === path.join(dirPath, 'App.cs')) return csharpContent;
        if (p === path.join(dirPath, 'logic.ts')) return tsContent;
        if (p === path.join(dirPath, 'ui.tsx')) return tsxContent;
        if (p === path.join(dirPath, 'utils.js')) return jsContent;
        if (p === path.join(dirPath, 'main.rs')) return rustContent; // Added for Rust
        return '';
      });
      mockTreeSitterParse.mockImplementation((content) => {
        if (content === pythonContent)
          return { rootNode: { toString: () => '(py_ast_dir)' } };
        if (content === javaContent)
          return { rootNode: { toString: () => '(java_ast_dir)' } };
        if (content === goContent)
          return { rootNode: { toString: () => '(go_ast_dir)' } };
        if (content === csharpContent)
          return { rootNode: { toString: () => '(csharp_ast_dir)' } };
        if (content === tsContent)
          return { rootNode: { toString: () => '(ts_ast_dir)' } };
        if (content === tsxContent)
          return { rootNode: { toString: () => '(tsx_ast_dir)' } };
        if (content === jsContent)
          return { rootNode: { toString: () => '(js_ast_dir)' } };
        if (content === rustContent)
          // Added for Rust
          return { rootNode: { toString: () => '(rust_ast_dir)' } };
        return { rootNode: { toString: () => '(other_ast)' } };
      });

      const params: CodeParserToolParams = { path: dirPath };
      const result = await tool.execute(params, abortSignal);

      expect(result.llmContent).toContain(
        `-------------${path.join(dirPath, 'main.py')}-------------\n(py_ast_dir)\n`,
      );
      expect(result.llmContent).toContain(
        `-------------${path.join(dirPath, 'helper.java')}-------------\n(java_ast_dir)\n`,
      );
      expect(result.llmContent).toContain(
        `-------------${path.join(dirPath, 'service.go')}-------------\n(go_ast_dir)\n`,
      );
      expect(result.llmContent).toContain(
        `-------------${path.join(dirPath, 'App.cs')}-------------\n(csharp_ast_dir)\n`,
      );
      expect(result.llmContent).toContain(
        `-------------${path.join(dirPath, 'logic.ts')}-------------\n(ts_ast_dir)\n`,
      );
      expect(result.llmContent).toContain(
        `-------------${path.join(dirPath, 'ui.tsx')}-------------\n(tsx_ast_dir)\n`,
      );
      expect(result.llmContent).toContain(
        `-------------${path.join(dirPath, 'utils.js')}-------------\n(js_ast_dir)\n`,
      );
      expect(result.llmContent).toContain(
        // Added for Rust
        `-------------${path.join(dirPath, 'main.rs')}-------------\n(rust_ast_dir)\n`,
      );
      expect(result.llmContent).not.toContain('config.txt');
      expect(result.returnDisplay).toBe('Parsed 8 file(s).'); // Updated count
    });

    it('should only parse languages specified in the languages parameter for directory', async () => {
      const dirPath = path.join(tempRootDir, 'mixed_lang_project');
      const files = [
        'script.py',
        'Main.java',
        'another.py',
        'app.go',
        'Logic.cs',
        'index.ts',
        'view.tsx',
        'helper.js',
        'main.rs', // Added Rust file
      ];
      mockFs.stat.mockImplementation(async (p) => {
        if (p === dirPath)
          return { isFile: () => false, isDirectory: () => true } as Stats;
        return {
          isFile: () => true,
          isDirectory: () => false,
          size: 10,
        } as Stats;
      });
      mockFs.readdir.mockImplementation(
        vi.fn(async (p: PathLike): Promise<string[]> => {
          // dirPath and files are in scope for this specific test
          if (p === dirPath) {
            return files;
          }
          throw new Error(
            `fs.readdir mock: Unhandled path ${p} in test 'should only parse languages specified'`,
          );
        }) as unknown as typeof fs.readdir,
      );
      mockFs.readFile.mockResolvedValue('content');

      const params: CodeParserToolParams = {
        path: dirPath,
        languages: [
          'java',
          'go',
          'csharp',
          'typescript',
          'tsx',
          'javascript',
          'rust',
        ], // Added rust
      };
      const result = await tool.execute(params, abortSignal);

      expect(result.llmContent).toContain(path.join(dirPath, 'Main.java'));
      expect(result.llmContent).toContain(path.join(dirPath, 'app.go'));
      expect(result.llmContent).toContain(path.join(dirPath, 'Logic.cs'));
      expect(result.llmContent).toContain(path.join(dirPath, 'index.ts'));
      expect(result.llmContent).toContain(path.join(dirPath, 'view.tsx'));
      expect(result.llmContent).toContain(path.join(dirPath, 'helper.js'));
      expect(result.llmContent).toContain(path.join(dirPath, 'main.rs')); // Added for Rust
      expect(result.llmContent).not.toContain('script.py');
      expect(result.llmContent).not.toContain('another.py');
      expect(result.returnDisplay).toBe('Parsed 7 file(s).'); // Updated count
    });

    it('should return "Directory is empty" for an empty directory', async () => {
      const dirPath = path.join(tempRootDir, 'empty_dir');
      mockFs.stat.mockResolvedValue({
        isFile: () => false,
        isDirectory: () => true,
      } as Stats);
      mockFs.readdir.mockResolvedValue([]);

      const params: CodeParserToolParams = { path: dirPath };
      const result = await tool.execute(params, abortSignal);

      expect(result.llmContent).toBe(`Directory ${dirPath} is empty.`);
      expect(result.returnDisplay).toBe('Directory is empty.');
    });

    it('should handle error if fs.readdir fails', async () => {
      const dirPath = path.join(tempRootDir, 'unreadable_dir');
      mockFs.stat.mockResolvedValue({
        isFile: () => false,
        isDirectory: () => true,
      } as Stats);
      mockFs.readdir.mockRejectedValue(new Error('Permission denied'));

      const params: CodeParserToolParams = { path: dirPath };
      const result = await tool.execute(params, abortSignal);

      expect(result.llmContent).toMatch(
        /Error listing or processing directory/,
      );
      expect(result.returnDisplay).toMatch(
        /Error: Failed to process directory./,
      );
    });
  });

  describe('requiresConfirmation', () => {
    it('should return null', async () => {
      const params: CodeParserToolParams = { path: 'anypath' };
      expect(await tool.requiresConfirmation(params)).toBeNull();
    });
  });
});
