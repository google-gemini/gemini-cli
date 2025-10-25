/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { checkInput, tryParseJSON, parseOrRaw } from './jsonoutput.js';

describe('check tools output', () => {
  it('accepts object-like JSON strings', () => {
    const testJSON = '{"a":1, "b": 2}';
    expect(checkInput(testJSON)).toBeTruthy();
  });

  it('accepts array JSON strings', () => {
    expect(checkInput('[1,2,3]')).toBeTruthy();
  });

  it('rejects primitive strings/plaintext strings', () => {
    expect(checkInput('test text')).toBeFalsy();
  });

  it('rejects empty strings', () => {
    expect(checkInput('')).toBeFalsy();
  });

  it('rejects null and undefined', () => {
    expect(checkInput(null)).toBeFalsy();
    expect(checkInput(undefined)).toBeFalsy();
  });

  it('rejects malformed JSON-like strings', () => {
    const malformedJSON = '"a":1,}';

    expect(checkInput(malformedJSON)).toBeFalsy();
  });

  it('rejects mixed text and JSON text strings', () => {
    const testJSON = 'text {"a":1, "b": 2}';
    expect(checkInput(testJSON)).toBeFalsy();
  });

  it('rejects ANSI-tainted input', () => {
    const text = '\u001B[32m{"a":1}\u001B[0m';

    expect(checkInput(text)).toBeFalsy();
  });

  it('accepts JSON with leading/trailing whitespace', () => {
    const testJSON = '  {"a": 1}  ';
    expect(checkInput(testJSON)).toBeTruthy();
  });
});

describe('check parsing json', () => {
  it('returns parsed object for valid JSON', () => {
    const testJSON = '{"a":1, "b": 2}';
    const parsedTestJSON = JSON.parse(testJSON);

    const output = tryParseJSON(testJSON);

    expect(output).toEqual(parsedTestJSON);
  });

  it('returns parsed array for non-empty arrays', () => {
    const testJSON = '[1,2,3]';
    const parsedTestJSON = JSON.parse(testJSON);

    const output = tryParseJSON(testJSON);

    expect(output).toEqual(parsedTestJSON);
  });

  it('returns null for Malformed JSON', () => {
    const text = '{"a":1,}';

    expect(tryParseJSON(text)).toBeFalsy();
  });

  it('returns null for empty arrays', () => {
    const testArr = '[]';

    expect(tryParseJSON(testArr)).toBeFalsy();
  });

  it('returns null for empty objects', () => {
    const testObj = '{}';

    expect(tryParseJSON(testObj)).toBeFalsy();
  });

  it('trims whitespace and parse valid json', () => {
    const text = '\n  { "a": 1 }  \n';
    expect(tryParseJSON(text)).toBeTruthy();
  });

  it('returns null for plaintext', () => {
    const testText = 'test plaintext';

    const output = tryParseJSON(testText);

    expect(output).toBeFalsy();
  });

  it('returns null for null and undefined input', () => {
    expect(tryParseJSON(null)).toBeFalsy();
    expect(tryParseJSON(undefined)).toBeFalsy();
  });

  it('returns parsed object for nested JSON', () => {
    const nestedJSON = '{"a": 1, "b": {"c": 2, "d": [3, 4]}}';
    const parsedJSON = JSON.parse(nestedJSON);
    expect(tryParseJSON(nestedJSON)).toEqual(parsedJSON);
  });
});

describe('parseOrRaw', () => {
  it('pretty prints valid JSON with 2-space indentation', () => {
    const testJSON = '{"a":1, "b": 2}';

    const prettyTestJSON = JSON.stringify(JSON.parse(testJSON), null, 2);

    expect(parseOrRaw(testJSON)).toEqual(prettyTestJSON);
  });

  it('renders original text for non-JSON input', () => {
    const testText = 'plaintext';

    expect(parseOrRaw(testText)).toEqual(testText);
  });

  it('trims whitespace before pretty-printing', () => {
    const text = '\n  { "a": 1 }  \n';
    const prettyTestJSON = JSON.stringify(JSON.parse(text), null, 2);

    expect(parseOrRaw(prettyTestJSON)).toEqual(prettyTestJSON);
  });

  it('returns original text for malformed JSON', () => {
    const malformedJSON = '{"a":1,}';
    expect(parseOrRaw(malformedJSON)).toEqual(malformedJSON);
  });
});
