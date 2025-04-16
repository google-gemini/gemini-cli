import { useState, useRef, useCallback, useEffect } from 'react';
import { useInput } from 'ink';
import { GeminiClient } from '../../core/GeminiClient.js';
import { type Chat, type PartListUnion } from '@google/genai';
import { HistoryItem } from '../types.js';
import { processGeminiStream } from '../../core/geminiStreamProcessor.js';
import { StreamingState } from '../../core/StreamingState.js';

const addHistoryItem = (
    setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>,
    itemData: Omit<HistoryItem, 'id'>,
    id: number
) => {
    setHistory((prevHistory) => [
        ...prevHistory,
        { ...itemData, id } as HistoryItem,
    ]);
};

export const useGeminiStream = (
    setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>,
) => {
    const [streamingState, setStreamingState] = useState<StreamingState>(StreamingState.Idle);
    const [initError, setInitError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const currentToolGroupIdRef = useRef<number | null>(null);
    const chatSessionRef = useRef<Chat | null>(null);
    const geminiClientRef = useRef<GeminiClient | null>(null);
    const messageIdCounterRef = useRef(0);

    // Initialize Client Effect (remains the same)
    useEffect(() => {
        setInitError(null);
        if (!geminiClientRef.current) {
            try {
                geminiClientRef.current = new GeminiClient();
            } catch (error: any) {
                setInitError(`Failed to initialize client: ${error.message || 'Unknown error'}`);
            }
        }
    }, []);

    // Input Handling Effect (remains the same)
    useInput((input, key) => {
        if (streamingState === StreamingState.Responding && key.escape) {
            abortControllerRef.current?.abort();
        }
    });

    // ID Generation Callback (remains the same)
    const getNextMessageId = useCallback((baseTimestamp: number): number => {
        messageIdCounterRef.current += 1;
        return baseTimestamp + messageIdCounterRef.current;
    }, []);

    // Submit Query Callback (updated to call processGeminiStream)
    const submitQuery = useCallback(async (query: PartListUnion) => {
        if (streamingState === StreamingState.Responding) {
            // No-op if already going.
            return;
        }

        if (typeof query === 'string' && query.toString().trim().length === 0) {
            return;
        }

        const userMessageTimestamp = Date.now();
        const client = geminiClientRef.current;
        if (!client) {
            setInitError("Gemini client is not available.");
            return;
        }

        if (!chatSessionRef.current) {
            chatSessionRef.current = await client.startChat();
        }

        // Reset state
        setStreamingState(StreamingState.Responding);
        setInitError(null);
        currentToolGroupIdRef.current = null;
        messageIdCounterRef.current = 0;
        const chat = chatSessionRef.current;

        try {
            // Add user message
            if (typeof query === 'string') {
                const trimmedQuery = query.toString();
                addHistoryItem(setHistory, { type: 'user', text: trimmedQuery }, userMessageTimestamp);
            } else if (
                // HACK to detect errored function responses.
                typeof query === 'object' &&
                query !== null &&
                !Array.isArray(query) && // Ensure it's a single Part object
                'functionResponse' in query && // Check if it's a function response Part
                query.functionResponse?.response && // Check if response object exists
                'error' in query.functionResponse.response // Check specifically for the 'error' key
            ) {
                const history = chat.getHistory();
                history.push({ role: 'user', parts: [query] });
                return;
            }

            // Prepare for streaming
            abortControllerRef.current = new AbortController();
            const signal = abortControllerRef.current.signal;

            // --- Delegate to Stream Processor ---

            const stream = client.sendMessageStream(chat, query, signal);

            const addHistoryItemFromStream = (itemData: Omit<HistoryItem, 'id'>, id: number) => {
                addHistoryItem(setHistory, itemData, id);
            };
            const getStreamMessageId = () => getNextMessageId(userMessageTimestamp);

            // Call the renamed processor function
            await processGeminiStream({
                stream,
                signal,
                setHistory,
                submitQuery,
                getNextMessageId: getStreamMessageId,
                addHistoryItem: addHistoryItemFromStream,
                currentToolGroupIdRef,
            });
        } catch (error: any) {
            // (Error handling for stream initiation remains the same)
            console.error("Error initiating stream:", error);
            if (error.name !== 'AbortError') {
                // Use historyUpdater's function potentially? Or keep addHistoryItem here?
                // Keeping addHistoryItem here for direct errors from this scope.
                addHistoryItem(setHistory, { type: 'error', text: `[Error starting stream: ${error.message}]` }, getNextMessageId(userMessageTimestamp));
            }
        } finally {
            abortControllerRef.current = null;
            setStreamingState(StreamingState.Idle);
        }
    }, [setStreamingState, setHistory, initError, getNextMessageId]);

    return { streamingState, submitQuery, initError };
};
