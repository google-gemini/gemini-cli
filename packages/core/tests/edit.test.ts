import { EditTool } from '../src/tools/edit';
import { Config } from '../src/config/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { shellTool } from '../src/tools/shell';

// Mock the fs module to control file system operations during tests
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(), // Mock appendFileSync for logging
  };
});

// Mock the logger to prevent console output during tests
vi.mock('../src/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the GeminiClient to prevent actual API calls
vi.mock('../src/core/client', () => ({
  GeminiClient: vi.fn(() => ({
    generateContent: vi.fn(),
  })),
}));

// Mock shellTool for termux-toast
vi.mock('../src/tools/shell', () => ({
  shellTool: {
    run: vi.fn(),
  },
}));

describe('EditTool Decorator Replacement and Error Logging', () => {
  let config: Config;
  let editTool: EditTool;
  const testFilePath = '/data/data/com.termux/files/home/pyrm-cli/test_file.py';
  const errorLogPath = '/data/data/com.termux/files/home/pyrm-cli/logs/edit_errors.log';

  beforeEach(() => {
    config = new Config();
    editTool = new EditTool(config);
    vi.clearAllMocks();

    // Set up mock file system behavior
    (fs.existsSync as vi.Mock).mockReturnValue(true);
    (fs.readFileSync as vi.Mock).mockReturnValue('@old_decorator\nclass MyClass:\n    pass');
  });

  it('should replace a decorator using regex with whitespace variations', async () => {
    const oldContent = '@old_decorator\nclass MyClass:\n    pass';
    const newContent = '@new_decorator\nclass MyClass:\n    pass';

    (fs.readFileSync as vi.Mock).mockReturnValueOnce(oldContent);

    const params = {
      file_path: testFilePath,
      old_string: '@\\s*old_decorator',
      new_string: '@new_decorator',
      use_regex: true,
      expected_replacements: 1,
    };

    const result = await editTool.execute(params, new AbortController().signal);

    expect(fs.writeFileSync).toHaveBeenCalledWith(testFilePath, newContent, 'utf8');
    expect(result.llmContent).toContain('Successfully modified file');
    expect(result.llmContent).toContain('1 replacements');
  });

  it('should return an error if regex pattern is invalid', async () => {
    const params = {
      file_path: testFilePath,
      old_string: '[',
      new_string: '@new_decorator',
      use_regex: true,
      expected_replacements: 1,
    };

    const result = await editTool.execute(params, new AbortController().signal);

    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(result.llmContent).toContain('Error: Invalid parameters provided. Reason: Invalid regex pattern for old_string');
  });

  it('should return an error if old_string is not found with regex and log the error', async () => {
    const oldContent = '@another_decorator\nclass MyClass:\n    pass';
    (fs.readFileSync as vi.Mock).mockReturnValueOnce(oldContent);

    const params = {
      file_path: testFilePath,
      old_string: '@\\s*non_existent_decorator',
      new_string: '@new_decorator',
      use_regex: true,
      expected_replacements: 1,
    };

    const result = await editTool.execute(params, new AbortController().signal);

    expect(fs.writeFileSync).not.toHaveBeenCalled();
    expect(result.llmContent).toContain('Error: Failed to edit, could not find the string to replace.');
    expect(fs.appendFileSync).toHaveBeenCalledWith(errorLogPath, expect.stringContaining('Failed edit for'), 'utf8');
    expect(shellTool.run).toHaveBeenCalledWith({
      command: expect.stringContaining('termux-toast'),
    });
  });
});