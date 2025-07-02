/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { setupUser } from './setup.js';
import { CodeAssistServer } from './server.js';
import { ProjectIdRequiredError } from './errors.js';

vi.mock('./server.js');

describe('setup', () => {
  it('should throw an error if project ID is required but not provided', async () => {
    const mockLoadCodeAssist = vi.fn().mockResolvedValue({
      allowedTiers: [
        {
          id: 'test-tier',
          userDefinedCloudaicompanionProject: true,
        },
      ],
    });
    vi.mocked(CodeAssistServer).mockImplementation(
      () =>
        ({
          loadCodeAssist: mockLoadCodeAssist,
        }) as unknown as CodeAssistServer,
    );

    await expect(setupUser({} as never)).rejects.toThrow(
      new ProjectIdRequiredError(),
    );
  });
});
