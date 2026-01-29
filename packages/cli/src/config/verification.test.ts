import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadEnvironment, loadSettings, getSettingsSchema } from './settings.js';
import { validateAuthMethod } from './auth.js';
import { isWorkspaceTrusted } from './trustedFolders.js';
import { AuthType } from '@google/gemini-cli-core';

vi.mock('./trustedFolders.js', () => ({
  isWorkspaceTrusted: vi.fn(),
  isFolderTrustEnabled: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    realpathSync: vi.fn().mockImplementation((p) => p),
  };
});

describe('Verification: Auth and Trust Interaction', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.resetAllMocks();
    vi.mocked(isWorkspaceTrusted).mockReturnValue({ isTrusted: true, source: 'file' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should verify loadEnvironment returns early and validateAuthMethod fails when untrusted', () => {
    // 1. Mock untrusted workspace
    vi.mocked(isWorkspaceTrusted).mockReturnValue({ isTrusted: false, source: 'file' });
    
    // 2. Mock .env file existence
    const envPath = path.resolve(process.cwd(), '.env');
    vi.mocked(fs.existsSync).mockImplementation((p) => p === envPath);
    vi.mocked(fs.readFileSync).mockImplementation((p) => {
      if (p === envPath) return 'GEMINI_API_KEY=shhh-secret';
      return '';
    });

    // 3. Load environment (should return early)
    const settings = loadSettings(process.cwd());
    loadEnvironment(settings.merged);

    // 4. Verify env var NOT loaded
    expect(process.env['GEMINI_API_KEY']).toBe('');

    // 5. Verify validateAuthMethod fails
    const result = validateAuthMethod(AuthType.USE_GEMINI);
    expect(result).toContain('you must specify the GEMINI_API_KEY environment variable');
  });

  it('should identify if sandbox flag is available in Settings', () => {
    const schema = getSettingsSchema();
    expect(schema.tools.properties).toBeDefined();
    expect('sandbox' in schema.tools.properties!).toBe(true);
  });
});
