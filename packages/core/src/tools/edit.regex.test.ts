import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditTool } from './edit.js';
import { Config } from '../config/config.js';
import { ToolErrorType } from './tool-error.js';

vi.mock('../telemetry/loggers.js', () => ({
  logFileOperation: vi.fn(),
}));

describe('EditTool with Regex', () => {
  let config: Config;
  let fs: any;

  beforeEach(() => {
    fs = {
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
      getWorkspaceRoot: () => '/test-dir',
    };

    config = {
      getFileSystemService: () => fs,
      getGeminiClient: () => ({
        getGenerativeModel: () => ({
          startChat: () => ({
            sendMessage: vi.fn().mockResolvedValue({
              response: {
                text: () => 'irrelevant',
              },
            }),
          }),
        }),
      }),
      getWorkspaceContext: () => ({
        isPathWithinWorkspace: () => true,
        getDirectories: () => ['/test-dir'],
      }),
      getUsageStatisticsEnabled: () => false,
      getTargetDir: () => '/test-dir',
    } as unknown as Config;
  });

  it('should replace content using a simple regex', async () => {
    const tool = new EditTool(config);
    const filePath = '/test.txt';
    const initialContent = 'hello world';
    const newContent = 'hello universe';

    vi.spyOn(fs, 'readTextFile').mockResolvedValue(initialContent);

    const invocation = tool.build({
      file_path: filePath,
      old_string: 'world',
      new_string: 'universe',
      is_regex: true,
    });

    const result = await invocation.execute(new AbortController().signal);

    expect(fs.writeTextFile).toHaveBeenCalledWith(filePath, newContent);
    expect(result.llmContent).toContain('Successfully modified file');
  });

  it('should replace multiple occurrences with regex', async () => {
    const tool = new EditTool(config);
    const filePath = '/test.txt';
    const initialContent = 'cat dog cat';
    const newContent = 'mouse dog mouse';

    vi.spyOn(fs, 'readTextFile').mockResolvedValue(initialContent);

    const invocation = tool.build({
      file_path: filePath,
      old_string: 'cat',
      new_string: 'mouse',
      is_regex: true,
      expected_replacements: 2,
    });

    const result = await invocation.execute(new AbortController().signal);

    expect(fs.writeTextFile).toHaveBeenCalledWith(filePath, newContent);
    expect(result.llmContent).toContain('2 replacements');
  });

  it('should return an error if regex does not match', async () => {
    const tool = new EditTool(config);
    const filePath = '/test.txt';
    const initialContent = 'hello world';

    vi.spyOn(fs, 'readTextFile').mockResolvedValue(initialContent);

    const invocation = tool.build({
      file_path: filePath,
      old_string: 'nonexistent',
      new_string: 'irrelevant',
      is_regex: true,
    });

    const result = await invocation.execute(new AbortController().signal);

    expect(fs.writeTextFile).not.toHaveBeenCalled();
    expect(result.error?.type).toBe(ToolErrorType.EDIT_NO_OCCURRENCE_FOUND);
  });

  it('should return an error for mismatched expected replacements with regex', async () => {
    const tool = new EditTool(config);
    const filePath = '/test.txt';
    const initialContent = 'cat dog cat';

    vi.spyOn(fs, 'readTextFile').mockResolvedValue(initialContent);

    const invocation = tool.build({
      file_path: filePath,
      old_string: 'cat',
      new_string: 'mouse',
      is_regex: true,
      expected_replacements: 1,
    });

    const result = await invocation.execute(new AbortController().signal);

    expect(fs.writeTextFile).not.toHaveBeenCalled();
    expect(result.error?.type).toBe(
      ToolErrorType.EDIT_EXPECTED_OCCURRENCE_MISMATCH,
    );
  });
});
