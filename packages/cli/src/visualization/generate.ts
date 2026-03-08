import { MessageType } from '../ui/types.js';
import type { CommandContext } from '../ui/commands/types.js';
import { LlmRole } from '@google/gemini-cli-core';

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

        const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;

        // Basic cleaning: remove markdown backticks if Gemini ignored the instruction
        let cleaned = responseText?.trim() || '';
        if (cleaned.startsWith('```mermaid')) {
            cleaned = cleaned.replace(/^```mermaid\n?/, '').replace(/\n?```$/, '');
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }

        return cleaned || null;
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

        const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;

        // Basic cleaning: remove markdown backticks if Gemini ignored the instruction
        let cleaned = responseText?.trim() || '';
        if (cleaned.startsWith('```html')) {
            cleaned = cleaned.replace(/^```html\n?/, '').replace(/\n?```$/, '');
        } else if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
        }

        return cleaned || null;
    } catch (error) {
        await context.services.logger.initialize();
        await context.services.logger.logMessage('user' as any, `Generation error: ${error}`);
        return null;
    } finally {
        context.ui.setPendingItem(null);
    }
}
