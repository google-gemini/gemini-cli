import { Indicator } from '../src/indicators'; // Adjust path as needed
import { describe, it, expect } from 'vitest';

describe('Indicator Dataclass', () => {
  it('should correctly create an Indicator instance', () => {
    const indicator = new Indicator('TestName', 123.45);
    expect(indicator.name).toBe('TestName');
    expect(indicator.value).toBe(123.45);
  });

  it('should have correct properties', () => {
    const indicator = new Indicator('Another', 67.89);
    expect(Object.keys(indicator)).toEqual(['name', 'value']);
  });
});