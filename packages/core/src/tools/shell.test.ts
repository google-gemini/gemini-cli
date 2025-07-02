import { exec } from 'child_process';
import util from 'util'; // To ensure we can see how execAsync is formed
import { shellTool, ShellArgs } from './shell'; // Tool to be tested
import { logger } from '../utils/logger';   // Mocked logger

// Mock child_process.exec
jest.mock('child_process');
// Mock the logger
jest.mock('../utils/logger');

// Typed mock for exec
const mockExec = exec as jest.MockedFunction<typeof exec>;
const mockLogger = logger as jest.Mocked<typeof logger>;

// Helper to simulate execAsync behavior based on the mockExec
const simulateExecAsync = (command: string) => {
  return new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
    // Get the last call to exec (which is what util.promisify would have used)
    const lastCall = mockExec.mock.calls[mockExec.mock.calls.length - 1];
    const callback = lastCall[lastCall.length -1] as (error: any, stdout: string, stderr: string) => void;

    // This is where individual tests will set up mockExec's implementation
    // For example, an actual test would do:
    // mockExec.mockImplementationOnce((cmd, cb) => cb(null, 'stdout', 'stderr'));
    // This simulateExecAsync just helps structure the call if needed, but direct await on
    // shellTool.execute should work if mockExec is properly set by tests.
    // The key is that shellTool's internal execAsync will use our mockExec.
  });
};


describe('shellTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a name and description', () => {
    expect(shellTool.name).toBe('Shell');
    expect(shellTool.description).toBe('Executes a shell command.');
  });

  it('should execute a safe command successfully and return stdout', async () => {
    const command = 'ls -l';
    const expectedStdout = 'total 0\n-rw-r--r-- 1 user group 0 Jan 1 00:00 file.txt';
    mockExec.mockImplementationOnce((cmd, callback: any) => callback(null, expectedStdout, ''));

    const args: ShellArgs = { command };
    const result = await shellTool.execute(args);

    expect(mockExec).toHaveBeenCalledWith(command, expect.any(Function));
    expect(result).toContain(`Command "${command}" executed.`);
    expect(result).toContain(`Stdout:\n${expectedStdout}`);
    expect(mockLogger.info).toHaveBeenCalledWith(`ShellTool: Executing command: ${command}`);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Stdout:"));
    expect(mockLogger.warn).not.toHaveBeenCalled(); // No stderr in this case
  });

  it('should include stderr in output and log a warning if stderr is present', async () => {
    const command = 'git status';
    const stdoutMsg = 'On branch main';
    const stderrMsg = 'Your branch is up to date with \'origin/main\'.';
    mockExec.mockImplementationOnce((cmd, callback: any) => callback(null, stdoutMsg, stderrMsg));

    const args: ShellArgs = { command };
    const result = await shellTool.execute(args);

    expect(result).toContain(`Stdout:\n${stdoutMsg}`);
    expect(result).toContain(`Stderr:\n${stderrMsg}`);
    expect(mockLogger.warn).toHaveBeenCalledWith(`ShellTool: Command "${command}" produced Stderr:\n${stderrMsg}`);
  });

  it('should return (no stdout/stderr) message if both are empty', async () => {
    const command = 'touch newfile.txt';
    mockExec.mockImplementationOnce((cmd, callback: any) => callback(null, '', ''));

    const args: ShellArgs = { command };
    const result = await shellTool.execute(args);

    expect(result).toContain(`Command "${command}" executed.`);
    expect(result).toContain("(no stdout/stderr)");
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("(no stdout/stderr)"));
  });

  it('should throw an error and log if command is not provided', async () => {
    const args: ShellArgs = { command: '' };
    await expect(shellTool.execute(args)).rejects.toThrow('Command is required for Shell tool.');
    expect(mockLogger.error).toHaveBeenCalledWith('ShellTool: Command is required for Shell tool.');
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('should block a command containing "rm -rf" and log a warning', async () => {
    const dangerousCommand = 'sudo rm -rf / --no-preserve-root';
    const args: ShellArgs = { command: dangerousCommand };

    await expect(shellTool.execute(args)).rejects.toThrow(
      `Execution of command "${dangerousCommand}" containing "rm -rf" is blocked for safety reasons.`
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      `ShellTool: Execution of command "${dangerousCommand}" containing "rm -rf" is blocked for safety reasons.`
    );
    expect(mockExec).not.toHaveBeenCalled();
  });

  it('should block a command containing "fdisk" (another dangerous command)', async () => {
    const dangerousCommand = 'fdisk /dev/sda';
    const args: ShellArgs = { command: dangerousCommand };

    await expect(shellTool.execute(args)).rejects.toThrow(
      `Execution of command "${dangerousCommand}" containing "fdisk " is blocked for safety reasons.`
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      `ShellTool: Execution of command "${dangerousCommand}" containing "fdisk " is blocked for safety reasons.`
    );
  });

  it('should allow a command that includes a dangerous substring but is not the dangerous command itself (testing current `includes` limitation)', async () => {
    // This test highlights the current limitation of `includes` if not careful with DANGEROUS_COMMANDS list.
    // For example, if DANGEROUS_COMMANDS just has "rm", then "my-script-for-rm.sh" would be blocked.
    // If DANGEROUS_COMMANDS has "rm -rf", then "my-script-for-rm-rf-logs.sh" would be blocked.
    // This test assumes DANGEROUS_COMMANDS are specific enough like "rm -rf" (with space or specific pattern)
    const safeCommandWithSubstring = 'echo "remove -rf is a substring here"';
    const expectedStdout = 'remove -rf is a substring here';
    mockExec.mockImplementationOnce((cmd, callback: any) => callback(null, expectedStdout, ''));

    const args: ShellArgs = { command: safeCommandWithSubstring };
    const result = await shellTool.execute(args);
    expect(result).toContain(expectedStdout);
    expect(mockLogger.warn).not.toHaveBeenCalledWith(expect.stringContaining("blocked for safety reasons"));
  });


  it('should throw an error, log, and include details if execAsync fails (e.g., command not found)', async () => {
    const command = 'nonexistentcommand';
    const error = new Error('Command failed: nonexistentcommand') as any;
    error.killed = false;
    error.code = 127; // Typical exit code for command not found
    error.signal = null;
    error.cmd = command;
    error.stderr = '/bin/sh: nonexistentcommand: not found';
    error.stdout = ''; // No stdout for command not found

    mockExec.mockImplementationOnce((cmd, callback: any) => callback(error, error.stdout, error.stderr));

    const args: ShellArgs = { command };
    const expectedErrorMessage = `Failed to execute command: "${command}". Reason: ${error.message}\nStderr: ${error.stderr}`;

    await expect(shellTool.execute(args)).rejects.toThrow(expectedErrorMessage);
    expect(mockLogger.info).toHaveBeenCalledWith(`ShellTool: Executing command: ${command}`);
    expect(mockLogger.error).toHaveBeenCalledWith(
      `ShellTool: ${expectedErrorMessage}`,
      { error }
    );
  });

  it('should throw an error, log, and include details if command exits with non-zero code', async () => {
    const command = 'ls /nonexistent-path';
    const error = new Error('Command failed: ls /nonexistent-path') as any;
    error.code = 2; // ls specific error code for missing file/dir
    error.stderr = 'ls: cannot access \'/nonexistent-path\': No such file or directory';
    error.stdout = '';
    mockExec.mockImplementationOnce((cmd, callback: any) => callback(error, error.stdout, error.stderr));

    const args: ShellArgs = { command };
    const expectedErrorMessage = `Failed to execute command: "${command}". Reason: ${error.message}\nStderr: ${error.stderr}`;

    await expect(shellTool.execute(args)).rejects.toThrow(expectedErrorMessage);
    expect(mockLogger.error).toHaveBeenCalledWith(
        `ShellTool: ${expectedErrorMessage}`,
        { error }
    );
  });
});
