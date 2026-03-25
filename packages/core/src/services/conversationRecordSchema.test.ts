/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { Language, Outcome } from '@google/genai';
import { CoreToolCallStatus } from '../scheduler/types.js';
import { conversationRecordSchema } from './conversationRecordSchema.js';

describe('conversationRecordSchema', () => {
	const validRecord = {
		sessionId: 'session-123',
		projectHash: 'project-hash-abc',
		startTime: '2026-01-01T00:00:00.000Z',
		lastUpdated: '2026-01-01T00:01:00.000Z',
		kind: 'main' as const,
		directories: ['C:/repo'],
		summary: 'Test conversation summary',
		messages: [
			{
				id: 'msg-1',
				timestamp: '2026-01-01T00:00:01.000Z',
				type: 'user' as const,
				content: 'Hello',
				displayContent: 'Hello',
			},
			{
				id: 'msg-2',
				timestamp: '2026-01-01T00:00:10.000Z',
				type: 'gemini' as const,
				model: 'gemini-3-pro-preview',
				content: [
					{
						text: 'Working on it.',
					},
					{
						functionCall: {
							name: 'read_file',
							id: 'call-1',
							args: {
								filePath: 'src/index.ts',
							},
						},
					},
					{
						executableCode: {
							code: 'console.log(1)',
							language: Language.PYTHON,
						},
					},
					{
						codeExecutionResult: {
							outcome: Outcome.OUTCOME_OK,
							output: '1',
						},
					},
					{
						functionResponse: {
							name: 'read_file',
							response: {
								content: 'file-body',
							},
							parts: [
								'done',
								{
									text: 'ok',
								},
							],
						},
					},
				],
				thoughts: [
					{
						subject: 'Plan',
						description: 'Inspecting files first.',
						timestamp: '2026-01-01T00:00:09.000Z',
					},
				],
				tokens: {
					input: 10,
					output: 20,
					cached: 5,
					thoughts: 3,
					tool: 2,
					total: 40,
				},
				toolCalls: [
					{
						id: 'tool-1',
						name: 'read_file',
						args: {
							filePath: 'src/index.ts',
						},
						result: {
							text: 'export const x = 1;',
						},
						status: CoreToolCallStatus.Success,
						timestamp: '2026-01-01T00:00:11.000Z',
						displayName: 'Read File',
						description: 'Reads file content',
						renderOutputAsMarkdown: false,
						resultDisplay: {
							fileDiff: '@@ -1 +1 @@',
							fileName: 'index.ts',
							filePath: 'src/index.ts',
							originalContent: 'export const x = 0;',
							newContent: 'export const x = 1;',
							diffStat: {
								model_added_lines: 1,
								model_removed_lines: 1,
								model_added_chars: 17,
								model_removed_chars: 17,
								user_added_lines: 0,
								user_removed_lines: 0,
								user_added_chars: 0,
								user_removed_chars: 0,
							},
							isNewFile: false,
						},
					},
				],
			},
		],
	};

	it('parses a fully valid conversation record', () => {
		const parsed = conversationRecordSchema.parse(validRecord);
		expect(parsed.sessionId).toBe(validRecord.sessionId);
		expect(parsed.messages).toHaveLength(2);
		expect(parsed.messages[1].type).toBe('gemini');
	});

	it('rejects a missing required top-level field', () => {
		const invalidRecord = {
			...validRecord,
		} as Record<string, unknown>;
		delete invalidRecord['sessionId'];

		const result = conversationRecordSchema.safeParse(invalidRecord);
		expect(result.success).toBe(false);
		if (!result.success) {
			const hasSessionIdIssue = result.error.issues.some(
				(issue) => issue.path.join('.') === 'sessionId',
			);
			expect(hasSessionIdIssue).toBe(true);
		}
	});

	it('rejects incorrect nested scalar types', () => {
		const invalidRecord = {
			...validRecord,
			messages: [
				validRecord.messages[0],
				{
					...validRecord.messages[1],
					tokens: {
						...(validRecord.messages[1] as { tokens: Record<string, unknown> })
							.tokens,
						total: 'forty',
					},
				},
			],
		};

		const result = conversationRecordSchema.safeParse(invalidRecord);
		expect(result.success).toBe(false);
		if (!result.success) {
			const hasTotalTypeIssue = result.error.issues.some(
				(issue) => issue.path.join('.') === 'messages.1.tokens.total',
			);
			expect(hasTotalTypeIssue).toBe(true);
		}
	});

	it('rejects invalid message and tool status discriminator values', () => {
		const invalidRecord = {
			...validRecord,
			messages: [
				{
					...validRecord.messages[0],
					type: 'assistant',
				},
				validRecord.messages[1],
			],
		};

		const result = conversationRecordSchema.safeParse(invalidRecord);
		expect(result.success).toBe(false);
	});

	it('rejects malformed tool call payloads and resultDisplay shapes', () => {
		const invalidRecord = {
			...validRecord,
			messages: [
				validRecord.messages[0],
				{
					...validRecord.messages[1],
					toolCalls: [
						{
							...(validRecord.messages[1] as { toolCalls: Array<Record<string, unknown>> })
								.toolCalls[0],
							args: 'not-an-object',
							resultDisplay: {
								fileDiff: '@@ -1 +1 @@',
								fileName: 'index.ts',
								originalContent: null,
								newContent: 'new content',
							},
						},
					],
				},
			],
		};

		const result = conversationRecordSchema.safeParse(invalidRecord);
		expect(result.success).toBe(false);
	});

	it('rejects malformed PartListUnion variants', () => {
		const invalidRecord = {
			...validRecord,
			messages: [
				{
					...validRecord.messages[0],
					content: {
						thought: true,
					},
				},
				validRecord.messages[1],
			],
		};

		const result = conversationRecordSchema.safeParse(invalidRecord);
		expect(result.success).toBe(false);
	});

	it('allows nullable fields where explicitly nullable', () => {
		const nullableRecord = {
			...validRecord,
			messages: [
				validRecord.messages[0],
				{
					...validRecord.messages[1],
					tokens: null,
					toolCalls: [
						{
							...(validRecord.messages[1] as { toolCalls: Array<Record<string, unknown>> })
								.toolCalls[0],
							result: null,
						},
					],
				},
			],
		};

		const parsed = conversationRecordSchema.parse(nullableRecord);
		expect(parsed.messages[1].type).toBe('gemini');
		if (parsed.messages[1].type === 'gemini') {
			expect(parsed.messages[1].tokens).toBeNull();
			expect(parsed.messages[1].toolCalls?.[0]?.result).toBeNull();
		}
	});

	it('rejects unknown fields on strict objects', () => {
		const invalidRecord = {
			...validRecord,
			unexpectedTopLevel: true,
		};

		const result = conversationRecordSchema.safeParse(invalidRecord);
		expect(result.success).toBe(false);
		if (!result.success) {
			const hasStrictIssue = result.error.issues.some(
				(issue) => issue.code === 'unrecognized_keys',
			);
			expect(hasStrictIssue).toBe(true);
		}
	});
});
