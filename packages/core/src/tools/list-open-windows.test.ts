import { ListOpenWindowsTool, WindowInfo, ListOpenWindowsParams } from './list-open-windows';
import { ToolResult } from './tools';
import * as childProcess from 'child_process';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'; // Import vi and test functions

vi.mock('child_process');
const mockSpawn = childProcess.spawn as jest.Mock;

describe('ListOpenWindowsTool', () => {
  let tool: ListOpenWindowsTool;
  let abortController: AbortController;

  beforeEach(() => {
    tool = new ListOpenWindowsTool();
    abortController = new AbortController();
    vi.clearAllMocks(); // Use vi.clearAllMocks()
  });

  it('should have correct name from BaseTool constructor', () => {
    expect(tool.name).toBe('listOpenWindows');
  });

  it('should have correct displayName from BaseTool constructor', () => {
    expect(tool.displayName).toBe('List Open Windows');
  });

  it('should have correct description from BaseTool constructor', () => {
    expect(tool.description).toBe('Lists all open and visible windows on a Windows system, returning their titles and process IDs. (Windows OS only)');
  });

  it('should have parameterSchema defined in BaseTool constructor', () => {
    expect(tool.schema.parameters).toEqual({ type: 'object', properties: {} });
  });

  it('should have example usages', () => {
    expect(tool.exampleUsages.length).toBeGreaterThan(0);
    expect(tool.exampleUsages).toEqual(['listOpenWindows']);
  });


  describe('execute', () => {
    it('should resolve with ToolResult on successful execution', async () => {
      const mockWindowsData: WindowInfo[] = [
        { Title: 'Window 1', ProcessId: 123 },
        { Title: 'Window 2', ProcessId: 456 },
      ];
      const mockStdout = JSON.stringify(mockWindowsData);

      const mockChildProcess = {
        stdout: { on: vi.fn().mockImplementation((event, cb) => { if(event === 'data') cb(mockStdout); }) },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event, cb) => {
          if (event === 'close') cb(0); // Simulate successful close
        }),
        kill: vi.fn(), // Mock the kill method
      };
      mockSpawn.mockReturnValue(mockChildProcess as any);

      const result: ToolResult = await tool.execute({} as ListOpenWindowsParams, abortController.signal);

      expect(result.llmContent).toBe(mockStdout);
      expect(result.returnDisplay).toBe(`Found ${mockWindowsData.length} open window(s).`);
      expect(mockSpawn).toHaveBeenCalledWith('../../../../native_tools/windows/ListOpenWindows.exe', []);
    });

    it('should reject if ListOpenWindows.exe exits with non-zero code', async () => {
      const mockStderr = 'Error from exe';
      const mockChildProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn().mockImplementation((event, cb) => { if(event === 'data') cb(mockStderr); }) },
        on: vi.fn().mockImplementation((event, cb) => {
          if (event === 'close') cb(1); // Simulate non-zero exit code
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockChildProcess as any);

      await expect(tool.execute({} as ListOpenWindowsParams, abortController.signal)).rejects.toThrow(
        `ListOpenWindows.exe exited with code 1: ${mockStderr}`
      );
    });

    it('should reject if JSON parsing fails', async () => {
      const mockInvalidJson = 'This is not JSON';
      const mockChildProcess = {
        stdout: { on: vi.fn().mockImplementation((event, cb) => { if(event === 'data') cb(mockInvalidJson); }) },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event, cb) => {
          if (event === 'close') cb(0); // Simulate successful close
        }),
        kill: vi.fn(),
      };
      mockSpawn.mockReturnValue(mockChildProcess as any);

      // Adjust the expected error message to match common SyntaxError.message format
      await expect(tool.execute({} as ListOpenWindowsParams, abortController.signal)).rejects.toThrow(
        /Failed to parse JSON output from ListOpenWindows\.exe:.*Unexpected token .*,.*is not valid JSON\. Output was: This is not JSON/
      );
    });

    it('should reject if spawning the process fails', async () => {
      const spawnError = new Error('Failed to start process');
      const mockChildProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event, cb) => {
          if (event === 'error') cb(spawnError); // Simulate error event
        }),
        kill: vi.fn(),
      };
      // Mock spawn to return the process that will emit an error
      mockSpawn.mockReturnValue(mockChildProcess as any);

      await expect(tool.execute({} as ListOpenWindowsParams, abortController.signal)).rejects.toThrow(
        `Failed to start ListOpenWindows.exe: ${spawnError.message}`
      );
    });

    it('should kill process if abort signal is triggered', async () => {
      const mockChildProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(), // 'close' or 'error' won't be called in this specific test path
        kill: vi.fn(), // Crucially, mock kill
      };
      mockSpawn.mockReturnValue(mockChildProcess as any);

      // Execute the tool but abort it immediately
      const executePromise = tool.execute({} as ListOpenWindowsParams, abortController.signal);
      abortController.abort();

      await expect(executePromise).rejects.toThrow('ListOpenWindows execution aborted.');
      expect(mockChildProcess.kill).toHaveBeenCalledTimes(1);
    });
  });
});
