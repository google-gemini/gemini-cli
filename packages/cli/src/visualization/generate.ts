import { MessageType } from '../ui/types.js';
import type { CommandContext } from '../ui/commands/types.js';
import { LlmRole, getResponseText } from '@google/gemini-cli-core';

const MERMAID_ROOT_KEYWORDS = [
    'flowchart',
    'graph',
    'sequenceDiagram',
    'classDiagram',
    'stateDiagram',
    'stateDiagram-v2',
    'erDiagram',
    'journey',
    'gantt',
    'pie',
    'mindmap',
    'timeline',
    'quadrantChart',
    'requirementDiagram',
    'gitGraph',
    'block-beta',
    'packet',
    'C4Context',
    'C4Container',
    'C4Component',
    'C4Dynamic',
    'C4Deployment',
] as const;

function extractCodeFence(text: string, preferredLanguage?: string): string | null {
    const fenceRe = /```([a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g;
    let fallback: string | null = null;

    for (const match of text.matchAll(fenceRe)) {
        const lang = (match[1] ?? '').trim().toLowerCase();
        const body = (match[2] ?? '').trim();
        if (!body) continue;

        if (
            preferredLanguage &&
            lang.length > 0 &&
            lang === preferredLanguage.toLowerCase()
        ) {
            return body;
        }

        if (!fallback) {
            fallback = body;
        }
    }

    return fallback;
}

function stripOuterCodeFence(text: string): string {
    const trimmed = text.trim();
    if (!trimmed.startsWith('```') || !trimmed.endsWith('```')) {
        return trimmed;
    }

    const lines = trimmed.split(/\r?\n/);
    if (lines.length < 2) {
        return trimmed;
    }

    const first = lines[0]?.trim() ?? '';
    const last = lines[lines.length - 1]?.trim() ?? '';

    if (!first.startsWith('```') || last !== '```') {
        return trimmed;
    }

    return lines.slice(1, -1).join('\n').trim();
}

function isMermaidRoot(line: string): boolean {
    const normalized = line.trim();
    return MERMAID_ROOT_KEYWORDS.some((keyword) =>
        normalized.startsWith(keyword),
    );
}

function isLikelyMermaidSpec(spec: string): boolean {
    const nonEmptyLines = spec
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (nonEmptyLines.length === 0) {
        return false;
    }

    const first = nonEmptyLines[0] ?? '';
    if (first.startsWith('%%{init:')) {
        const firstDiagramLine = nonEmptyLines.find((line) => isMermaidRoot(line));
        return typeof firstDiagramLine === 'string';
    }

    return isMermaidRoot(first);
}

function normalizeMermaidSpec(rawText: string): string {
    let cleaned = rawText.trim();
    if (!cleaned) {
        return '';
    }

    const fenced = extractCodeFence(cleaned, 'mermaid');
    if (fenced) {
        cleaned = fenced;
    } else {
        cleaned = stripOuterCodeFence(cleaned);
    }

    const lines = cleaned.split(/\r?\n/);
    const firstRelevant = lines.findIndex((line) => {
        const trimmed = line.trim();
        return trimmed.startsWith('%%{init:') || isMermaidRoot(trimmed);
    });

    if (firstRelevant > 0) {
        cleaned = lines.slice(firstRelevant).join('\n').trim();
    }

    return cleaned;
}

function normalizeGenericGeneratedCode(rawText: string, preferredLanguage?: string): string {
    const trimmed = rawText.trim();
    if (!trimmed) {
        return '';
    }

    const fenced = extractCodeFence(trimmed, preferredLanguage);
    if (fenced) {
        return fenced.trim();
    }

    return stripOuterCodeFence(trimmed);
}

const SYSTEM_PROMPT = `You are a Mermaid.js diagram expert. 
Your goal is to translate the user's request into a valid Mermaid.js diagram.
Follow these rules:
1. Output ONLY the raw Mermaid.js code. 
2. Do NOT include markdown backticks (\`\`\`mermaid).
3. Do NOT include any explanations or other text.
4. If the user's request is vague, choose the most appropriate diagram type (Sequence, Flowchart, ERD, Class, or State).
5. Ensure the syntax is compatible with Mermaid.js latest version.`;

/**
 * Generates Mermaid.js code from a natural language prompt.
 */
export async function generateMermaid(
    context: CommandContext,
    prompt: string,
): Promise<string | null> {
    const client = context.services.config?.getGeminiClient();
    if (!client) {
        throw new Error('Gemini client not initialized.');
    }

    context.ui.setPendingItem({
        type: MessageType.INFO,
        text: `Generating diagram for: "${prompt}"...`,
    });

    try {
        const response = await client.generateContent(
            { model: 'auto', isChatModel: true }, // Use default chat model
            [
                {
                    role: 'user',
                    parts: [
                        { text: `System Instruction: ${SYSTEM_PROMPT}` },
                        { text: prompt }
                    ]
                }
            ],
            new AbortController().signal,
            LlmRole.MAIN,
        );

        const responseText = getResponseText(response) ?? '';
        const cleaned = normalizeMermaidSpec(responseText);

        if (!cleaned) {
            return null;
        }

        // If the model returned prose + Mermaid, this trims to the Mermaid section.
        // If it returned pure prose, the renderer now surfaces a syntax error and
        // the command falls back to ASCII instead of caching Mermaid's error image.
        if (isLikelyMermaidSpec(cleaned)) {
            return cleaned;
        }

        return cleaned;
    } catch (error) {
        await context.services.logger.initialize();
        // Log to debug logger since core logger has no error method
        await context.services.logger.logMessage('user' as any, `Generation error: ${error}`);
        return null;
    } finally {
        context.ui.setPendingItem(null);
    }
}

const HTML_SYSTEM_PROMPT = `You are a web development expert. 
Your goal is to translate the user's request into a valid, standalone HTML and CSS snippet.
Use Tailwind CSS classes for styling (assume Tailwind is available via CDN).
Follow these rules:
1. Output ONLY the raw HTML/CSS code. 
2. Do NOT include markdown backticks (\`\`\`html).
3. Do NOT include any explanations or other text.
4. Ensure the design is modern, responsive, and visually appealing.
5. If the request is for a React component, translate it into standard HTML/Tailwind.`;

/**
 * Generates HTML/Tailwind code from a natural language prompt.
 */
export async function generateHtml(
    context: CommandContext,
    prompt: string,
): Promise<string | null> {
    const client = context.services.config?.getGeminiClient();
    if (!client) {
        throw new Error('Gemini client not initialized.');
    }

    context.ui.setPendingItem({
        type: MessageType.INFO,
        text: `Generating preview for: "${prompt}"...`,
    });

    try {
        const response = await client.generateContent(
            { model: 'auto', isChatModel: true }, // Use default chat model
            [
                {
                    role: 'user',
                    parts: [
                        { text: `System Instruction: ${HTML_SYSTEM_PROMPT}` },
                        { text: prompt }
                    ]
                }
            ],
            new AbortController().signal,
            LlmRole.MAIN,
        );

        const responseText = getResponseText(response) ?? '';
        const cleaned = normalizeGenericGeneratedCode(responseText, 'html');

        return cleaned || null;
    } catch (error) {
        await context.services.logger.initialize();
        await context.services.logger.logMessage('user' as any, `Generation error: ${error}`);
        return null;
    } finally {
        context.ui.setPendingItem(null);
    }
}
