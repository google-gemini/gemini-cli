/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { UpdateNotification } from './UpdateNotification.js';
import { describe, it, expect } from 'vitest';

describe('UpdateNotification', () => {
  it('renders message', async () => {
    const { lastFrame, waitUntilReady, unmount } = render(
      <UpdateNotification message="Update available!" />,
    );
    await waitUntilReady();
    expect(lastFrame()).toContain('Update available!');
    unmount();
  });
});
