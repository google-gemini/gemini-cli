import fs from 'fs/promises';
import { writeFileTool, WriteFileArgs } from './writeFile'; // Tool to be tested
import { logger } from '../utils/logger'; // Mocked logger

// Mock the fs/promises module
jest.mock('fs/promises');
// Mock the logger module
jest.mock('../utils/logger');

describe('writeFileTool', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockLogger = logger as jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a name and description', () => {
    expect(writeFileTool.name).toBe('WriteFile');
    expect(writeFileTool.description).toBe('Writes content to a specified file. By default, it appends. Use overwrite: true to replace the file.');
  });

  // Test successful overwrite
  it('should successfully overwrite a file when overwrite is true', async () => {
    const filePath = 'test/overwrite.txt';
    const content = 'New file content.';
    mockFs.writeFile.mockResolvedValue(undefined);

    const args: WriteFileArgs = { filePath, content, overwrite: true };
    const result = await writeFileTool.execute(args);

    expect(result).toBe(`Successfully overwrote file: ${filePath}`);
    expect(mockFs.writeFile).toHaveBeenCalledWith(filePath, content, 'utf-8');
    expect(mockFs.appendFile).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(`WriteFile: Attempting to overwriting file: ${filePath}`);
    expect(mockLogger.info).toHaveBeenCalledWith(`WriteFile: Successfully overwrote file: ${filePath}`);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  // Test successful append (default behavior)
  it('should successfully append to a file when overwrite is false or undefined', async () => {
    const filePath = 'test/append.txt';
    const content = 'Appended data.';
    mockFs.appendFile.mockResolvedValue(undefined);

    const args: WriteFileArgs = { filePath, content }; // overwrite is undefined, defaults to false
    const result = await writeFileTool.execute(args);

    expect(result).toBe(`Successfully appended to file: ${filePath}`);
    expect(mockFs.appendFile).toHaveBeenCalledWith(filePath, content, 'utf-8');
    expect(mockFs.writeFile).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith(`WriteFile: Attempting to appending to file: ${filePath}`); // Note: "appending to file"
    expect(mockLogger.info).toHaveBeenCalledWith(`WriteFile: Successfully appended to file: ${filePath}`);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should successfully append to a file when overwrite is explicitly false', async () => {
    const filePath = 'test/append_explicit.txt';
    const content = 'More appended data.';
    mockFs.appendFile.mockResolvedValue(undefined);

    const args: WriteFileArgs = { filePath, content, overwrite: false };
    const result = await writeFileTool.execute(args);

    expect(result).toBe(`Successfully appended to file: ${filePath}`);
    expect(mockFs.appendFile).toHaveBeenCalledWith(filePath, content, 'utf-8');
    expect(mockLogger.info).toHaveBeenCalledWith(`WriteFile: Attempting to appending to file: ${filePath}`);
    expect(mockLogger.info).toHaveBeenCalledWith(`WriteFile: Successfully appended to file: ${filePath}`);
  });


  // Test input validation errors
  it('should throw an error if filePath is not provided', async () => {
    const args: WriteFileArgs = { filePath: '', content: 'Some content' };
    await expect(writeFileTool.execute(args)).rejects.toThrow('filePath and content are required for WriteFile tool.');
    expect(mockLogger.error).toHaveBeenCalledWith('WriteFile: filePath and content are required for WriteFile tool.');
    expect(mockFs.writeFile).not.toHaveBeenCalled();
    expect(mockFs.appendFile).not.toHaveBeenCalled();
  });

  it('should throw an error if content is not provided (is undefined)', async () => {
    // Casting to any to simulate undefined content for testing purposes
    const args: WriteFileArgs = { filePath: 'test.txt', content: undefined as any };
    await expect(writeFileTool.execute(args)).rejects.toThrow('filePath and content are required for WriteFile tool.');
    expect(mockLogger.error).toHaveBeenCalledWith('WriteFile: filePath and content are required for WriteFile tool.');
  });

  it('should allow empty string as content', async () => {
    const filePath = 'test/empty_content.txt';
    const content = '';
    mockFs.appendFile.mockResolvedValue(undefined); // Assuming append mode for this test

    const args: WriteFileArgs = { filePath, content, overwrite: false };
    await writeFileTool.execute(args);
    expect(mockFs.appendFile).toHaveBeenCalledWith(filePath, content, 'utf-8');
    expect(mockLogger.info).toHaveBeenCalledWith(`WriteFile: Successfully appended to file: ${filePath}`);
  });

  // Test fs operation errors
  it('should throw an error and log if fs.writeFile fails (overwrite mode)', async () => {
    const filePath = 'test/fail_overwrite.txt';
    const content = 'Content.';
    const originalError = new Error('Disk full');
    (originalError as any).code = 'ENOSPC';
    mockFs.writeFile.mockRejectedValue(originalError);

    const args: WriteFileArgs = { filePath, content, overwrite: true };
    await expect(writeFileTool.execute(args)).rejects.toThrow(`Failed to overwriting file: ${filePath}. Reason: ${originalError.message}`);
    expect(mockLogger.info).toHaveBeenCalledWith(`WriteFile: Attempting to overwriting file: ${filePath}`);
    expect(mockLogger.error).toHaveBeenCalledWith(
      `WriteFile: Failed to overwriting file: ${filePath}. Reason: ${originalError.message}`,
      { error: originalError }
    );
  });

  it('should throw an error and log if fs.appendFile fails (append mode)', async () => {
    const filePath = 'test/fail_append.txt';
    const content = 'Content.';
    const originalError = new Error('Permission denied');
    (originalError as any).code = 'EACCES';
    mockFs.appendFile.mockRejectedValue(originalError);

    const args: WriteFileArgs = { filePath, content, overwrite: false };
    await expect(writeFileTool.execute(args)).rejects.toThrow(`Failed to appending to file: ${filePath}. Reason: ${originalError.message}`);
    expect(mockLogger.info).toHaveBeenCalledWith(`WriteFile: Attempting to appending to file: ${filePath}`);
    expect(mockLogger.error).toHaveBeenCalledWith(
      `WriteFile: Failed to appending to file: ${filePath}. Reason: ${originalError.message}`,
      { error: originalError }
    );
  });
});
