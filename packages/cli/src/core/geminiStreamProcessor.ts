import { Part } from '@google/genai';
import { HistoryItem } from '../ui/types.js';
import { GeminiEventType, GeminiStream } from './GeminiStream.js';
import { handleToolCallChunk, addErrorMessageToHistory } from './historyUpdater.js';

interface StreamProcessorParams {
    stream: GeminiStream;
    signal: AbortSignal;
    setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>;
    submitQuery: (query: Part) => Promise<void>,
    getNextMessageId: () => number;
    addHistoryItem: (itemData: Omit<HistoryItem, 'id'>, id: number) => void;
    currentToolGroupIdRef: React.MutableRefObject<number | null>;
}

/**
 * Processes the Gemini stream, managing text buffering, adaptive rendering,
 * and delegating history updates for tool calls and errors.
 */
export const processGeminiStream = async ({ // Renamed function for clarity
    stream,
    signal,
    setHistory,
    submitQuery,
    getNextMessageId,
    addHistoryItem,
    currentToolGroupIdRef,
}: StreamProcessorParams): Promise<void> => {
    // --- State specific to this stream processing invocation ---
    let textBuffer = '';
    let renderTimeoutId: NodeJS.Timeout | null = null;
    let isStreamComplete = false;
    let currentGeminiMessageId: number | null = null;

    const render = (content: string) => {
        if (currentGeminiMessageId === null) {
            return;
        }
        setHistory(prev => prev.map(item =>
            item.id === currentGeminiMessageId && item.type === 'gemini'
                ? { ...item, text: (item.text ?? '') + content }
                : item
        ));
    }
    // --- Adaptive Rendering Logic (nested) ---
    const renderBufferedText = () => {
        if (signal.aborted) {
            if (renderTimeoutId) clearTimeout(renderTimeoutId);
            renderTimeoutId = null;
            return;
        }

        const bufferLength = textBuffer.length;
        let chunkSize = 0;
        let delay = 50;

        if (bufferLength > 150) {
            chunkSize = Math.min(bufferLength, 30); delay = 5;
        } else if (bufferLength > 30) {
            chunkSize = Math.min(bufferLength, 10); delay = 10;
        } else if (bufferLength > 0) {
            chunkSize = 2; delay = 20;
        }

        if (chunkSize > 0) {
            const chunkToRender = textBuffer.substring(0, chunkSize);
            textBuffer = textBuffer.substring(chunkSize);
            render(chunkToRender);

            renderTimeoutId = setTimeout(renderBufferedText, delay);
        } else {
            renderTimeoutId = null; // Clear timeout ID if nothing to render
            if (!isStreamComplete) {
                // Buffer empty, but stream might still send data, check again later
                renderTimeoutId = setTimeout(renderBufferedText, 50);
            }
        }
    };

    const scheduleRender = () => {
        if (renderTimeoutId === null) {
            renderTimeoutId = setTimeout(renderBufferedText, 0);
        }
    };

    // --- Stream Processing Loop ---
    try {
        for await (const chunk of stream) {
            if (signal.aborted) break;

            if (chunk.type === GeminiEventType.Content) {
                currentToolGroupIdRef.current = null; // Reset tool group on text

                if (currentGeminiMessageId === null) {
                    currentGeminiMessageId = getNextMessageId();
                    addHistoryItem({ type: 'gemini', text: '' }, currentGeminiMessageId);
                    textBuffer = '';
                }
                textBuffer += chunk.value;
                scheduleRender();

            } else if (chunk.type === GeminiEventType.ToolCallInfo) {
                if (renderTimeoutId) { // Stop rendering loop
                    clearTimeout(renderTimeoutId);
                    renderTimeoutId = null;
                }
                
                // Flush any text buffer content.
                render(textBuffer);
                currentGeminiMessageId = null; // End text message context
                textBuffer = ''; // Clear buffer

                // Delegate history update for tool call
                handleToolCallChunk(
                    chunk.value,
                    setHistory,
                    submitQuery,
                    getNextMessageId,
                    currentToolGroupIdRef
                );
            }
        }
        if (signal.aborted) {
            throw new Error("Request cancelled by user");
        }
    } catch (error: any) {
        if (renderTimeoutId) { // Ensure render loop stops on error
            clearTimeout(renderTimeoutId);
            renderTimeoutId = null;
        }
        // Delegate history update for error message
        addErrorMessageToHistory(error, setHistory, getNextMessageId);
    } finally {
        isStreamComplete = true; // Signal stream end for render loop completion
        if (renderTimeoutId) {
            clearTimeout(renderTimeoutId);
            renderTimeoutId = null;
        }

        renderBufferedText(); // Force final render
    }
};