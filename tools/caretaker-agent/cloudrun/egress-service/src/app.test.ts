/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from './app.js';
import * as githubActions from './actions/github.js';

vi.mock('./actions/github.js', () => ({
  handleEgressEvent: vi.fn(),
}));

/**
 * Helper function simulating GCP Cloud Pub/Sub HTTP Push message wrapper.
 * Encodes the payload object into Base64 format inside message.data.
 */
function createPubSubPushEnvelope(payload: unknown): {
  message: { data: string };
} {
  const jsonString =
    typeof payload === 'string' ? payload : JSON.stringify(payload);
  const base64Data = Buffer.from(jsonString).toString('base64');
  return { message: { data: base64Data } };
}

describe('Egress Service App Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET / should return 200 OK with structured health debug info', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'healthy',
      service: 'caretaker-egress-service',
      revision: 'local',
    });
  });

  it('POST / should return 400 if Pub/Sub envelope is invalid', async () => {
    const res = await request(app).post('/').send('not a json object');
    expect(res.status).toBe(400);
  });

  it('POST / should return 400 if message.data is missing', async () => {
    const res = await request(app).post('/').send({ message: {} });
    expect(res.status).toBe(400);
    expect(res.text).toBe('Missing message.data');
  });

  it('POST / should return 400 if message.data is invalid JSON', async () => {
    const invalidEnvelope = createPubSubPushEnvelope('invalid-raw-json-string');
    const res = await request(app).post('/').send(invalidEnvelope);
    expect(res.status).toBe(400);
    expect(res.text).toBe('Malformed payload: invalid JSON');
  });

  it('POST / should return 400 if egress payload is missing required fields', async () => {
    const incompleteEvent = { action: 'COMMENT', payload: { owner: 'google' } };
    const res = await request(app)
      .post('/')
      .send(createPubSubPushEnvelope(incompleteEvent));
    expect(res.status).toBe(400);
    expect(res.text).toContain('Malformed payload');
  });

  it('POST / should trigger handleEgressEvent and return 200 for valid payloads', async () => {
    const validEvent = {
      action: 'COMMENT',
      payload: {
        owner: 'google-gemini',
        repo: 'gemini-cli',
        issueNumber: 100,
        commentBody: 'Test comment',
      },
    };

    vi.mocked(githubActions.handleEgressEvent).mockResolvedValueOnce();

    const res = await request(app)
      .post('/')
      .send(createPubSubPushEnvelope(validEvent));

    expect(res.status).toBe(200);
    expect(res.text).toBe('OK');
    expect(githubActions.handleEgressEvent).toHaveBeenCalledWith(validEvent);
  });

  it('POST / should return 500 if handleEgressEvent fails', async () => {
    const validEvent = {
      action: 'LABEL',
      payload: {
        owner: 'google-gemini',
        repo: 'gemini-cli',
        issueNumber: 42,
        labels: ['bug'],
      },
    };

    vi.mocked(githubActions.handleEgressEvent).mockRejectedValueOnce(
      new Error('GitHub API Error'),
    );

    // Suppress console.error during expected failure test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app)
      .post('/')
      .send(createPubSubPushEnvelope(validEvent));

    expect(res.status).toBe(500);
    expect(res.text).toBe('GitHub API Error');

    consoleSpy.mockRestore();
  });
});
