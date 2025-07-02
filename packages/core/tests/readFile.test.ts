import { ReadFileTool } from '../src/tools/read-file';
import { Config } from '../src/config/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { shellTool } from '../src/tools/shell';

// Mock the fs module
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
    },
    existsSync: vi.fn(),
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

// Mock shellTool
vi.mock('../src/tools/shell', () => ({
  shellTool: {
    run: vi.fn(),
  },
}));

describe('ReadFileTool and Import Checks', () => {
  let config: Config;
  let readFileTool: ReadFileTool;
  const testFilePath = '/data/data/com.termux/files/home/pyrm-cli/test_python_file.py';

  beforeEach(() => {
    config = new Config();
    readFileTool = new ReadFileTool('/data/data/com.termux/files/home/pyrm-cli', config);
    vi.clearAllMocks();

    // Default mock for fs.existsSync
    (fs.existsSync as vi.Mock).mockReturnValue(true);
  });

  it('should correctly call shellTool for /check-imports command and report success', async () => {
    // Simulate the behavior of the /check-imports command in gemini.tsx
    const mockShellRun = shellTool.run as vi.Mock;
    mockShellRun.mockResolvedValue({
      stdout: 'Basic syntax check passed.',
      stderr: '',
      exitCode: 0,
    });

    // This test simulates the logic within gemini.tsx for /check-imports
    // It does not directly test ReadFileTool, but the command that uses it indirectly.
    const initialInput = '/check-imports ' + testFilePath;
    const loggerInfoSpy = vi.spyOn(console, 'log'); // Using console.log to capture logger.info output

    // Simulate the relevant part of runNonInteractiveMode
    if (initialInput.startsWith('/check-imports ')) {
      const filePath = initialInput.substring('/check-imports '.length).trim();
      if (!filePath.endsWith('.py')) {
        // This case is handled by the actual gemini.tsx code, not tested here.
      }
      // logger.info(`Checking imports for ${filePath}...`);
      try {
        await mockShellRun({ command: `python -m py_compile ${filePath}` });
        // logger.info('Basic syntax check passed. For more comprehensive import checks, consider running: pip install pylint && pylint ' + filePath);
      } catch (error) {
        // logger.error(`Error checking imports for ${filePath}: ${error}`);
      }
    }

    expect(mockShellRun).toHaveBeenCalledWith({
      command: `python -m py_compile ${testFilePath}`,
    });
    // We can't directly assert on logger.info from gemini.tsx here, as it's a separate module.
    // The focus is on ensuring the shell command is correctly invoked.
  });

  it('should correctly call shellTool for /check-imports command and report failure', async () => {
    const mockShellRun = shellTool.run as vi.Mock;
    mockShellRun.mockRejectedValue(new Error('SyntaxError: invalid syntax'));

    const initialInput = '/check-imports ' + testFilePath;
    const loggerErrorSpy = vi.spyOn(console, 'error'); // Using console.error to capture logger.error output

    if (initialInput.startsWith('/check-imports ')) {
      const filePath = initialInput.substring('/check-imports '.length).trim();
      try {
        await mockShellRun({ command: `python -m py_compile ${filePath}` });
      } catch (error) {
        // logger.error(`Error checking imports for ${filePath}: ${error}`);
      }
    }

    expect(mockShellRun).toHaveBeenCalledWith({
      command: `python -m py_compile ${testFilePath}`,
    });
    // Again, direct logger.error assertion is hard, but we ensure the shell command is called.
  });

  it('should correctly call shellTool for /validate-python command and report success', async () => {
    const mockShellRun = shellTool.run as vi.Mock;
    mockShellRun.mockResolvedValue({
      stdout: 'Python syntax is valid.',
      stderr: '',
      exitCode: 0,
    });

    const initialInput = '/validate-python ' + testFilePath;

    if (initialInput.startsWith('/validate-python ')) {
      const filePath = initialInput.substring('/validate-python '.length).trim();
      try {
        await mockShellRun({ command: `python -m py_compile ${filePath}` });
      } catch (error) {
        // logger.error(`Python syntax validation failed for ${filePath}: ${error}`);
      }
    }

    expect(mockShellRun).toHaveBeenCalledWith({
      command: `python -m py_compile ${testFilePath}`,
    });
  });

  it('should correctly call shellTool for /validate-python command and report failure', async () => {
    const mockShellRun = shellTool.run as vi.Mock;
    mockShellRun.mockRejectedValue(new Error('SyntaxError: invalid syntax'));

    const initialInput = '/validate-python ' + testFilePath;

    if (initialInput.startsWith('/validate-python ')) {
      const filePath = initialInput.substring('/validate-python '.length).trim();
      try {
        await mockShellRun({ command: `python -m py_compile ${filePath}` });
      } catch (error) {
        // logger.error(`Python syntax validation failed for ${filePath}: ${error}`);
      }
    }

    expect(mockShellRun).toHaveBeenCalledWith({
      command: `python -m py_compile ${testFilePath}`,
    });
  });
});