import fs from 'fs/promises';
import { readFileTool, ReadFileArgs } from './readFile'; // Tool to be tested
import { logger } from '../utils/logger'; // Mocked logger

// Mock the fs/promises module
jest.mock('fs/promises');
// Mock the logger module (actual mock would be in __mocks__)
jest.mock('../utils/logger');

describe('readFileTool', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockLogger = logger as jest.Mocked<typeof logger>;

  beforeEach(() => {
    // Clear all mock instances and calls before each test
    jest.clearAllMocks();
  });

  it('should have a name and description', () => {
    expect(readFileTool.name).toBe('ReadFile');
    expect(readFileTool.description).toBe('Reads the content of a specified file.');
  });

  it('should successfully read and return file content', async () => {
    const filePath = 'test/file.txt';
    const mockContent = 'This is mock file content.';
    mockFs.readFile.mockResolvedValue(mockContent as any); // as any to satisfy Buffer | string

    const args: ReadFileArgs = { filePath };
    const result = await readFileTool.execute(args);

    expect(result).toBe(mockContent);
    expect(mockFs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
    expect(mockLogger.info).toHaveBeenCalledWith(`ReadFile: Attempting to read file at path: ${filePath}`);
    expect(mockLogger.info).toHaveBeenCalledWith(`ReadFile: Successfully read file: ${filePath}`);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should throw an error and log if filePath is not provided', async () => {
    const args: ReadFileArgs = { filePath: '' }; // Empty filePath

    await expect(readFileTool.execute(args)).rejects.toThrow('filePath is required for ReadFile tool.');
    expect(mockLogger.error).toHaveBeenCalledWith('ReadFile: filePath is required for ReadFile tool.');
    expect(mockFs.readFile).not.toHaveBeenCalled();
  });

  it('should throw an error and log if fs.readFile encounters a "file not found" error', async () => {
    const filePath = 'nonexistent/file.txt';
    const originalError = new Error('ENOENT: no such file or directory');
    (originalError as any).code = 'ENOENT'; // Mocking error code
    mockFs.readFile.mockRejectedValue(originalError);

    const args: ReadFileArgs = { filePath };

    await expect(readFileTool.execute(args)).rejects.toThrow(`Failed to read file: ${filePath}. Reason: ${originalError.message}`);
    expect(mockLogger.info).toHaveBeenCalledWith(`ReadFile: Attempting to read file at path: ${filePath}`);
    expect(mockLogger.error).toHaveBeenCalledWith(
      `ReadFile: Failed to read file: ${filePath}. Reason: ${originalError.message}`,
      { error: originalError }
    );
  });

  it('should throw an error and log if fs.readFile encounters a "permission denied" error', async () => {
    const filePath = 'restricted/file.txt';
    const originalError = new Error('EACCES: permission denied');
    (originalError as any).code = 'EACCES';
    mockFs.readFile.mockRejectedValue(originalError);

    const args: ReadFileArgs = { filePath };

    await expect(readFileTool.execute(args)).rejects.toThrow(`Failed to read file: ${filePath}. Reason: ${originalError.message}`);
    expect(mockLogger.info).toHaveBeenCalledWith(`ReadFile: Attempting to read file at path: ${filePath}`);
    expect(mockLogger.error).toHaveBeenCalledWith(
      `ReadFile: Failed to read file: ${filePath}. Reason: ${originalError.message}`,
      { error: originalError }
    );
  });

  it('should throw an error and log if fs.readFile encounters an "EISDIR" error (path is a directory)', async () => {
    const filePath = 'some/directory/';
    const originalError = new Error('EISDIR: path is a directory');
    (originalError as any).code = 'EISDIR';
    mockFs.readFile.mockRejectedValue(originalError);

    const args: ReadFileArgs = { filePath };

    await expect(readFileTool.execute(args)).rejects.toThrow(`Failed to read file: ${filePath}. Reason: ${originalError.message}`);
    expect(mockLogger.info).toHaveBeenCalledWith(`ReadFile: Attempting to read file at path: ${filePath}`);
    expect(mockLogger.error).toHaveBeenCalledWith(
      `ReadFile: Failed to read file: ${filePath}. Reason: ${originalError.message}`,
      { error: originalError }
    );
  });

  it('should handle generic errors from fs.readFile', async () => {
    const filePath = 'tricky/file.txt';
    const genericError = new Error('Some other FS error');
    mockFs.readFile.mockRejectedValue(genericError);

    const args: ReadFileArgs = { filePath };

    await expect(readFileTool.execute(args)).rejects.toThrow(`Failed to read file: ${filePath}. Reason: ${genericError.message}`);
    expect(mockLogger.info).toHaveBeenCalledWith(`ReadFile: Attempting to read file at path: ${filePath}`);
    expect(mockLogger.error).toHaveBeenCalledWith(
      `ReadFile: Failed to read file: ${filePath}. Reason: ${genericError.message}`,
      { error: genericError }
    );
  });
});
