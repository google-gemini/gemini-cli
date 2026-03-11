/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  StaleOutputElisionService,
  STALE_OUTPUT_ELISION_TAG,
  MIN_TOKENS_TO_ELIDE,
} from './staleOutputElisionService.js';
import {
  READ_FILE_TOOL_NAME,
  READ_MANY_FILES_TOOL_NAME,
  EDIT_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
} from '../tools/tool-names.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';
import type { Config } from '../config/config.js';
import type { Content } from '@google/genai';

vi.mock('../utils/tokenCalculation.js', () => ({
  estimateTokenCountSync: vi.fn(),
}));

vi.mock('../telemetry/loggers.js', () => ({
  logStaleOutputElision: vi.fn(),
}));

describe('StaleOutputElisionService', () => {
  let service: StaleOutputElisionService;
  let mockConfig: Config;
  const mockedEstimateTokenCountSync = vi.mocked(estimateTokenCountSync);

  beforeEach(() => {
    service = new StaleOutputElisionService();
    mockConfig = {
      getSessionId: () => 'mock-session',
      getUsageStatisticsEnabled: () => false,
    } as unknown as Config;
    vi.clearAllMocks();
    // Default: each read output is large enough to elide. Return small value
    // for the elided marker (contains STALE_OUTPUT_ELISION_TAG) so that the
    // savings > 0 guard does not prevent the elision.
    mockedEstimateTokenCountSync.mockImplementation((parts) => {
      const resp = parts[0]?.functionResponse?.response;
      const output = resp?.['output'];
      if (
        typeof output === 'string' &&
        output.includes(STALE_OUTPUT_ELISION_TAG)
      ) {
        return 5; // elided marker is tiny
      }
      return MIN_TOKENS_TO_ELIDE + 1; // original content is large enough
    });
  });

  /**
   * Builds a minimal Content[] that simulates a read-then-write scenario.
   *
   * Layout:
   *   [0] model: functionCall(read_file, filePath, callId='r1')
   *   [1] user:  functionResponse(read_file, 'r1', output)
   *   [2] model: functionCall(write_tool, filePath, callId='w1')
   *   [3] user:  functionResponse(write_tool, 'w1', '')
   *
   * The read at index 1 is stale when the write at index 3 targets the
   * same file and comes later in history.
   */
  function buildReadThenWriteHistory(
    filePath: string,
    readToolName: string,
    writeToolName: string,
    readOutput: string = 'large file content',
    callIdSuffix: string = '1',
  ): Content[] {
    const readCallId = `readCall${callIdSuffix}`;
    const writeCallId = `writeCall${callIdSuffix}`;

    const readArgs: Record<string, unknown> =
      readToolName === READ_MANY_FILES_TOOL_NAME
        ? { paths: [filePath] }
        : { file_path: filePath };

    return [
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              id: readCallId,
              name: readToolName,
              args: readArgs,
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: readCallId,
              name: readToolName,
              response: { output: readOutput },
            },
          },
        ],
      },
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              id: writeCallId,
              name: writeToolName,
              args: { file_path: filePath, new_string: 'new content' },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: writeCallId,
              name: writeToolName,
              response: { output: '' },
            },
          },
        ],
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Basic elision cases
  // -------------------------------------------------------------------------

  it('should elide a read_file output when followed by write_file on the same path', async () => {
    const history = buildReadThenWriteHistory(
      '/project/foo.ts',
      READ_FILE_TOOL_NAME,
      WRITE_FILE_TOOL_NAME,
    );

    const result = await service.elide(history, mockConfig);

    expect(result.elisionCount).toBe(1);
    expect(result.tokensSaved).toBeGreaterThan(0);

    const elidedOutput = result.newHistory[1].parts?.[0].functionResponse
      ?.response as Record<string, unknown>;
    expect(elidedOutput['output']).toContain(STALE_OUTPUT_ELISION_TAG);
    expect(elidedOutput['output']).toContain('foo.ts');
  });

  it('should elide a read_file output when followed by edit on the same path', async () => {
    const history = buildReadThenWriteHistory(
      '/project/bar.ts',
      READ_FILE_TOOL_NAME,
      EDIT_TOOL_NAME,
    );

    const result = await service.elide(history, mockConfig);

    expect(result.elisionCount).toBe(1);
    const elidedOutput = result.newHistory[1].parts?.[0].functionResponse
      ?.response as Record<string, unknown>;
    expect(elidedOutput['output']).toContain(STALE_OUTPUT_ELISION_TAG);
  });

  it('should elide a read_many_files output when any of its paths is later written', async () => {
    const readCallId = 'rmf1';
    const writeCallId = 'w1';
    const filePath = '/project/baz.ts';

    const history: Content[] = [
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              id: readCallId,
              name: READ_MANY_FILES_TOOL_NAME,
              args: { paths: [filePath, '/project/other.ts'] },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: readCallId,
              name: READ_MANY_FILES_TOOL_NAME,
              response: { output: 'file 1 contents\nfile 2 contents' },
            },
          },
        ],
      },
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              id: writeCallId,
              name: EDIT_TOOL_NAME,
              args: { file_path: filePath, new_string: 'edited' },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: writeCallId,
              name: EDIT_TOOL_NAME,
              response: { output: '' },
            },
          },
        ],
      },
    ];

    const result = await service.elide(history, mockConfig);

    expect(result.elisionCount).toBe(1);
    const elidedOutput = result.newHistory[1].parts?.[0].functionResponse
      ?.response as Record<string, unknown>;
    expect(elidedOutput['output']).toContain(STALE_OUTPUT_ELISION_TAG);
  });

  // -------------------------------------------------------------------------
  // No-op cases
  // -------------------------------------------------------------------------

  it('should NOT elide when read and write target different paths', async () => {
    const history = buildReadThenWriteHistory(
      '/project/read.ts',
      READ_FILE_TOOL_NAME,
      WRITE_FILE_TOOL_NAME,
    );
    // Overwrite the write tool call to target a different file.
    (history[2].parts![0].functionCall!.args as Record<string, unknown>)[
      'file_path'
    ] = '/project/write.ts';

    const result = await service.elide(history, mockConfig);

    expect(result.elisionCount).toBe(0);
    expect(result.newHistory).toStrictEqual(history);
  });

  it('should NOT elide when the write comes BEFORE the read in history', async () => {
    const history = buildReadThenWriteHistory(
      '/project/foo.ts',
      READ_FILE_TOOL_NAME,
      WRITE_FILE_TOOL_NAME,
    );
    // Reverse to make write appear first: [write, read].
    const reversed: Content[] = [
      history[2], // write model
      history[3], // write response
      history[0], // read model
      history[1], // read response
    ];
    // Re-index: write contentIndex=0, read contentIndex=2 → write < read, not stale.

    const result = await service.elide(reversed, mockConfig);
    expect(result.elisionCount).toBe(0);
  });

  it('should return empty-history unchanged without crashing', async () => {
    const result = await service.elide([], mockConfig);
    expect(result.elisionCount).toBe(0);
    expect(result.newHistory).toStrictEqual([]);
    expect(result.tokensSaved).toBe(0);
  });

  it('should NOT elide when there are no writes in history at all', async () => {
    const history: Content[] = [
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              id: 'r1',
              name: READ_FILE_TOOL_NAME,
              args: { file_path: '/project/foo.ts' },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'r1',
              name: READ_FILE_TOOL_NAME,
              response: { output: 'file content' },
            },
          },
        ],
      },
    ];

    const result = await service.elide(history, mockConfig);
    expect(result.elisionCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Token threshold guard
  // -------------------------------------------------------------------------

  it('should NOT elide a read output that is below the MIN_TOKENS_TO_ELIDE threshold', async () => {
    // Return a count below the threshold for the read output.
    mockedEstimateTokenCountSync.mockReturnValue(MIN_TOKENS_TO_ELIDE - 1);

    const history = buildReadThenWriteHistory(
      '/project/foo.ts',
      READ_FILE_TOOL_NAME,
      WRITE_FILE_TOOL_NAME,
      'tiny',
    );

    const result = await service.elide(history, mockConfig);
    expect(result.elisionCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Error response skipping
  // -------------------------------------------------------------------------

  it('should NOT elide a tool error response even if the file was later written', async () => {
    const history = buildReadThenWriteHistory(
      '/project/foo.ts',
      READ_FILE_TOOL_NAME,
      WRITE_FILE_TOOL_NAME,
      'ignored',
    );
    // Mark the read as an error response.
    history[1].parts![0].functionResponse!.response = {
      error: 'Permission denied',
    };

    const result = await service.elide(history, mockConfig);
    expect(result.elisionCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------

  it('should be idempotent: already-elided outputs are not elided again', async () => {
    const history = buildReadThenWriteHistory(
      '/project/foo.ts',
      READ_FILE_TOOL_NAME,
      WRITE_FILE_TOOL_NAME,
    );
    // Pre-elide the read output.
    history[1].parts![0].functionResponse!.response = {
      output: `<${STALE_OUTPUT_ELISION_TAG}>\n[Content elided]\n</${STALE_OUTPUT_ELISION_TAG}>`,
    };

    const result = await service.elide(history, mockConfig);
    expect(result.elisionCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Immutability
  // -------------------------------------------------------------------------

  it('should not mutate the original history array or its objects', async () => {
    const history = buildReadThenWriteHistory(
      '/project/foo.ts',
      READ_FILE_TOOL_NAME,
      WRITE_FILE_TOOL_NAME,
    );
    const originalReadOutput = history[1].parts![0].functionResponse!.response;
    const originalHistoryRef = history;

    const result = await service.elide(history, mockConfig);

    // The top-level array reference should be different (new array created).
    expect(result.newHistory).not.toBe(originalHistoryRef);
    // The original part's response should remain unchanged.
    expect(history[1].parts![0].functionResponse!.response).toBe(
      originalReadOutput,
    );
  });

  // -------------------------------------------------------------------------
  // Multiple elisions in same session
  // -------------------------------------------------------------------------

  it('should elide multiple independent read+write pairs', async () => {
    const history1 = buildReadThenWriteHistory(
      '/project/a.ts',
      READ_FILE_TOOL_NAME,
      EDIT_TOOL_NAME,
      'content_a',
      'a',
    );
    const history2 = buildReadThenWriteHistory(
      '/project/b.ts',
      READ_FILE_TOOL_NAME,
      WRITE_FILE_TOOL_NAME,
      'content_b',
      'b',
    );
    const combined = [...history1, ...history2];

    const result = await service.elide(combined, mockConfig);

    expect(result.elisionCount).toBe(2);

    const elidedA = result.newHistory[1].parts?.[0].functionResponse
      ?.response as Record<string, unknown>;
    expect(elidedA['output']).toContain(STALE_OUTPUT_ELISION_TAG);

    const elidedB = result.newHistory[5].parts?.[0].functionResponse
      ?.response as Record<string, unknown>;
    expect(elidedB['output']).toContain(STALE_OUTPUT_ELISION_TAG);
  });

  // -------------------------------------------------------------------------
  // Elision marker content
  // -------------------------------------------------------------------------

  it('should include the file path and modifying tool name in the elision marker', async () => {
    const filePath = '/project/important.ts';
    const history = buildReadThenWriteHistory(
      filePath,
      READ_FILE_TOOL_NAME,
      EDIT_TOOL_NAME,
    );

    const result = await service.elide(history, mockConfig);

    const elidedOutput = result.newHistory[1].parts?.[0].functionResponse
      ?.response as Record<string, unknown>;
    const marker = elidedOutput['output'] as string;

    expect(marker).toContain('important.ts');
    expect(marker).toContain(EDIT_TOOL_NAME);
    expect(marker).toContain(`<${STALE_OUTPUT_ELISION_TAG}>`);
    expect(marker).toContain(`</${STALE_OUTPUT_ELISION_TAG}>`);
  });

  // -------------------------------------------------------------------------
  // Path normalisation
  // -------------------------------------------------------------------------

  it('should treat the same absolute path used for read and write as equal', async () => {
    // Use an absolute path directly in both the read and the write calls
    // (i.e. no resolution difference needed — just confirm path.resolve() is
    // idempotent and the service matches absolute paths correctly).
    const absPath = '/project/foo.ts';
    const history: Content[] = [
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              id: 'r1',
              name: READ_FILE_TOOL_NAME,
              args: { file_path: absPath },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'r1',
              name: READ_FILE_TOOL_NAME,
              response: { output: 'content' },
            },
          },
        ],
      },
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              id: 'w1',
              name: WRITE_FILE_TOOL_NAME,
              args: { file_path: absPath },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              id: 'w1',
              name: WRITE_FILE_TOOL_NAME,
              response: { output: '' },
            },
          },
        ],
      },
    ];

    const result = await service.elide(history, mockConfig);
    expect(result.elisionCount).toBe(1);
  });
});
