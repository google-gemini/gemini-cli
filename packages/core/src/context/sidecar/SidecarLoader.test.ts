import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { SidecarLoader } from './SidecarLoader.js';
import { defaultSidecarProfile } from './profiles.js';

vi.mock('node:fs');

describe('SidecarLoader', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const mockConfig = {
    getExperimentalContextSidecarConfig: () => '/path/to/sidecar.json'
  } as any;

  it('returns default profile if file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = SidecarLoader.fromConfig(mockConfig);
    expect(result).toBe(defaultSidecarProfile);
  });

  it('returns default profile if file exists but is 0 bytes', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 0 } as any);
    const result = SidecarLoader.fromConfig(mockConfig);
    expect(result).toBe(defaultSidecarProfile);
  });

  it('throws an error if file is empty whitespace', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 5 } as any);
    vi.mocked(fs.readFileSync).mockReturnValue('   \n  ');
    
    expect(() => SidecarLoader.fromConfig(mockConfig)).toThrow('is empty');
  });

  it('returns parsed config if file is valid', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as any);
    const validConfig = {
      budget: { retainedTokens: 1000, maxTokens: 2000 },
      gcBackstop: { strategy: 'truncate', target: 'max' },
      pipelines: []
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validConfig));
    const result = SidecarLoader.fromConfig(mockConfig);
    expect(result).toEqual(validConfig);
  });

  it('throws an error if schema validation fails', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as any);
    const invalidConfig = {
      budget: { retainedTokens: "invalid string" }, // Invalid type
      pipelines: []
    };
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidConfig));
    
    expect(() => SidecarLoader.fromConfig(mockConfig)).toThrow('Validation error:');
  });
});
