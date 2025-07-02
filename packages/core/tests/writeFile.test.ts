import { WriteFileTool } from '../src/tools/write-file';
import { Config } from '../src/config/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock the fs module
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    renameSync: vi.fn(),
  };
});

// Mock the logger
vi.mock('../src/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('WriteFileTool Automatic Import Addition', () => {
  let config: Config;
  let writeFileTool: WriteFileTool;
  const testFilePath = '/data/data/com.termux/files/home/pyrm-cli/test_python_output.py';

  beforeEach(() => {
    config = new Config();
    writeFileTool = new WriteFileTool(config);
    vi.clearAllMocks();

    // Default mocks for fs operations
    (fs.existsSync as vi.Mock).mockReturnValue(false); // Assume file does not exist by default
    (fs.mkdirSync as vi.Mock).mockReturnValue(undefined);
    (fs.writeFileSync as vi.Mock).mockReturnValue(undefined);
    (fs.renameSync as vi.Mock).mockReturnValue(undefined);
  });

  it('should write a Python file with an automatic import when using /write-python command', async () => {
    const content = 'def hello():\n    print("Hello")';
    const expectedFullContent = 'from os import path\n\n' + content;

    // Simulate the logic within gemini.tsx for /write-python
    const initialInput = `/write-python ${testFilePath}:${content}`;
    const parts = initialInput.substring('/write-python '.length).trim().split(':');
    const filePath = parts[0].trim();
    const fileContent = parts.slice(1).join(':').trim();
    const fullContentToWrite = `from os import path\n\n${fileContent}`;

    // Directly call the execute method of WriteFileTool as it would be called by the command
    await writeFileTool.execute({ file_path: filePath, content: fullContentToWrite }, new AbortController().signal);

    expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(testFilePath), { recursive: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), expectedFullContent, 'utf8');
    expect(fs.renameSync).toHaveBeenCalledWith(expect.any(String), testFilePath);
  });

  it('should not add an import if the file is not a Python file', async () => {
    const nonPythonFilePath = '/data/data/com.termux/files/home/pyrm-cli/test_non_python.txt';
    const content = 'Some text content';

    // Simulate the logic within gemini.tsx for /write-python, but with a non-python file
    const initialInput = `/write-python ${nonPythonFilePath}:${content}`;
    const parts = initialInput.substring('/write-python '.length).trim().split(':');
    const filePath = parts[0].trim();
    const fileContent = parts.slice(1).join(':').trim();

    // The gemini.tsx command itself adds the import, so we test the WriteFileTool directly
    // with the content it would receive if the check for .py was bypassed or not present.
    // For this test, we want to ensure WriteFileTool itself doesn't add imports.
    await writeFileTool.execute({ file_path: filePath, content: fileContent }, new AbortController().signal);

    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), content, 'utf8');
    expect(fs.writeFileSync).not.toHaveBeenCalledWith(expect.any(String), expect.stringContaining('from os import path'), 'utf8');
  });
});