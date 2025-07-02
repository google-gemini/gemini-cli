import { exec } from 'child_process';
import { termuxToastTool, TermuxToastArgs } from './termux'; // Tool to be tested
import { logger } from '../utils/logger'; // Mocked logger

// Mock child_process.exec
jest.mock('child_process');
// Mock the logger
jest.mock('../utils/logger');

// Typed mock for exec
const mockExec = exec as jest.MockedFunction<typeof exec>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('termuxToastTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a name and description', () => {
    expect(termuxToastTool.name).toBe('TermuxToast');
    expect(termuxToastTool.description).toBe('Displays a toast message using Termux API.');
  });

  it('should display a short toast by default', async () => {
    const message = 'Hello Termux!';
    // Simulate successful execution of exec for the promisified version
    mockExec.mockImplementationOnce((command, callback: any) => callback(null, '', ''));

    const args: TermuxToastArgs = { message };
    const result = await termuxToastTool.execute(args);

    expect(mockExec).toHaveBeenCalledWith(
      `termux-toast  "${message}"`, // Note: double space when duration flag is empty
      expect.any(Function)
    );
    expect(result).toBe(`Toast displayed: "${message}"`);
    expect(mockLogger.info).toHaveBeenCalledWith(`TermuxToastTool: Executing command: termux-toast  "${message}"`);
    expect(mockLogger.info).toHaveBeenCalledWith(`TermuxToastTool: Toast displayed: "${message}"`);
  });

  it('should display a long toast when duration is "long"', async () => {
    const message = 'This is a longer toast message.';
    mockExec.mockImplementationOnce((command, callback: any) => callback(null, '', ''));

    const args: TermuxToastArgs = { message, duration: 'long' };
    const result = await termuxToastTool.execute(args);

    expect(mockExec).toHaveBeenCalledWith(
      `termux-toast -l "${message}"`,
      expect.any(Function)
    );
    expect(result).toBe(`Toast displayed: "${message}"`);
    expect(mockLogger.info).toHaveBeenCalledWith(`TermuxToastTool: Executing command: termux-toast -l "${message}"`);
  });

  it('should correctly escape double quotes in the message', async () => {
    const message = 'This message has "quotes" in it.';
    const escapedMessageInCommand = 'This message has \\"quotes\\" in it.';
    mockExec.mockImplementationOnce((command, callback: any) => callback(null, '', ''));

    const args: TermuxToastArgs = { message };
    await termuxToastTool.execute(args);

    expect(mockExec).toHaveBeenCalledWith(
      `termux-toast  "${escapedMessageInCommand}"`,
      expect.any(Function)
    );
    expect(mockLogger.info).toHaveBeenCalledWith(`TermuxToastTool: Executing command: termux-toast  "${escapedMessageInCommand}"`);
  });

  it('should throw an error and log if message is not provided', async () => {
    const args: TermuxToastArgs = { message: '' };
    await expect(termuxToastTool.execute(args)).rejects.toThrow('Message is required for TermuxToast tool.');
    expect(mockLogger.error).toHaveBeenCalledWith('TermuxToastTool: Message is required for TermuxToast tool.');
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('should throw an error and log if termux-toast command fails (e.g., termux-api not installed)', async () => {
    const message = 'Test toast';
    const originalError = new Error('Command failed') as any;
    originalError.stderr = 'termux-toast: command not found';
    mockExec.mockImplementationOnce((command, callback: any) => callback(originalError, '', originalError.stderr));

    const args: TermuxToastArgs = { message };
    const expectedCommand = `termux-toast  "${message}"`;
    const expectedErrorMessage = `Failed to display toast. Make sure termux-api is installed and running. Reason: ${originalError.message}\nStderr: ${originalError.stderr}`;

    await expect(termuxToastTool.execute(args)).rejects.toThrow(expectedErrorMessage);
    expect(mockLogger.info).toHaveBeenCalledWith(`TermuxToastTool: Executing command: ${expectedCommand}`);
    expect(mockLogger.error).toHaveBeenCalledWith(
      `TermuxToastTool: ${expectedErrorMessage}`,
      { command: expectedCommand, error: originalError }
    );
  });

  it('should handle exec errors without stderr gracefully', async () => {
    const message = 'Another Test';
    const originalError = new Error('Some exec error without stderr');
    // Simulate error object without stderr property
    mockExec.mockImplementationOnce((command, callback: any) => callback(originalError, '', ''));


    const args: TermuxToastArgs = { message };
    const expectedCommand = `termux-toast  "${message}"`;
    const expectedErrorMessage = `Failed to display toast. Make sure termux-api is installed and running. Reason: ${originalError.message}`;

    await expect(termuxToastTool.execute(args)).rejects.toThrow(expectedErrorMessage);
    expect(mockLogger.error).toHaveBeenCalledWith(
      `TermuxToastTool: ${expectedErrorMessage}`,
      { command: expectedCommand, error: originalError }
    );
  });
});
