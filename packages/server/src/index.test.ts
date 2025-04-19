import { describe, it, expect } from 'vitest';
import { helloServer } from './index.js';

describe('server tests', () => {
  it('should export helloServer function', () => {
    expect(helloServer).toBeDefined();
    expect(typeof helloServer).toBe('function');
  });
});
