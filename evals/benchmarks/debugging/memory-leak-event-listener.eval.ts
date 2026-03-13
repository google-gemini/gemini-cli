/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect } from 'vitest';
import { evalTest } from '../../test-helper.js';

describe('debugging/memory-leak-event-listener', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should add cleanup for an event listener that causes a memory leak',
    category: 'debugging',
    tags: ['typescript', 'memory', 'events', 'react'],
    files: {
      'src/useWindowSize.ts': `import { useState, useEffect } from 'react';

// BUG: addEventListener is called on mount but removeEventListener is never called,
// causing a memory leak when the component unmounts.
export function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    function handleResize() {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    }
    window.addEventListener('resize', handleResize);
    // Missing: return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
}
`,
    },
    prompt:
      'src/useWindowSize.ts leaks memory: addEventListener is called in useEffect but removeEventListener is never called on cleanup. Add the cleanup function so the event listener is removed when the component unmounts.',
    assert: async (rig) => {
      const content = rig.readFile('src/useWindowSize.ts');
      expect(content).toContain('removeEventListener');
    },
  });
});
