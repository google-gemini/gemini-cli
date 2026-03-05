/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect } from 'vitest';
import { AudioWaveform } from './AudioWaveform.js';

describe('<AudioWaveform />', () => {
    it('renders nothing when idle', async () => {
        const { lastFrame, waitUntilReady } = render(
            <AudioWaveform state="idle" />,
        );
        await waitUntilReady();
        expect(lastFrame({ allowEmpty: true })).toBe('');
    });

    it('renders error state correctly', async () => {
        const { lastFrame, waitUntilReady } = render(
            <AudioWaveform state="error" width={20} />,
        );
        await waitUntilReady();
        expect(lastFrame()).toContain('Voice session error');
    });

    it('renders processing state as static bars', async () => {
        const { lastFrame, waitUntilReady } = render(
            <AudioWaveform state="processing" width={5} />,
        );
        await waitUntilReady();
        expect(lastFrame()).toContain('▅▅▅▅▅');
    });

    it('renders listening state with mapped amplitudes', async () => {
        const { lastFrame, waitUntilReady } = render(
            <AudioWaveform state="listening" amplitudes={[0, 0.5, 1]} width={3} />,
        );
        await waitUntilReady();
        expect(lastFrame()).toMatchSnapshot();
    });

    it('renders speaking state and truncates/resamples when width does not match amplitudes', async () => {
        const { lastFrame, waitUntilReady } = render(
            <AudioWaveform state="speaking" amplitudes={[1, 0, 1]} width={6} />,
        );
        await waitUntilReady();
        expect(lastFrame()).toMatchSnapshot();
    });

    it('renders empty amplitudes with empty bars correctly', async () => {
        const { lastFrame, waitUntilReady } = render(
            <AudioWaveform state="speaking" amplitudes={[]} width={5} />,
        );
        await waitUntilReady();
        expect(lastFrame()).toMatchSnapshot();
    });
});
