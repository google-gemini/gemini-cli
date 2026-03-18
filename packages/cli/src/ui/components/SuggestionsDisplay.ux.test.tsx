/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppRig } from '../../test-utils/AppRig.js';
import { SuggestionsDisplay } from './SuggestionsDisplay.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('SuggestionsDisplay UX Journey', () => {
  let rig: AppRig;

  beforeEach(async () => {
    const fakeResponsesPath = path.join(
      __dirname,
      '..',
      '..',
      'test-utils',
      'fixtures',
      'simple.responses',
    );
    rig = new AppRig({ fakeResponsesPath });
    await rig.initialize();
    rig.render();
    await rig.waitForIdle();
  });

  afterEach(async () => {
    await rig.unmount();
  });

  it('should visually show the suggestions display when / is typed', async () => {
    // Initially should not have suggestions
    expect(rig).not.toVisuallyContain(SuggestionsDisplay.name);

    // Type '/' to trigger suggestions
    await rig.type('/');

    // Wait for SuggestionsDisplay to appear (Automatic lookup!)
    await rig.waitForComponent(SuggestionsDisplay.name);

    // Assert that the component is now present in the tree
    expect(rig).toVisuallyContain(SuggestionsDisplay.name);

    // Also verify text for sanity
    expect(rig.lastFrame).toContain('about');

    // Capture the state for manual inspection if needed
    await expect(rig).toMatchSvgSnapshot({ name: 'suggestions-opened' });
  });
});
